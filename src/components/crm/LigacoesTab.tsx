import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Phone, Copy, MessageCircle, ChevronDown, CheckCircle2, Target } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Panel, Kpi, EmptyState } from '@/components/admin/ui';
import {
  useLigacoesDoDia, useLigacoesDesde, useMetaDeLigacoes, useSalvarMeta, useRegistrarLigacao, type LojaParaLigar,
} from '@/hooks/useLigacoes';
import {
  placar, inicioDoDia, faltaParaSalvar, DORES, QUEM_ATENDEU, ROTULO_DO_RESULTADO, rotuloDaDor,
  type ResultadoLigacao, type QuemAtendeu, type Dor,
} from '@/lib/ligacoes';

/**
 * Ligações do dia (18/11/2026). Pedido do dono: "enquanto não estou em reunião, faço um número X
 * de ligações frias por dia; me entregue os números do dia e eu marco a resposta deles, para ir
 * tendo funil, relatório e métricas". A lista vem pronta do banco (ligacoes_do_dia), na ordem:
 * retornos de hoje, quem leu e não respondeu, quem recebeu, lojas novas.
 */

const fone = (t: string) => {
  const n = t.startsWith('55') ? t.slice(2) : t;
  return n.length < 10 ? t : `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}`;
};
const quando = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '';
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

const COR_DA_VEZ: Record<number, string> = {
  1: 'bg-primary/15 text-primary',
  2: 'bg-emerald-500/15 text-emerald-500',
  3: 'bg-sky-500/15 text-sky-500',
  4: 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/55',
};
const COR_DO_RESULTADO: Record<ResultadoLigacao, string> = {
  reuniao: 'bg-primary/15 text-primary',
  retornar: 'bg-sky-500/15 text-sky-500',
  mandar_video: 'bg-violet-500/15 text-violet-400',
  sem_interesse: 'bg-red-500/10 text-red-400',
  nao_atendeu: 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/50',
  numero_errado: 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/50',
};

const chip = (ativo: boolean) => cn(
  'h-8 px-3 rounded-lg text-[12px] font-medium border transition-colors',
  ativo ? 'border-primary bg-primary/10 text-primary' : 'border-black/[0.1] dark:border-white/[0.1] text-foreground/70 hover:text-foreground',
);
const inputCls =
  'h-9 w-full px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[12.5px] text-foreground focus:outline-none focus:border-primary/50';

export function LigacoesTab() {
  const navigate = useNavigate();
  const { data: lista = [], isLoading } = useLigacoesDoDia();
  const hoje = useMemo(() => inicioDoDia(), []);
  const semana = useMemo(() => new Date(hoje.getTime() - 6 * 86_400_000), [hoje]);
  const { data: daSemana = [] } = useLigacoesDesde(semana);
  const { data: meta = 20 } = useMetaDeLigacoes();
  const salvarMeta = useSalvarMeta();
  const [aberta, setAberta] = useState<LojaParaLigar | null>(null);
  const [roteiro, setRoteiro] = useState(false);

  const deHoje = daSemana.filter((l) => new Date(l.feita_em) >= hoje);
  const pHoje = placar(deHoje);
  const pSemana = placar(daSemana);
  const faltam = lista.filter((l) => !l.ligada_hoje);
  const feitas = lista.filter((l) => l.ligada_hoje);

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[220px]">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Ligações de hoje</p>
            <p className="text-[28px] font-bold tracking-tight tabular-nums">{pHoje.ligacoes} <span className="text-foreground/35 text-[18px]">de {meta}</span></p>
            <div className="mt-2 h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (pHoje.ligacoes / Math.max(meta, 1)) * 100)}%` }} />
            </div>
          </div>
          <label className="text-[11.5px] text-foreground/50 flex items-center gap-2">
            Meta do dia
            <select value={meta} onChange={(e) => salvarMeta.mutate(Number(e.target.value))}
              className="h-8 px-2 rounded-lg bg-background border border-black/[0.1] dark:border-white/[0.1] text-[12.5px] text-foreground">
              {[10, 15, 20, 25, 30, 40].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Kpi label="Atenderam hoje" value={pHoje.atendidas} sub={`${pct(pHoje.taxaAtendimento)} das ligações`} />
          <Kpi label="Reuniões hoje" value={pHoje.reunioes} sub={`${pct(pHoje.taxaReuniao)} de quem atendeu`} accent="text-primary" />
          <Kpi label="Reuniões em 7 dias" value={pSemana.reunioes} sub={`${pSemana.ligacoes} ligações · ${pct(pSemana.taxaReuniao)} de quem atendeu`} />
          <Kpi label="Falou com o dono" value={pct(pSemana.taxaDono)} sub="das atendidas em 7 dias" />
        </div>
      </Panel>

      <Panel className="p-0 overflow-hidden">
        <button onClick={() => setRoteiro((v) => !v)} className="w-full flex items-center justify-between px-5 py-3.5 text-left">
          <span className="text-[13px] font-semibold">Roteiro da ligação</span>
          <ChevronDown className={cn('h-4 w-4 text-foreground/40 transition-transform', roteiro && 'rotate-180')} />
        </button>
        {roteiro && <Roteiro />}
      </Panel>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>
      ) : lista.length === 0 ? (
        <EmptyState icon={<Phone />} title="Ninguém para ligar agora" sub="A lista enche com as lojas que leram a mensagem, as que receberam e as novas da fila." />
      ) : (
        <>
          {faltam.length > 0 && (
            <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] divide-y divide-black/[0.06] dark:divide-white/[0.06]">
              {faltam.map((l) => <Linha key={l.loja_id} l={l} onRegistrar={() => setAberta(l)} onConversa={l.conversa_id ? () => navigate(`/crm?tab=whatsapp&conversa=${l.conversa_id}`) : undefined} />)}
            </div>
          )}
          {feitas.length > 0 && (
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-foreground/40 mb-2 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Já ligadas hoje</p>
              <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] divide-y divide-black/[0.06] dark:divide-white/[0.06] opacity-80">
                {feitas.map((l) => <Linha key={l.loja_id} l={l} onRegistrar={() => setAberta(l)} />)}
              </div>
            </div>
          )}
        </>
      )}

      <Registrar loja={aberta} onClose={() => setAberta(null)} />
    </div>
  );
}

function Linha({ l, onRegistrar, onConversa }: { l: LojaParaLigar; onRegistrar: () => void; onConversa?: () => void }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(l.telefone.replace(/^55/, '')); toast.success('Número copiado'); } catch { /* sem área de transferência */ }
  };
  const vendedor = l.dados?.vendedor_mensagem;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-[220px] flex-1">
        <p className="text-[13.5px] font-semibold text-foreground truncate">{l.nome}</p>
        <p className="text-[11.5px] text-foreground/45">
          {[l.cidade, l.uf].filter(Boolean).join('/') || '—'}
          {l.dados?.tipo ? ` · ${l.dados.tipo}` : ''}
          {vendedor ? ` · fale com ${vendedor}` : ''}
        </p>
        {(l.dor || l.quem_atende) && (
          <p className="text-[11.5px] text-foreground/65 mt-0.5">
            {l.quem_atende ? `Atende: ${l.quem_atende}` : ''}{l.quem_atende && l.dor ? ' · ' : ''}{l.dor ? `Dor: ${rotuloDaDor(l.dor)}` : ''}
            {l.dor_frase ? ` — “${l.dor_frase}”` : ''}
          </p>
        )}
      </div>
      <div className="w-[200px]">
        {l.ligada_hoje && l.resultado_hoje ? (
          <span className={cn('text-[10.5px] font-semibold rounded-full px-2 py-0.5', COR_DO_RESULTADO[l.resultado_hoje])}>{ROTULO_DO_RESULTADO[l.resultado_hoje]}</span>
        ) : (
          <span className={cn('text-[10.5px] font-semibold rounded-full px-2 py-0.5', COR_DA_VEZ[l.prioridade] ?? COR_DA_VEZ[4])}>{l.motivo_da_vez}</span>
        )}
        <p className="text-[10.5px] text-foreground/40 mt-1">
          {l.ligacoes > 0 ? `${l.ligacoes}ª ligação já feita · última ${quando(l.ultima_ligacao_em)}` : 'Primeira ligação'}
        </p>
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <a href={`tel:+${l.telefone}`} className="h-9 px-3 rounded-xl bg-primary/10 text-primary text-[13px] font-semibold tabular-nums flex items-center gap-1.5 hover:bg-primary/15">
          <Phone className="h-3.5 w-3.5" /> {fone(l.telefone)}
        </a>
        <button title="Copiar número" onClick={copiar} className="h-9 w-9 rounded-xl text-foreground/45 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
          <Copy className="h-3.5 w-3.5" />
        </button>
        {onConversa && (
          <button title="Abrir a conversa do WhatsApp" onClick={onConversa} className="h-9 w-9 rounded-xl text-foreground/45 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={onRegistrar} className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90">
          {l.ligada_hoje ? 'Ligar de novo' : 'Como foi?'}
        </button>
      </div>
    </div>
  );
}

function Registrar({ loja, onClose }: { loja: LojaParaLigar | null; onClose: () => void }) {
  const registrar = useRegistrarLigacao();
  const [atendeu, setAtendeu] = useState<boolean | null>(null);
  const [resultado, setResultado] = useState<ResultadoLigacao | null>(null);
  const [quem, setQuem] = useState<QuemAtendeu | null>(null);
  const [dor, setDor] = useState<Dor | null>(null);
  const [frase, setFrase] = useState('');
  const [estoque, setEstoque] = useState('');
  const [decisor, setDecisor] = useState('');
  const [quandoEm, setQuandoEm] = useState('');
  const [motivo, setMotivo] = useState('');
  const [notas, setNotas] = useState('');

  const limpar = () => {
    setAtendeu(null); setResultado(null); setQuem(null); setDor(null); setFrase(''); setEstoque('');
    setDecisor(''); setQuandoEm(''); setMotivo(''); setNotas('');
  };
  const fechar = () => { limpar(); onClose(); };

  const salvar = async (r: ResultadoLigacao | null = resultado) => {
    if (!loja) return;
    const falta = faltaParaSalvar({ resultado: r, reuniaoEm: quandoEm, retornarEm: quandoEm });
    if (falta) { toast.error(falta); return; }
    const em = quandoEm ? new Date(quandoEm).toISOString() : null;
    try {
      await registrar.mutateAsync({
        loja_id: loja.loja_id, resultado: r!, quem_atendeu: quem, dor, dor_frase: frase,
        estoque: estoque ? Number(estoque) : null, decisor,
        reuniao_em: r === 'reuniao' ? em : null, retornar_em: r === 'retornar' ? em : null,
        motivo, notas,
      });
      toast.success(r === 'reuniao' ? 'Reunião na Agenda. Bora para a próxima!' : 'Registrado. Próxima loja!');
      fechar();
    } catch (e) { toast.error((e as Error).message); }
  };

  const dorEscolhida = DORES.find((d) => d.chave === dor);

  return (
    <Dialog open={!!loja} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Como foi a ligação · {loja?.nome}</DialogTitle></DialogHeader>

        {atendeu === null && (
          <div className="grid grid-cols-3 gap-2">
            <button className={chip(false)} disabled={registrar.isPending} onClick={() => salvar('nao_atendeu')}>Não atendeu</button>
            <button className={chip(false)} disabled={registrar.isPending} onClick={() => salvar('numero_errado')}>Número errado</button>
            <button className={cn(chip(false), 'border-primary text-primary')} onClick={() => setAtendeu(true)}>Atendeu</button>
          </div>
        )}

        {atendeu && (
          <div className="space-y-4">
            <div>
              <p className="text-[12px] font-semibold mb-1.5">Quem atendeu</p>
              <div className="flex flex-wrap gap-1.5">
                {QUEM_ATENDEU.map((q) => <button key={q.chave} className={chip(quem === q.chave)} onClick={() => setQuem(q.chave)}>{q.rotulo}</button>)}
              </div>
            </div>
            <div>
              <p className="text-[12px] font-semibold mb-1.5">A dor que ele disse</p>
              <div className="flex flex-wrap gap-1.5">
                {DORES.map((d) => <button key={d.chave} className={chip(dor === d.chave)} onClick={() => setDor(d.chave)}>{d.rotulo}</button>)}
              </div>
              <input className={cn(inputCls, 'mt-2')} placeholder="A frase dele, do jeito que falou" value={frase} onChange={(e) => setFrase(e.target.value)} />
              {dorEscolhida && <p className="text-[11px] text-foreground/45 mt-1">Na reunião: {dorEscolhida.ato}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] font-semibold">Veículos no pátio
                <input className={cn(inputCls, 'mt-1')} inputMode="numeric" value={estoque} onChange={(e) => setEstoque(e.target.value.replace(/\D/g, ''))} />
              </label>
              <label className="text-[12px] font-semibold">Quem decide
                <input className={cn(inputCls, 'mt-1')} placeholder="Nome do dono" value={decisor} onChange={(e) => setDecisor(e.target.value)} />
              </label>
            </div>
            <div>
              <p className="text-[12px] font-semibold mb-1.5">Como terminou</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(['reuniao', 'retornar', 'mandar_video', 'sem_interesse'] as ResultadoLigacao[]).map((r) => (
                  <button key={r} className={chip(resultado === r)} onClick={() => setResultado(r)}>{ROTULO_DO_RESULTADO[r]}</button>
                ))}
              </div>
              {(resultado === 'reuniao' || resultado === 'retornar') && (
                <label className="block text-[12px] font-semibold mt-2">{resultado === 'reuniao' ? 'Dia e hora da reunião' : 'Quando ligar de novo'}
                  <input type="datetime-local" className={cn(inputCls, 'mt-1')} value={quandoEm} onChange={(e) => setQuandoEm(e.target.value)} />
                </label>
              )}
              {resultado === 'reuniao' && <p className="text-[11px] text-foreground/45 mt-1">Entra na Agenda com o link da chamada e o que você anotou aqui.</p>}
              {resultado === 'mandar_video' && <p className="text-[11px] text-foreground/45 mt-1">Se a loja ainda não recebeu, o vídeo passa na frente da fila de envio.</p>}
              {resultado === 'sem_interesse' && (
                <input className={cn(inputCls, 'mt-2')} placeholder="Por quê? (nas palavras dele)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              )}
            </div>
            <textarea className={cn(inputCls, 'h-16 py-2')} placeholder="Anotações (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
            <div className="flex justify-between gap-2">
              <button className="h-9 px-3 rounded-xl text-[12.5px] text-foreground/55 hover:text-foreground" onClick={() => setAtendeu(null)}>Voltar</button>
              <button disabled={registrar.isPending} onClick={() => salvar()}
                className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {registrar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Roteiro() {
  const passo = 'rounded-xl bg-black/[0.03] dark:bg-white/[0.04] px-4 py-3 text-[13px] leading-relaxed';
  return (
    <div className="px-5 pb-5 grid md:grid-cols-2 gap-3">
      <div className={passo}><b className="text-primary">1. Abrir (10 s)</b><br />“Oi, é da [LOJA]? Aqui é o [SEU NOME], da Via Pesados. Te pego em 30 segundos?”</div>
      <div className={passo}><b className="text-primary">2. Motivo (15 s)</b><br />“A gente é o único sistema do Brasil feito só para loja de pesados: você cadastra o caminhão uma vez e ele sai no Mercado Livre, Instagram, Facebook e no site da loja.” Se leu o vídeo: “Te mandei um vídeo no WhatsApp esses dias.”</div>
      <div className={passo}><b className="text-primary">3. A dor (1 min)</b><br />“Hoje vocês anunciam em quantos lugares? E o que mais toma tempo: anunciar, responder cliente com foto e ficha, lembrar quem procurou o quê, ou saber o que mais vende?” Ouça. Anote a frase dele.</div>
      <div className={passo}><b className="text-primary">4. Quem decide (10 s)</b><br />“Você é o dono ou trabalha com ele?” Se não for: “Bora marcar com ele junto?”</div>
      <div className={passo}><b className="text-primary">5. Convite (20 s)</b><br />“Te mostro isso funcionando com um caminhão seu em 15 minutos, por vídeo. Amanhã às [A] ou [B]?”</div>
      <div className={passo}><b className="text-primary">Objeções rápidas</b><br />
        <b>Quem é você?</b> “Vi o anúncio da loja no portal. Se não fizer sentido, paro de te chamar.”<br />
        <b>Manda por WhatsApp.</b> “Mando. Mas ver o seu caminhão na tela é outra coisa: [A] ou [B]?”<br />
        <b>Quanto custa?</b> “R$ 437 por mês até 30/11, sem fidelidade. Na chamada te mostro tudo.”<br />
        <b>Sem tempo.</b> “São 15 minutos, no horário que for melhor. Manhã ou fim da tarde?”
      </div>
    </div>
  );
}
