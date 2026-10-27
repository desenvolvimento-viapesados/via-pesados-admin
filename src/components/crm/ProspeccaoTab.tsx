import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Search, MessageCircle, Eye, Ban, RotateCcw, AlertTriangle, Star, Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Panel, EmptyState } from '@/components/admin/ui';
import { CidadeUF } from './CidadeUF';
import {
  useEstadoProspeccao, useLojas, useAcaoProspeccao, type LojaProspeccao, type StatusLoja,
} from '@/hooks/useProspeccao';

/**
 * O agente de prospecção, numa tela.
 *
 * Em cima, o painel: ligado ou não, por qual número, quanto já saiu hoje e o
 * que falta configurar. No meio, a busca por cidade. Embaixo, a fila — e o
 * que importa no dia é a aba "Com você": quem topou a amostra, pediu preço
 * ou quer falar com gente.
 */

const fone = (t: string) => {
  const n = t.startsWith('55') ? t.slice(2) : t;
  return n.length < 10 ? t : `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}`;
};
const quando = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';

const ABAS: { chave: string; rotulo: string; status: StatusLoja[] }[] = [
  { chave: 'com_voce', rotulo: 'Com você', status: ['com_voce'] },
  { chave: 'conversando', rotulo: 'Conversando', status: ['conversando'] },
  { chave: 'contato', rotulo: 'Em contato', status: ['em_contato'] },
  { chave: 'fila', rotulo: 'Na fila', status: ['nova', 'pronta'] },
  { chave: 'sem_resposta', rotulo: 'Sem resposta', status: ['sem_resposta'] },
  { chave: 'sem_interesse', rotulo: 'Sem interesse', status: ['sem_interesse'] },
  { chave: 'fora', rotulo: 'Fora da fila', status: ['sem_whatsapp', 'ja_conhecida', 'descartada'] },
];

const SITUACAO: Record<StatusLoja, { rotulo: string; cor: string }> = {
  nova: { rotulo: 'Conferindo WhatsApp', cor: 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/50' },
  pronta: { rotulo: 'Na fila', cor: 'bg-sky-500/15 text-sky-500' },
  sem_whatsapp: { rotulo: 'Sem WhatsApp', cor: 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/40' },
  ja_conhecida: { rotulo: 'Já é contato', cor: 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/40' },
  em_contato: { rotulo: 'Em contato', cor: 'bg-blue-500/15 text-blue-400' },
  sem_resposta: { rotulo: 'Sem resposta', cor: 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/45' },
  conversando: { rotulo: 'Conversando', cor: 'bg-violet-500/15 text-violet-400' },
  com_voce: { rotulo: 'Com você', cor: 'bg-primary/15 text-primary' },
  sem_interesse: { rotulo: 'Sem interesse', cor: 'bg-red-500/10 text-red-400' },
  descartada: { rotulo: 'Descartada', cor: 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/40' },
};

const inputCls =
  'h-9 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[12.5px] text-foreground focus:outline-none focus:border-primary/50 transition-colors';

function Painel() {
  const { data: e, isLoading } = useEstadoProspeccao();
  const acao = useAcaoProspeccao();
  const [teto, setTeto] = useState<string | null>(null);

  if (isLoading || !e) {
    return <Panel className="p-5 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></Panel>;
  }
  const cfg = e.config;
  const mudar = async (corpo: Record<string, unknown>, ok?: string) => {
    try {
      await acao.mutateAsync({ acao: 'config', ...corpo });
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const avisos: string[] = [];
  if (!e.google) avisos.push('Falta a chave do Google Maps (GOOGLE_MAPS_API_KEY) para buscar lojas.');
  if (!e.ia) avisos.push('Falta a chave da IA (ANTHROPIC_API_KEY): as mensagens saem dos textos prontos e o agente não responde sozinho — toda resposta vem para você.');
  if (cfg?.instancia_id && !e.numero_ok && e.numero_motivo) avisos.push(e.numero_motivo);
  if (!cfg?.instancia_id) avisos.push('Escolha o número que vai prospectar.');
  if (cfg?.pausado_motivo) avisos.push(cfg.pausado_motivo);

  return (
    <Panel className="p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', cfg?.ligado ? 'bg-primary/15 text-primary' : 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/35')}>
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-foreground">Agente de prospecção</p>
          <p className="text-[11.5px] text-foreground/45">
            {cfg?.ligado
              ? (e.horario_de_envio ? 'Enviando agora, no ritmo combinado.' : 'Ligado — volta a enviar no próximo dia útil às 08h.')
              : 'Desligado. Nenhuma mensagem de prospecção sai.'}
          </p>
        </div>
        <label className="ml-auto flex items-center gap-2.5 text-[12.5px] font-medium text-foreground/70">
          {cfg?.ligado ? 'Ligado' : 'Desligado'}
          <Switch
            checked={!!cfg?.ligado}
            disabled={acao.isPending}
            onCheckedChange={(v) => mudar({ ligado: v }, v ? 'Agente ligado. A primeira mensagem sai no próximo horário útil.' : 'Agente desligado.')}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30">Número</p>
          <select
            className={cn(inputCls, 'w-full')}
            value={cfg?.instancia_id ?? ''}
            onChange={(ev) => mudar({ instancia_id: ev.target.value || null })}
          >
            <option value="">Escolher…</option>
            {e.numeros.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nome}{n.telefone ? ` · ${fone(n.telefone)}` : ''}{n.connection_state === 'open' ? '' : ' (desconectado)'}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30">Hoje</p>
          <div className="flex items-center gap-2">
            <p className="text-[20px] font-bold tabular-nums text-foreground leading-9">{e.hoje}<span className="text-[12px] font-normal text-foreground/35"> de {e.teto}</span></p>
            <div className="ml-auto flex items-center gap-1.5 text-[11.5px] text-foreground/45">
              teto
              <input
                type="number" min={1} max={60}
                className={cn(inputCls, 'w-16 text-center tabular-nums')}
                value={teto ?? String(cfg?.limite_dia ?? 15)}
                onChange={(ev) => setTeto(ev.target.value)}
                onBlur={() => { if (teto !== null && Number(teto) !== cfg?.limite_dia) mudar({ limite_dia: Number(teto) }); setTeto(null); }}
              />
            </div>
          </div>
          <p className="text-[10.5px] text-foreground/35">Começa em 15/dia e sobe 5 por semana até o teto.</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30">Quando a loja responde</p>
          <label className="flex items-center justify-between gap-3 h-9 px-3 rounded-xl border border-black/[0.1] dark:border-white/[0.1]">
            <span className="text-[12.5px] text-foreground/75">O agente conversa até a amostra</span>
            <Switch checked={!!cfg?.agente_responde} onCheckedChange={(v) => mudar({ agente_responde: v })} />
          </label>
          <p className="text-[10.5px] text-foreground/35">{e.respostas_hoje} respostas do agente hoje. Você escreveu na conversa, ele sai.</p>
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-2.5 space-y-1">
          {avisos.map((a) => (
            <p key={a} className="flex gap-2 text-[12px] text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{a}</p>
          ))}
        </div>
      )}

      <p className="text-[11px] text-foreground/40 leading-relaxed">
        Só em dia útil, das 08h às 20h, uma mensagem a cada 7 a 18 minutos. Até 3 contatos em 10 dias por loja; respondeu ou
        pediu para sair, para na hora. Ninguém que já é cliente, prospect ou conversou com a gente recebe.
      </p>
    </Panel>
  );
}

function Busca() {
  const acao = useAcaoProspeccao();
  const [lugar, setLugar] = useState({ uf: '', cidade: '' });
  const buscar = async () => {
    try {
      const r = await acao.mutateAsync({ acao: 'buscar', ...lugar }) as { achadas: number; novas: number; ja_conhecidas: number; ja_na_fila: number };
      toast.success(`${r.achadas} lojas em ${lugar.cidade}: ${r.novas} novas na fila, ${r.ja_conhecidas} já são contato, ${r.ja_na_fila} já estavam na fila.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Panel className="p-4 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[260px]">
        <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30 mb-1.5">Buscar lojas no Google Maps</p>
        <CidadeUF uf={lugar.uf} cidade={lugar.cidade} onChange={setLugar} />
      </div>
      <button
        onClick={buscar}
        disabled={!lugar.uf || !lugar.cidade || acao.isPending}
        className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold disabled:opacity-40 flex items-center gap-1.5"
      >
        {acao.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Buscar
      </button>
    </Panel>
  );
}

function Previa({ loja, onClose }: { loja: LojaProspeccao | null; onClose: () => void }) {
  const acao = useAcaoProspeccao();
  const [r, setR] = useState<{ texto: string; contato: number; por: string } | null>(null);
  useEffect(() => {
    if (!loja) return;
    let vivo = true;
    setR(null);
    acao.mutateAsync({ acao: 'previa', loja_id: loja.id })
      .then((d) => { if (vivo) setR(d as { texto: string; contato: number; por: string }); })
      .catch((e) => toast.error((e as Error).message));
    return () => { vivo = false; };
  }, [loja?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={!!loja} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Próxima mensagem para {loja?.nome}</DialogTitle></DialogHeader>
        {!r ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-2xl rounded-tr-sm bg-primary/10 px-3.5 py-2.5 text-[13px] text-foreground whitespace-pre-wrap">{r.texto}</div>
            <p className="text-[11px] text-foreground/40">
              Contato {r.contato} de 3 · {r.por === 'ia' ? 'escrita pela IA para esta loja' : 'texto pronto (a IA não está ligada)'}.
              Cada prévia sai diferente: é só um exemplo, nada foi enviado.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ProspeccaoTab() {
  const navigate = useNavigate();
  const { data: e } = useEstadoProspeccao();
  const [aba, setAba] = useState(ABAS[0].chave);
  const atual = ABAS.find((a) => a.chave === aba)!;
  const { data: lojas = [], isLoading } = useLojas(atual.status);
  const acao = useAcaoProspeccao();
  const [previa, setPrevia] = useState<LojaProspeccao | null>(null);

  const total = (st: StatusLoja[]) => st.reduce((s, x) => s + (e?.contagens?.[x] ?? 0), 0);
  const ordenadas = useMemo(() => lojas, [lojas]);

  const mexer = async (acaoNome: 'descartar' | 'reativar', loja: LojaProspeccao) => {
    try { await acao.mutateAsync({ acao: acaoNome, loja_id: loja.id }); } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <Painel />
      <Busca />

      <div className="flex items-end gap-0.5 overflow-x-auto border-b border-black/[0.06] dark:border-white/[0.06]" style={{ scrollbarWidth: 'none' }}>
        {ABAS.map((a) => {
          const ativa = a.chave === aba;
          const n = total(a.status);
          return (
            <button key={a.chave} onClick={() => setAba(a.chave)}
              className={cn('relative h-10 px-3 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors',
                ativa ? 'text-foreground font-semibold' : 'text-foreground/40 hover:text-foreground/75')}>
              {a.rotulo}
              {n > 0 && <span className={cn('text-[10px] font-semibold rounded-full px-1.5 py-px tabular-nums',
                ativa || a.chave === 'com_voce' ? 'bg-primary/15 text-primary' : 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/45')}>{n}</span>}
              <span className={cn('absolute inset-x-2 bottom-0 h-[3px] rounded-full', ativa ? 'bg-primary' : 'bg-transparent')} />
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>
      ) : ordenadas.length === 0 ? (
        <EmptyState icon={<Search />} title="Nenhuma loja aqui" sub={aba === 'fila' ? 'Busque uma cidade acima para encher a fila.' : undefined} />
      ) : (
        <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] divide-y divide-black/[0.06] dark:divide-white/[0.06]">
          {ordenadas.map((l) => {
            const s = SITUACAO[l.status];
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-[220px] flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate">{l.nome}</p>
                  <p className="text-[11.5px] text-foreground/45 flex items-center gap-2">
                    {[l.cidade, l.uf].filter(Boolean).join('/') || '—'} · {fone(l.telefone)}
                    {typeof l.dados?.nota === 'number' && (
                      <span className="flex items-center gap-0.5"><Star className="h-3 w-3" />{l.dados.nota} ({l.dados.avaliacoes ?? 0})</span>
                    )}
                  </p>
                  {l.motivo && <p className="text-[11.5px] text-foreground/65 mt-0.5">{l.motivo}</p>}
                </div>
                <div className="w-[150px]">
                  <span className={cn('text-[10.5px] font-semibold rounded-full px-2 py-0.5', s.cor)}>{s.rotulo}</span>
                  <p className="text-[10.5px] text-foreground/40 mt-1">
                    {l.contatos > 0 ? `${l.contatos} de 3 contatos` : 'Sem contato ainda'}
                    {l.humano_assumiu ? ' · com a equipe' : ''}
                  </p>
                </div>
                <div className="w-[150px] text-[11px] text-foreground/45">
                  {l.status === 'em_contato' ? <>Próximo: {quando(l.proximo_contato_em)}</>
                    : l.respondeu_em ? <>Respondeu: {quando(l.respondeu_em)}</>
                    : l.ultimo_contato_em ? <>Último: {quando(l.ultimo_contato_em)}</> : null}
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  {l.conversa_id && (
                    <button title="Abrir conversa" onClick={() => navigate(`/crm?tab=whatsapp&numero=${e?.config?.instancia_id ?? ''}&conversa=${l.conversa_id}`)}
                      className="h-8 px-2.5 rounded-lg text-[11.5px] font-medium text-foreground/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" /> Conversa
                    </button>
                  )}
                  {['pronta', 'nova', 'em_contato'].includes(l.status) && (
                    <button title="Ver a próxima mensagem" onClick={() => setPrevia(l)}
                      className="h-8 w-8 rounded-lg text-foreground/45 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {['nova', 'pronta', 'em_contato', 'sem_resposta'].includes(l.status) && (
                    <button title="Tirar da fila" onClick={() => mexer('descartar', l)}
                      className="h-8 w-8 rounded-lg text-foreground/45 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {l.status === 'descartada' && (
                    <button title="Devolver para a fila" onClick={() => mexer('reativar', l)}
                      className="h-8 w-8 rounded-lg text-foreground/45 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Previa loja={previa} onClose={() => setPrevia(null)} />
    </div>
  );
}
