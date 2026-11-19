import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCreateProspect, useChannels } from '@/hooks/useAdmin';
import { funilDoCanal } from '@/lib/funis';
import { CidadeUF } from './CidadeUF';
import { mascaraTelefone, whatsappCompleto, mascaraMoeda, valorDaMoeda } from '@/lib/mascaras';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/admin/ui';
import { useOportunidades } from '@/hooks/useOportunidades';
import { chegaramAte, taxa } from '@/lib/funilDaProspeccao';
import { ETAPAS, haQuanto, porEtapa, type EtapaDaVenda, type Oportunidade } from '@/lib/oportunidades';
import { COR_DO_TOM, useAcoesDaVenda, type AcoesDaVenda } from './AcoesDaVenda';
import { IconeWhatsApp } from './wa/IconeWhatsApp';

/**
 * O funil, um só (dono, 18/11/2026). Antes eram dois quadros para as mesmas lojas: o dos cards
 * (Contato, Envio de Amostra, Oportunidade, Reunião…) e o da prospecção automática (Abordadas,
 * Em conversa, Qualificadas…). Agora toda oportunidade, venha de onde vier, está numa das seis
 * colunas abaixo, e cada card diz o próximo passo.
 *
 * A coluna nunca é escolhida à mão: sai do que aconteceu (lib/oportunidades). Arrastar um card
 * para a frente faz o que a etapa pede: marcar a reunião, contar como foi, começar o teste ou
 * registrar a venda.
 */

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

/* ── Nova oportunidade, cadastrada à mão (indicação, alguém que ligou) ─── */
function NovaOportunidade({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { member } = useAuth();
  const create = useCreateProspect();
  const { data: canais = [] } = useChannels();
  const [form, setForm] = useState({
    company_name: '', contact_name: '', whatsapp: '',
    city: '', state: '', channel_id: '', source: '', proposal_value: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  /* 'Base de contatos' já vem escolhido: é de onde vem a maior parte da
     entrada hoje. Continua trocável, e continua obrigatório — o que não pode
     é ficar vazio e o relatório de aquisição virar chute. */
  useEffect(() => {
    if (form.channel_id || !canais.length) return;
    const base = canais.find((c) => c.name === 'Base de contatos');
    if (base) setForm((f) => ({ ...f, channel_id: base.id }));
  }, [canais, form.channel_id]);

  const submit = async () => {
    if (!form.company_name.trim()) { toast.error('Informe o nome da empresa'); return; }
    // Canal é obrigatório na entrada, não depois: preenchido de memória semanas
    // adiante ele deixa de ser dado e vira chute — e é a base de todo o
    // relatório de aquisição.
    if (!form.channel_id) { toast.error('Escolha por onde ela chegou'); return; }
    // WhatsApp não trava o cadastro: a amostra sai antes de ter o número.
    // Quem exige é o agendamento da reunião, que manda a confirmação por lá.
    // Se veio preenchido, porém, tem que dar para discar.
    if (form.whatsapp && !whatsappCompleto(form.whatsapp)) {
      toast.error('WhatsApp incompleto — informe com DDD ou deixe em branco');
      return;
    }
    try {
      await create.mutateAsync({
        company_name: form.company_name.trim(),
        contact_name: form.contact_name || null,
        whatsapp: form.whatsapp || null,  // guardado mascarado; quem disca usa replace(/\D/g,'')
        city: form.city || null,
        state: form.state || null,
        channel_id: form.channel_id,
        /* O funil é só o agrupamento dos relatórios: sai do canal, ninguém precisa escolher. */
        funil: funilDoCanal(canais.find((c) => c.id === form.channel_id)?.slug),
        source: form.source || null,
        proposal_value: valorDaMoeda(form.proposal_value),
        owner_id: member?.id ?? null,
      });
      toast.success('Criada. Está em Novos, esperando o primeiro contato.');
      setForm({ company_name: '', contact_name: '', whatsapp: '', city: '', state: '', channel_id: '', source: '', proposal_value: '' });
      onClose();
    } catch {
      toast.error('Não consegui criar. Tente de novo.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Nova oportunidade</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <input className={inputCls} placeholder="Nome da empresa *" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="Nome do responsável" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
            <input className={inputCls} placeholder="WhatsApp (pode ficar para a reunião)" inputMode="numeric" value={form.whatsapp} onChange={(e) => set('whatsapp', mascaraTelefone(e.target.value))} />
          </div>
          <CidadeUF
            uf={form.state}
            cidade={form.city}
            onChange={({ uf, cidade }) => setForm((f) => ({ ...f, state: uf, city: cidade }))}
          />
          <select className={inputCls} value={form.channel_id} onChange={(e) => set('channel_id', e.target.value)}>
            <option value="">Por onde chegou? *</option>
            {canais.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="Mensalidade (R$)" inputMode="numeric" value={form.proposal_value} onChange={(e) => set('proposal_value', mascaraMoeda(e.target.value))} />
            <input className={inputCls} placeholder="Detalhe: campanha, quem indicou…" value={form.source} onChange={(e) => set('source', e.target.value)} />
          </div>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── O quadro ───────────────────────────────────────────────── */

const ETIQUETA = 'text-[10.5px] font-medium rounded-full px-1.5 py-px bg-black/[0.05] dark:bg-white/[0.07] text-foreground/55';

function Cartao({ o, agora, acoes, arrastando, onArrastar }: {
  o: Oportunidade; agora: Date; acoes: AcoesDaVenda; arrastando: boolean; onArrastar: (id: string | null) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onArrastar(o.id)}
      onDragEnd={() => onArrastar(null)}
      onClick={() => acoes.ficha(o)}
      className={cn(
        'rounded-xl border border-black/[0.07] dark:border-white/[0.08] bg-background p-3.5 cursor-pointer',
        'hover:border-primary/40 hover:shadow-md transition-all',
        arrastando && 'opacity-40',
      )}
    >
      <p className="text-[13.5px] font-semibold text-foreground leading-tight">{o.nome}</p>
      <p className="text-[11.5px] text-foreground/45 mt-0.5">{[o.lugar, o.origem].filter(Boolean).join(' · ')}</p>
      <p className={cn('text-[12.5px] font-medium leading-snug mt-2', COR_DO_TOM[o.passo.tom])}>{o.passo.texto}</p>
      {o.sabe.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">{o.sabe.map((x) => <span key={x} className={ETIQUETA}>{x}</span>)}</div>
      )}
      <div className="flex items-center justify-between mt-2">
        <p className="text-[10.5px] text-foreground/35">{haQuanto(o.mexeuEm, agora)}</p>
        {(o.conversaId || o.telefone) && (
          <button
            onClick={(e) => { e.stopPropagation(); acoes.conversaDa(o); }}
            onMouseDown={(e) => e.stopPropagation()}
            draggable={false}
            title="Ver a conversa no WhatsApp"
            aria-label={`Ver a conversa com ${o.nome} no WhatsApp`}
            className="relative h-7 w-7 -my-1 -mr-1 flex items-center justify-center rounded-lg text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
          >
            <IconeWhatsApp className="h-4 w-4" />
            {o.naoLidas > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#25D366] text-white text-[9px] font-bold leading-[15px] text-center tabular-nums">{o.naoLidas}</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/** De onde as oportunidades vêm: o caminho da prospecção até aqui, numa linha. */
export function Caminho({ passos, onProspeccao }: { passos: { rotulo: string; valor: number; de?: string }[]; onProspeccao?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-foreground/50">
      {passos.map((p, i) => (
        <span key={p.rotulo} className="flex items-center gap-2">
          {i > 0 && <span className="text-foreground/20">→</span>}
          <span><span className="font-semibold text-foreground tabular-nums">{p.valor.toLocaleString('pt-BR')}</span> {p.rotulo}{p.de ? <span className="text-foreground/35"> ({p.de})</span> : null}</span>
        </span>
      ))}
      {onProspeccao && <button onClick={onProspeccao} className="ml-auto text-primary font-medium hover:underline">Ver a prospecção</button>}
    </div>
  );
}

function Perdidas({ ops, acoes, agora }: { ops: Oportunidade[]; acoes: AcoesDaVenda; agora: Date }) {
  const [aberta, setAberta] = useState(false);
  if (!ops.length) return null;
  return (
    <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08]">
      <button onClick={() => setAberta((a) => !a)} className="w-full flex items-center gap-2 px-4 h-11 text-left">
        <p className="text-[12.5px] font-semibold text-foreground">Perdidas</p>
        <span className="text-[10.5px] text-foreground/40 tabular-nums">{ops.length}</span>
        <span className="text-[11.5px] text-foreground/35 truncate">Disseram que não querem ou pediram para sair.</span>
        <ChevronDown className={cn('h-4 w-4 ml-auto text-foreground/35 transition-transform', aberta && 'rotate-180')} />
      </button>
      {aberta && (
        <div className="divide-y divide-black/[0.06] dark:divide-white/[0.06] border-t border-black/[0.06] dark:border-white/[0.06]">
          {ops.map((o) => (
            <button key={o.id} onClick={() => acoes.ficha(o)} className="w-full flex flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-2.5 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
              <span className="text-[12.5px] font-medium text-foreground min-w-[200px] flex-1 truncate">{o.nome}</span>
              <span className="text-[11.5px] text-foreground/45 w-[150px] truncate">{o.lugar}</span>
              <span className="text-[11.5px] text-foreground/45 flex-1 min-w-[160px] truncate">{o.passo.texto}</span>
              <span className="text-[11px] text-foreground/35 w-[80px] text-right">{haQuanto(o.mexeuEm, agora)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type FunilProps = {
  agora: Date;
  oportunidades: Oportunidade[];
  acoes: AcoesDaVenda;
  /** A linha "de onde vêm", em cima do quadro. */
  caminho?: ReactNode;
  carregando?: boolean;
};

/** O quadro, só com o que recebe: dá para ver com dados de exemplo, sem banco. */
export function FunilView({ agora, oportunidades, acoes, caminho, carregando }: FunilProps) {
  const [origem, setOrigem] = useState<string>('todas');
  const [busca, setBusca] = useState('');
  const [arrastando, setArrastando] = useState<string | null>(null);

  const origens = useMemo(() => [...new Set(oportunidades.filter((o) => !o.perdida).map((o) => o.origem))].sort(), [oportunidades]);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    return oportunidades.filter((o) => (origem === 'todas' || o.origem === origem)
      && (!q || `${o.nome} ${o.lugar}`.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(q)));
  }, [oportunidades, origem, busca]);
  const colunas = useMemo(() => porEtapa(filtradas), [filtradas]);
  const perdidas = useMemo(() => filtradas.filter((o) => o.perdida).sort((a, b) => b.mexeuEm.localeCompare(a.mexeuEm)), [filtradas]);
  const abertas = oportunidades.filter((o) => !o.perdida && o.etapa !== 'cliente').length;

  const soltar = (destino: EtapaDaVenda) => {
    const o = oportunidades.find((x) => x.id === arrastando);
    setArrastando(null);
    if (!o || o.etapa === destino) return;
    if (destino === 'conversa' && o.etapa === 'novo') return acoes.primeiroContato(o);
    if (destino === 'reuniao') return acoes.marcarReuniao(o);
    if (destino === 'decisao') {
      if (o.reuniao && (o.reuniao.status === 'agendada' || o.reuniao.status === 'remarcada')) return acoes.comoFoi(o.reuniao, o);
      toast.message('Primeiro marque a reunião: arraste para "Reunião marcada".');
      return;
    }
    if (destino === 'teste') return acoes.teste(o);
    if (destino === 'cliente') return acoes.venda(o);
    toast.message('O card anda sozinho, pelo que acontece. Para trás ninguém volta à mão.');
  };

  if (carregando) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground leading-tight">
            {abertas} {abertas === 1 ? 'oportunidade aberta' : 'oportunidades abertas'}
          </h1>
          <p className="text-[13px] text-foreground/45 mt-0.5">Cada card diz o próximo passo. O que está em laranja é com você.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {origens.length > 1 && (
            <div className="inline-flex rounded-xl border border-black/[0.08] dark:border-white/[0.08] p-0.5">
              {['todas', ...origens].map((x) => (
                <button key={x} onClick={() => setOrigem(x)}
                  className={cn('h-8 px-3 rounded-[10px] text-[12.5px] font-medium transition-colors',
                    origem === x ? 'bg-primary/10 text-primary' : 'text-foreground/50 hover:text-foreground/80')}>
                  {x === 'todas' ? 'Todas' : x}
                </button>
              ))}
            </div>
          )}
          {oportunidades.length > 8 && (
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar loja ou cidade"
                className="h-9 w-[220px] pl-9 pr-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[12.5px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50" />
            </div>
          )}
        </div>
      </div>

      {caminho}

      {oportunidades.length === 0 ? (
        <EmptyState icon={<Search />} title="Nenhuma oportunidade ainda" sub="Quem responder à prospecção, atender a ligação ou pedir contato pelo site aparece aqui." />
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="flex gap-3 min-w-max">
            {ETAPAS.map((e) => {
              const itens = colunas[e.chave];
              const pedem = itens.filter((o) => o.passo.tom === 'agora').length;
              return (
                <div
                  key={e.chave}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={() => soltar(e.chave)}
                  className="w-[264px] shrink-0 flex flex-col rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.05] dark:border-white/[0.05]"
                >
                  <div className="px-3.5 pt-3 pb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-foreground">{e.rotulo}</p>
                      <span className="text-[10.5px] text-foreground/40 font-medium bg-black/[0.05] dark:bg-white/[0.06] rounded-full px-1.5 py-0.5 tabular-nums">{itens.length}</span>
                      {pedem > 0 && <span className="ml-auto text-[10.5px] font-semibold text-primary">{pedem} com você</span>}
                    </div>
                    <p className="text-[11px] text-foreground/40 mt-0.5 leading-snug">{e.explica}</p>
                  </div>
                  <div className="flex-1 px-2 pb-2 space-y-1.5 min-h-[120px]">
                    {itens.map((o) => <Cartao key={o.id} o={o} agora={agora} acoes={acoes} arrastando={arrastando === o.id} onArrastar={setArrastando} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Perdidas ops={perdidas} acoes={acoes} agora={agora} />
    </div>
  );
}

/* ── Aba ────────────────────────────────────────────────────── */
export function FunilTab({ newOpen, onCloseNew }: { newOpen: boolean; onCloseNew: () => void }) {
  const navigate = useNavigate();
  const { oportunidades, linhas, prospects, naFila, carregando } = useOportunidades();
  const { acoes, camadas } = useAcoesDaVenda({ prospects, linhas, oportunidades });
  const agora = useMemo(() => new Date(), [oportunidades]); // eslint-disable-line react-hooks/exhaustive-deps

  /* O caminho da prospecção até virar oportunidade (só existe na frente Lojistas). */
  const n = useMemo(() => chegaramAte(linhas.filter((l) => !l.teste).map((l) => l.posicao)), [linhas]);
  const caminho = linhas.length > 0 ? (
    <Caminho
      onProspeccao={() => navigate('/crm?tab=prospeccao')}
      passos={[
        { rotulo: 'lojas na fila', valor: naFila },
        { rotulo: 'já receberam', valor: n.abordada },
        { rotulo: 'responderam', valor: n.conversando, de: taxa(n.conversando, n.abordada) || undefined },
        { rotulo: n.reuniao === 1 ? 'reunião' : 'reuniões', valor: n.reuniao },
        { rotulo: n.cliente === 1 ? 'cliente' : 'clientes', valor: n.cliente },
      ]}
    />
  ) : null;

  return (
    <>
      <FunilView agora={agora} oportunidades={oportunidades} acoes={acoes} caminho={caminho} carregando={carregando} />
      {camadas}
      <NovaOportunidade open={newOpen} onClose={onCloseNew} />
    </>
  );
}
