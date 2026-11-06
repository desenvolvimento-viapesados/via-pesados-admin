import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Loader2, AlertTriangle, Plus, Pencil, Trash2, Check, X, MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Panel, SectionHeader, EmptyState } from '@/components/admin/ui';
import { useTeam } from '@/hooks/useAdmin';
import {
  MODOS, ROTULO_DO_MODO, dentroDoHorario, telefoneDeTeste,
  useAssistenteConfig, useSalvarConfig, useStatusDoAssistente, useGastoHoje,
  useFatos, useSalvarFato, useApagarFato, useConversasAtendidas, useRascunhosEsperando,
  useTempoRealDoAssistente,
  type AssistenteConfig, type AssistenteFato, type Modo, type MudancaNaConfig,
} from '@/hooks/useAssistente';
import { SeloDaEtapa } from './AssistenteNaConversa';

/**
 * A aba Assistente do CRM: o botão geral, o link e a agenda das reuniões,
 * quem recebe, em que modo entra quem responde à prospecção, o teto de gasto,
 * os fatos que ele pode dizer e as conversas que ele atendeu.
 *
 * O modo de cada conversa fica no cabeçalho dela, na aba WhatsApp.
 */

const inputCls =
  'h-9 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[12.5px] text-foreground focus:outline-none focus:border-primary/50 transition-colors';
const rotuloCls = 'text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30';

const DIAS: { n: number; curto: string }[] = [
  { n: 1, curto: 'Seg' }, { n: 2, curto: 'Ter' }, { n: 3, curto: 'Qua' }, { n: 4, curto: 'Qui' },
  { n: 5, curto: 'Sex' }, { n: 6, curto: 'Sáb' }, { n: 7, curto: 'Dom' },
];

const DESCRICAO_DO_MODO_PROSPECCAO: Record<Modo, string> = {
  desligado: 'A conversa fica fixada para você, sem nenhuma mensagem automática.',
  sugere: 'O assistente escreve a resposta e espera você enviar, editar ou descartar.',
  sozinho: 'O assistente responde sozinho, das 08h às 20h, e passa para você quando precisa.',
};

const LINK_OK = /^https:\/\/\S+$/;

const dolar = (v: number) =>
  `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fone = (t: string | null) => {
  if (!t) return '';
  const d = t.replace(/\D/g, '');
  const n = d.startsWith('55') ? d.slice(2) : d;
  return n.length < 10 ? t : `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}`;
};

const quando = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';

/* ── o formulário da configuração ─────────────────────────────── */

type Formulario = {
  link_reuniao: string;
  responsavel_id: string;
  duracao_min: string;
  dias_semana: number[];
  hora_inicio: string;
  hora_fim: string;
  folga_min_horas: string;
  max_reunioes_dia: string;
  modo_prospeccao: Modo;
  teto_usd_dia: string;
  telefones_teste: string;
  preco_mensal: string;
};

const doBanco = (c: AssistenteConfig): Formulario => ({
  link_reuniao: c.link_reuniao ?? '',
  responsavel_id: c.responsavel_id ?? '',
  duracao_min: String(c.duracao_min ?? 15),
  dias_semana: [...(c.dias_semana ?? [])].sort(),
  hora_inicio: c.hora_inicio,
  hora_fim: c.hora_fim,
  folga_min_horas: String(c.folga_min_horas ?? 2),
  max_reunioes_dia: String(c.max_reunioes_dia ?? 6),
  modo_prospeccao: c.modo_prospeccao,
  teto_usd_dia: String(Number(c.teto_usd_dia) || 0),
  telefones_teste: (c.telefones_teste ?? []).map(fone).join(', '),
  preco_mensal: c.preco_mensal == null ? '' : String(c.preco_mensal),
});

/** "(27) 99724-6060, 33 98814-4005" → ['5527997246060', '5533988144005'], ou o pedaço que não é telefone. */
function lerNumerosDeTeste(texto: string): { numeros: string[]; invalido: string | null } {
  const numeros: string[] = [];
  for (const pedaco of texto.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const n = telefoneDeTeste(pedaco);
    if (!n) return { numeros, invalido: pedaco };
    if (!numeros.includes(n)) numeros.push(n);
  }
  return { numeros, invalido: null };
}

/** O que mudou, já no formato da tabela. Devolve erro em português se algo não vale. */
function mudancas(f: Formulario, c: AssistenteConfig): { mudanca: MudancaNaConfig; erro: string | null } {
  const m: MudancaNaConfig = {};
  const link = f.link_reuniao.trim();
  if (link && !LINK_OK.test(link)) return { mudanca: m, erro: 'O link da reunião precisa começar com https:// e não pode ter espaço.' };
  const duracao = Number(f.duracao_min), folga = Number(f.folga_min_horas), teto = Number(f.max_reunioes_dia);
  const gasto = Number(String(f.teto_usd_dia).replace(',', '.'));
  if (!Number.isInteger(duracao) || duracao < 5 || duracao > 120) return { mudanca: m, erro: 'A reunião precisa ter entre 5 e 120 minutos.' };
  if (!Number.isInteger(folga) || folga < 0 || folga > 72) return { mudanca: m, erro: 'A folga mínima vai de 0 a 72 horas.' };
  if (!Number.isInteger(teto) || teto < 1 || teto > 30) return { mudanca: m, erro: 'O teto por dia vai de 1 a 30 reuniões.' };
  if (!Number.isFinite(gasto) || gasto < 0) return { mudanca: m, erro: 'O teto de gasto precisa ser um valor de 0 para cima.' };
  if (!f.dias_semana.length) return { mudanca: m, erro: 'Escolha pelo menos um dia para as reuniões.' };
  if (!f.hora_inicio || !f.hora_fim || f.hora_fim <= f.hora_inicio) return { mudanca: m, erro: 'O fim do expediente precisa ser depois do começo.' };
  const teste = lerNumerosDeTeste(f.telefones_teste);
  if (teste.invalido) return { mudanca: m, erro: `"${teste.invalido}" não é um telefone com DDD.` };
  if (teste.numeros.length > 10) return { mudanca: m, erro: 'No máximo 10 números de teste.' };

  if ((link || null) !== (c.link_reuniao ?? null)) m.link_reuniao = link || null;
  if ((f.responsavel_id || null) !== (c.responsavel_id ?? null)) m.responsavel_id = f.responsavel_id || null;
  if (duracao !== c.duracao_min) m.duracao_min = duracao;
  if (JSON.stringify(f.dias_semana) !== JSON.stringify([...c.dias_semana].sort())) m.dias_semana = f.dias_semana;
  if (f.hora_inicio !== c.hora_inicio) m.hora_inicio = f.hora_inicio;
  if (f.hora_fim !== c.hora_fim) m.hora_fim = f.hora_fim;
  if (folga !== c.folga_min_horas) m.folga_min_horas = folga;
  if (teto !== c.max_reunioes_dia) m.max_reunioes_dia = teto;
  if (f.modo_prospeccao !== c.modo_prospeccao) m.modo_prospeccao = f.modo_prospeccao;
  if (gasto !== Number(c.teto_usd_dia)) m.teto_usd_dia = gasto;
  if (JSON.stringify(teste.numeros) !== JSON.stringify(c.telefones_teste ?? [])) m.telefones_teste = teste.numeros;
  const precoTxt = f.preco_mensal.trim().replace(/[^\d,.]/g, '').replace(',', '.');
  const preco = precoTxt ? Number(precoTxt) : null;
  if (preco !== null && (!Number.isFinite(preco) || preco <= 0)) return { mudanca: m, erro: 'O valor por mês precisa ser maior que zero (ou vazio).' };
  if (preco !== (c.preco_mensal ?? null)) m.preco_mensal = preco;
  return { mudanca: m, erro: null };
}

/* ── painel geral ─────────────────────────────────────────────── */

function PainelGeral({ config }: { config: AssistenteConfig }) {
  const salvar = useSalvarConfig();
  const { data: status, isError: statusFalhou } = useStatusDoAssistente();
  const { data: gasto = 0 } = useGastoHoje();
  const teto = Number(config.teto_usd_dia) || 0;

  const avisos: string[] = [];
  if (config.pausado_motivo) avisos.push(config.pausado_motivo);
  if (status && !status.chave_ia) avisos.push('Falta a chave da IA no painel: o assistente não consegue responder.');
  if (status && !status.chave_transcricao) avisos.push('Falta a chave de transcrição: áudio não será entendido.');
  if (!config.link_reuniao) avisos.push('Falta o link da reunião: sem ele o assistente não marca e passa a conversa para você.');
  if (!config.responsavel_id) avisos.push('Falta escolher quem recebe as reuniões.');
  if (teto > 0 && gasto >= teto) avisos.push('O gasto de hoje chegou no teto: o assistente parou até amanhã ou até você subir o teto.');
  if (teto === 0) avisos.push('O teto de gasto está em zero: o assistente não responde ninguém.');

  const ligar = async (v: boolean) => {
    try {
      await salvar.mutateAsync({ ligado: v });
      toast.success(v ? 'Assistente ligado. Ele atende as conversas em que você deixou ligado.' : 'Assistente desligado. Nada sai.');
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Panel className="p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center',
          config.ligado ? 'bg-primary/15 text-primary' : 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/35')}>
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-foreground">Assistente de vendas</p>
          <p className="text-[11.5px] text-foreground/45">
            {config.ligado
              ? (dentroDoHorario()
                ? 'Ligado. Atende das 08h às 20h as conversas em que está ligado.'
                : 'Ligado, fora do horário. Às 08h responde quem escreveu à noite, se ainda não passaram 24 horas.')
              : 'Desligado. Nenhuma mensagem nem rascunho sai, em conversa nenhuma.'}
          </p>
        </div>
        <label className="ml-auto flex items-center gap-2.5 text-[12.5px] font-medium text-foreground/70">
          {config.ligado ? 'Ligado' : 'Desligado'}
          <Switch checked={config.ligado} disabled={salvar.isPending} onCheckedChange={ligar} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className={rotuloCls}>Gasto de hoje</p>
          <p className="text-[20px] font-bold tabular-nums text-foreground leading-8">
            {dolar(gasto)}<span className="text-[12px] font-normal text-foreground/35"> de {dolar(teto)}</span>
          </p>
          <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
            <div className={cn('h-full rounded-full', gasto >= teto ? 'bg-red-500' : 'bg-primary')}
              style={{ width: `${teto > 0 ? Math.min(100, (gasto / teto) * 100) : 100}%` }} />
          </div>
          <p className="text-[10.5px] text-foreground/35">Chegou no teto, ele desliga sozinho e avisa aqui.</p>
        </div>
        <div className="space-y-1 text-[11.5px] text-foreground/45 leading-relaxed">
          <p className={rotuloCls}>Como ele trabalha</p>
          <p>
            É o Davi, atendente virtual do Via Pesados (o "virtual" é o aviso de que é IA). Pergunta da rotina da loja até
            o lojista dizer o que atrapalha, mostra uma coisa do sistema ligada a isso e marca 15 minutos com você. Não fala preço
            nem de teste. Você escreveu na conversa, ele sai dela.
          </p>
        </div>
      </div>

      {statusFalhou && (
        <p className="text-[11.5px] text-foreground/40">Não consegui conferir as chaves agora. Tente abrir a aba de novo em instantes.</p>
      )}

      {avisos.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-2.5 space-y-1">
          {avisos.map((a) => (
            <p key={a} className="flex gap-2 text-[12px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{a}
            </p>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── reunião, agenda, prospecção e teto ───────────────────────── */

function Configuracao({ config }: { config: AssistenteConfig }) {
  const salvar = useSalvarConfig();
  const { data: equipe = [] } = useTeam();
  const [f, setF] = useState<Formulario>(() => doBanco(config));
  /* Quando outra pessoa (ou o próprio salvar) muda a linha, o formulário
     acompanha. */
  useEffect(() => { setF(doBanco(config)); }, [config.atualizado_em]); // eslint-disable-line react-hooks/exhaustive-deps

  const { mudanca, erro } = useMemo(() => mudancas(f, config), [f, config]);
  const sujo = Object.keys(mudanca).length > 0 || JSON.stringify(f) !== JSON.stringify(doBanco(config));
  const ativos = equipe.filter((m) => m.is_active || m.id === config.responsavel_id);

  const muda = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((x) => ({ ...x, [k]: v }));
  const alternarDia = (n: number) =>
    muda('dias_semana', f.dias_semana.includes(n) ? f.dias_semana.filter((d) => d !== n) : [...f.dias_semana, n].sort());

  const gravar = async () => {
    if (erro) { toast.error(erro); return; }
    if (!Object.keys(mudanca).length) { setF(doBanco(config)); return; }
    try {
      await salvar.mutateAsync(mudanca);
      toast.success('Salvo.');
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Panel className="p-5 space-y-6">
      {/* Reunião */}
      <div className="space-y-3">
        <SectionHeader title="A reunião" />
        <div className="grid gap-3 sm:grid-cols-[1fr_220px_120px]">
          <div className="space-y-1.5">
            <p className={rotuloCls}>Link da videochamada</p>
            <input
              className={cn(inputCls, 'w-full', f.link_reuniao.trim() && !LINK_OK.test(f.link_reuniao.trim()) && 'border-red-500/60')}
              placeholder="https://meet.google.com/…"
              value={f.link_reuniao}
              onChange={(e) => muda('link_reuniao', e.target.value)}
            />
            <p className="text-[10.5px] text-foreground/35">O mesmo link para todas. O assistente manda na conversa logo depois de marcar.</p>
          </div>
          <div className="space-y-1.5">
            <p className={rotuloCls}>Quem recebe</p>
            <select className={cn(inputCls, 'w-full')} value={f.responsavel_id} onChange={(e) => muda('responsavel_id', e.target.value)}>
              <option value="">Escolher…</option>
              {ativos.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <p className={rotuloCls}>Duração</p>
            <div className="flex items-center gap-1.5">
              <input type="number" min={5} max={120} className={cn(inputCls, 'w-16 text-center tabular-nums')}
                value={f.duracao_min} onChange={(e) => muda('duracao_min', e.target.value)} />
              <span className="text-[11.5px] text-foreground/45">min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Agenda */}
      <div className="space-y-3">
        <SectionHeader title="Horários que ele oferece" />
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="space-y-1.5">
            <p className={rotuloCls}>Dias</p>
            <div className="flex gap-1">
              {DIAS.map((d) => {
                const on = f.dias_semana.includes(d.n);
                return (
                  <button key={d.n} onClick={() => alternarDia(d.n)}
                    className={cn('h-9 w-11 rounded-xl text-[12px] font-medium border transition-colors',
                      on ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-black/[0.1] dark:border-white/[0.1] text-foreground/40 hover:text-foreground/70')}>
                    {d.curto}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className={rotuloCls}>Das</p>
            <input type="time" step={1800} className={cn(inputCls, 'w-28 tabular-nums')} value={f.hora_inicio} onChange={(e) => muda('hora_inicio', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <p className={rotuloCls}>Até</p>
            <input type="time" step={1800} className={cn(inputCls, 'w-28 tabular-nums')} value={f.hora_fim} onChange={(e) => muda('hora_fim', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <p className={rotuloCls}>Teto</p>
            <div className="flex items-center gap-1.5">
              <input type="number" min={1} max={30} className={cn(inputCls, 'w-16 text-center tabular-nums')}
                value={f.max_reunioes_dia} onChange={(e) => muda('max_reunioes_dia', e.target.value)} />
              <span className="text-[11.5px] text-foreground/45">reuniões por dia</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className={rotuloCls}>Folga mínima</p>
            <div className="flex items-center gap-1.5">
              <input type="number" min={0} max={72} className={cn(inputCls, 'w-16 text-center tabular-nums')}
                value={f.folga_min_horas} onChange={(e) => muda('folga_min_horas', e.target.value)} />
              <span className="text-[11.5px] text-foreground/45">horas de antecedência</span>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-foreground/40 leading-relaxed">
          Ele oferece dois horários por vez, nunca em cima de outra reunião sua na Agenda, e só marca horário que está livre de verdade.
        </p>
      </div>

      {/* Prospecção */}
      <div className="space-y-3">
        <SectionHeader title="Quando uma loja da prospecção responde" />
        <div className="grid gap-2 sm:grid-cols-3">
          {MODOS.map((m) => {
            const on = f.modo_prospeccao === m;
            return (
              <button key={m} onClick={() => muda('modo_prospeccao', m)}
                className={cn('text-left rounded-xl border px-3.5 py-3 transition-colors',
                  on ? 'border-primary/40 bg-primary/[0.06]' : 'border-black/[0.1] dark:border-white/[0.1] hover:bg-black/[0.03] dark:hover:bg-white/[0.03]')}>
                <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  {ROTULO_DO_MODO[m]}{on && <Check className="h-3.5 w-3.5 text-primary ml-auto" />}
                </span>
                <span className="block text-[11.5px] text-foreground/45 leading-snug mt-1">{DESCRICAO_DO_MODO_PROSPECCAO[m]}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-foreground/40">Vale para quem responder daqui para a frente. Em cada conversa você troca o modo pelo cabeçalho dela.</p>
      </div>

      {/* Valor */}
      <div className="space-y-3">
        <SectionHeader title="O valor que ele fala" />
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-foreground/45">R$</span>
          <input className={cn(inputCls, 'w-28 text-center tabular-nums')} placeholder="437"
            value={f.preco_mensal} onChange={(e) => muda('preco_mensal', e.target.value)} />
          <span className="text-[12.5px] text-foreground/60">por mês, sem fidelidade.</span>
        </div>
        <p className="text-[11px] text-foreground/40 leading-relaxed">
          Quando perguntarem o preço, ele diz este valor direto. Desconto ou outro valor ele nunca fala: passa para você. Deixe vazio para ele não falar valor.
        </p>
      </div>

      {/* Teste */}
      <div className="space-y-3">
        <SectionHeader title="Números de teste" />
        <input
          className={cn(inputCls, 'w-full max-w-[520px] tabular-nums')}
          placeholder="(27) 99724-6060, (33) 98814-4005"
          value={f.telefones_teste}
          onChange={(e) => muda('telefones_teste', e.target.value)}
        />
        <p className="text-[11px] text-foreground/40 leading-relaxed">
          Mensagem destes números no WhatsApp oficial já entra com o assistente atendendo sozinho. Na conversa deles aparece "Recomeçar do zero", para testar de novo como se fosse a primeira mensagem.
        </p>
      </div>

      {/* Gasto */}
      <div className="space-y-3">
        <SectionHeader title="Teto de gasto" />
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-foreground/60">Até</span>
          <span className="text-[12.5px] text-foreground/45">US$</span>
          <input type="number" min={0} step={1} className={cn(inputCls, 'w-24 text-center tabular-nums')}
            value={f.teto_usd_dia} onChange={(e) => muda('teto_usd_dia', e.target.value)} />
          <span className="text-[12.5px] text-foreground/60">por dia, somando todas as conversas.</span>
        </div>
      </div>

      {sujo && (
        <div className="flex items-center gap-2 pt-1">
          {erro && <p className="text-[11.5px] text-red-500 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />{erro}</p>}
          <button onClick={() => setF(doBanco(config))} className="ml-auto h-9 px-3.5 rounded-xl text-[12.5px] font-medium text-foreground/55 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]">
            Desfazer
          </button>
          <button onClick={gravar} disabled={salvar.isPending || !!erro}
            className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold disabled:opacity-40 flex items-center gap-1.5">
            {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
          </button>
        </div>
      )}
    </Panel>
  );
}

/* ── fatos aprovados ──────────────────────────────────────────── */

type FatoNaTela = { id?: string; tema: string; texto: string; nao_dizer: string; usar_quando: string; ativo: boolean; ordem: number };

function EditorDeFato({ inicial, onFechar }: { inicial: FatoNaTela; onFechar: () => void }) {
  const salvar = useSalvarFato();
  const [f, setF] = useState(inicial);
  const gravar = async () => {
    try {
      await salvar.mutateAsync({ ...f, nao_dizer: f.nao_dizer || null, usar_quando: f.usar_quando || null });
      toast.success('Fato salvo.');
      onFechar();
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="px-4 py-3 space-y-2 bg-primary/[0.03]">
      <input className={cn(inputCls, 'w-full font-medium')} placeholder="Tema (ex.: Implantação)" value={f.tema}
        onChange={(e) => setF({ ...f, tema: e.target.value })} />
      <textarea className={cn(inputCls, 'w-full h-auto py-2 resize-y')} rows={3} placeholder="O que é verdade e ele pode dizer"
        value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
      <textarea className={cn(inputCls, 'w-full h-auto py-2 resize-y')} rows={2} placeholder="Quando usar: a dor que este fato responde (opcional)"
        value={f.usar_quando} onChange={(e) => setF({ ...f, usar_quando: e.target.value })} />
      <textarea className={cn(inputCls, 'w-full h-auto py-2 resize-y')} rows={2} placeholder="O que ele não pode dizer sobre isso (opcional)"
        value={f.nao_dizer} onChange={(e) => setF({ ...f, nao_dizer: e.target.value })} />
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] text-foreground/45">Ordem</span>
        <input type="number" className={cn(inputCls, 'w-20 text-center tabular-nums')} value={f.ordem}
          onChange={(e) => setF({ ...f, ordem: Number(e.target.value) || 0 })} />
        <button onClick={onFechar} className="ml-auto h-8 px-3 rounded-lg text-[12px] text-foreground/55 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]">Cancelar</button>
        <button onClick={gravar} disabled={salvar.isPending || !f.tema.trim() || !f.texto.trim()}
          className="h-8 px-3.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold disabled:opacity-40 flex items-center gap-1.5">
          {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
        </button>
      </div>
    </div>
  );
}

function LinhaDoFato({ fato, onEditar }: { fato: AssistenteFato; onEditar: () => void }) {
  const salvar = useSalvarFato();
  const apagar = useApagarFato();
  const [confirmando, setConfirmando] = useState(false);
  const alternar = async (ativo: boolean) => {
    try { await salvar.mutateAsync({ ...fato, ativo }); } catch (e) { toast.error((e as Error).message); }
  };
  const remover = async () => {
    try { await apagar.mutateAsync(fato.id); toast.success('Fato apagado.'); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3', !fato.ativo && 'opacity-50')}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">{fato.tema}</p>
        <p className="text-[12.5px] text-foreground/75 leading-snug mt-0.5">{fato.texto}</p>
        {fato.usar_quando && <p className="text-[11.5px] text-foreground/45 leading-snug mt-1">Usa quando: {fato.usar_quando}</p>}
        {fato.nao_dizer && <p className="text-[11.5px] text-foreground/45 leading-snug mt-1">Não dizer: {fato.nao_dizer}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Switch checked={fato.ativo} disabled={salvar.isPending} onCheckedChange={alternar} title={fato.ativo ? 'Ele usa este fato' : 'Ele não usa este fato'} />
        <button title="Editar" onClick={onEditar}
          className="h-8 w-8 rounded-lg text-foreground/45 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {confirmando ? (
          <>
            <button onClick={remover} disabled={apagar.isPending}
              className="h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-red-500 hover:bg-red-500/10">Apagar</button>
            <button onClick={() => setConfirmando(false)}
              className="h-8 w-8 rounded-lg text-foreground/45 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button title="Apagar" onClick={() => setConfirmando(true)}
            className="h-8 w-8 rounded-lg text-foreground/45 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Fatos() {
  const { data: fatos = [], isLoading } = useFatos();
  const [editando, setEditando] = useState<string | null>(null); // id, ou 'novo'
  const proximaOrdem = fatos.reduce((m, f) => Math.max(m, f.ordem ?? 0), 0) + 10;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="O que ele pode dizer"
        right={(
          <button onClick={() => setEditando('novo')}
            className="h-8 px-3 rounded-lg text-[12px] font-medium text-foreground/70 border border-black/[0.1] dark:border-white/[0.12] hover:bg-black/[0.04] dark:hover:bg-white/[0.05] flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Fato
          </button>
        )}
      />
      <p className="text-[11.5px] text-foreground/40 -mt-2">
        Só o que é verdade e está no ar. Sobre o que não está aqui, ele não afirma nada e passa para você.
      </p>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></div>
      ) : (
        <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] divide-y divide-black/[0.06] dark:divide-white/[0.06]">
          {editando === 'novo' && (
            <EditorDeFato inicial={{ tema: '', texto: '', nao_dizer: '', usar_quando: '', ativo: true, ordem: proximaOrdem }} onFechar={() => setEditando(null)} />
          )}
          {fatos.map((f) => editando === f.id ? (
            <EditorDeFato key={f.id}
              inicial={{ id: f.id, tema: f.tema, texto: f.texto, nao_dizer: f.nao_dizer ?? '', usar_quando: f.usar_quando ?? '', ativo: f.ativo, ordem: f.ordem ?? 0 }}
              onFechar={() => setEditando(null)} />
          ) : (
            <LinhaDoFato key={f.id} fato={f} onEditar={() => setEditando(f.id)} />
          ))}
          {!fatos.length && editando !== 'novo' && (
            <p className="text-[12px] text-foreground/40 text-center py-8">Nenhum fato ainda. Sem fato, ele não tem o que mostrar do sistema.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── conversas atendidas ──────────────────────────────────────── */

function Atendidas() {
  const navigate = useNavigate();
  const { data: conversas = [], isLoading } = useConversasAtendidas();
  const { data: comRascunho } = useRascunhosEsperando();

  /* Primeiro o que espera você: rascunho para aprovar ou conversa com você. */
  const ordenadas = useMemo(() => {
    const peso = (c: (typeof conversas)[number]) => (comRascunho?.has(c.conversa_id) ? 0 : c.etapa === 'com_xavier' ? 1 : 2);
    return [...conversas].sort((a, b) => peso(a) - peso(b));
  }, [conversas, comRascunho]);

  const abrir = (c: (typeof conversas)[number]) =>
    navigate(`/crm?tab=whatsapp${c.instancia_id ? `&numero=${c.instancia_id}` : ''}&conversa=${c.conversa_id}`);

  return (
    <div className="space-y-3">
      <SectionHeader title="Conversas que ele atendeu" />
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></div>
      ) : !ordenadas.length ? (
        <EmptyState icon={<Bot />} title="Nenhuma conversa ainda"
          sub='Ligue o assistente numa conversa pelo botão "Assistente", no cabeçalho dela, na aba WhatsApp.' />
      ) : (
        <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] divide-y divide-black/[0.06] dark:divide-white/[0.06]">
          {ordenadas.map((c) => (
            <button key={c.conversa_id} onClick={() => abrir(c)}
              className="w-full text-left flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
              <div className="min-w-[200px] flex-1">
                <p className="text-[13px] font-semibold text-foreground truncate">{c.nome || fone(c.telefone) || 'Sem nome'}</p>
                <p className="text-[11.5px] text-foreground/45">{c.nome ? fone(c.telefone) : ''}</p>
              </div>
              <div className="w-[170px] flex items-center gap-1.5">
                <SeloDaEtapa etapa={c.etapa} />
                {comRascunho?.has(c.conversa_id) && (
                  <span className="text-[10.5px] font-semibold text-primary">rascunho</span>
                )}
              </div>
              <p className="w-[140px] text-[11.5px] text-foreground/50">{ROTULO_DO_MODO[c.modo]}</p>
              <p className="w-[130px] text-[11.5px] text-foreground/45 tabular-nums">
                {c.mensagens_enviadas} msg · {dolar(c.custo_usd as number)}
              </p>
              <p className="w-[110px] text-[11px] text-foreground/40">{quando(c.atualizado_em)}</p>
              <MessageCircle className="h-3.5 w-3.5 text-foreground/30 ml-auto" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── a aba ────────────────────────────────────────────────────── */

export function AssistenteTab() {
  const { data: config, isLoading, isError } = useAssistenteConfig();
  useTempoRealDoAssistente(null);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>;
  }
  if (isError || !config) {
    return (
      <EmptyState icon={<Bot />} title="O assistente ainda não está instalado"
        sub="Assim que a atualização do banco for aplicada, a configuração aparece aqui." />
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PainelGeral config={config} />
      <Configuracao config={config} />
      <Fatos />
      <Atendidas />
    </div>
  );
}
