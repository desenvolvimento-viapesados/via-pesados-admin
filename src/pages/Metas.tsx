import { useMemo, useState } from 'react';
import {
  Target, Compass, Plus, Pencil, Trash2, Check, Loader2, TrendingUp, Flag, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Panel, SectionHeader } from '@/components/admin/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import {
  useClients, usePayments, useProspects, useMeetings, useDemos,
  useFinTransactions, useTickets, useTeam, useCompaniesHealth,
} from '@/hooks/useAdmin';
import {
  useCiclo, useObjetivos, useKRs, useCheckins, useNSM, useSerieNSM,
  useGravarPontoNSM, useSalvarNSM, useSalvarCiclo, useCriarObjetivo,
  useSalvarObjetivo, useApagarObjetivo, useSalvarKR, useApagarKR, useCheckin,
  useFilhos, useDesdobrar,
  type TipoDeCiclo, type Objetivo, type KRRow,
} from '@/hooks/useMetas';
import { conferirCascata } from '@/lib/cascata';
import {
  METRICAS, CHAVES_DE_METRICA, valorDaMetrica, type ChaveMetrica,
} from '@/lib/metricas';
import {
  progressoDoKr, progressoDoObjetivo, saudeDoKr, fracaoDoTempo, previsaoFinal,
  resumoDoCiclo, formatarValor, superou, ROTULO_SAUDE, type Saude,
} from '@/lib/okr';

/**
 * Metas: a métrica-norte, o horizonte e o OKR do trimestre.
 *
 * O que costuma matar um quadro de metas é ele envelhecer: alguém monta
 * em janeiro, ninguém atualiza em março, e em junho o quadro mente. Por
 * isso o resultado-chave aqui pode se medir sozinho — `fonte` diz de
 * qual número do painel ele sai, e o valor é lido a cada abertura. O
 * check-in manual continua existindo para o que o sistema não vê.
 *
 * A outra escolha de fundo: progresso sempre comparado com o TEMPO. "60%
 * feito" não quer dizer nada sem saber que o trimestre já correu 90%.
 */

const HORIZONTES: { tipo: TipoDeCiclo; rotulo: string; sub: string }[] = [
  { tipo: 'mes', rotulo: 'Mês', sub: 'o que precisa acontecer agora' },
  { tipo: 'trimestre', rotulo: 'Trimestre', sub: 'o OKR — objetivo curto com número' },
  { tipo: 'ano', rotulo: 'Ano', sub: 'o pedaço do caminho que cabe num ano' },
  { tipo: 'cinco_anos', rotulo: '5 anos', sub: 'onde se quer chegar — serve para dizer não' },
  { tipo: 'livre', rotulo: 'Período', sub: 'de quando até quando você escolher' },
];

/* As metas que esta empresa escreve de verdade. O catálogo inteiro
   continua ali embaixo, mas quem abre a tela para dizer "quero X de MRR
   até dezembro" não devia ter que procurar numa lista de vinte. */
const ATALHOS: ChaveMetrica[] = [
  'mrr', 'clientes_pagando', 'novos_clientes', 'recebido', 'vendas_base', 'caixa_liquido',
];

const hojeISO = () => new Date().toISOString().slice(0, 10);
const daquiAMeses = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

const TOM_BARRA: Record<Saude, string> = {
  sem_medida: 'bg-foreground/20',
  adiantado: 'bg-emerald-500',
  no_ritmo: 'bg-emerald-500',
  atencao: 'bg-amber-500',
  risco: 'bg-red-400',
};
const TOM_TEXTO: Record<string, string> = {
  bom: 'text-emerald-500', neutro: 'text-foreground/40',
  atencao: 'text-amber-500', ruim: 'text-red-400',
};

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export default function Metas() {
  const { member } = useAuth();
  const [horizonte, setHorizonte] = useState<TipoDeCiclo>('trimestre');
  const [dialogObjetivo, setDialogObjetivo] = useState<Partial<Objetivo> | null>(null);
  const [dialogKR, setDialogKR] = useState<(Partial<KRRow> & { ciclo_id: string }) | null>(null);
  const [dialogCheckin, setDialogCheckin] = useState<KRRow | null>(null);
  const [editandoNSM, setEditandoNSM] = useState(false);

  const [livre, setLivre] = useState({ inicio: hojeISO(), fim: daquiAMeses(12) });
  const ciclo = useCiclo(horizonte, livre);
  const objetivos = useObjetivos(ciclo.data?.id);
  const krs = useKRs(ciclo.data?.id);
  const checkins = useCheckins((krs.data ?? []).map((k) => k.id));
  const nsm = useNSM();
  const serie = useSerieNSM();
  const { data: team = [] } = useTeam();

  /* Os números do painel que alimentam os KRs automáticos. */
  const { data: clientes = [] } = useClients();
  const { data: pagamentos = [] } = usePayments();
  const { data: prospects = [] } = useProspects();
  const { data: reunioes = [] } = useMeetings();
  const { data: demos = [] } = useDemos();
  const { data: transacoes = [] } = useFinTransactions();
  const { data: tickets = [] } = useTickets();

  /* A base instalada só é lida quando alguma meta depende dela: cada
     leitura passa pela ponte e vira linha no log da LGPD. */
  const precisaDaBase = useMemo(() => {
    const fontes = new Set<string>((krs.data ?? []).map((k) => k.fonte));
    if (nsm.data && METRICAS[nsm.data.metrica as ChaveMetrica]?.daBase) return true;
    return [...fontes].some((f) => f !== 'manual' && METRICAS[f as ChaveMetrica]?.daBase);
  }, [krs.data, nsm.data]);
  const companyIds = useMemo(
    () => (precisaDaBase ? clientes.map((c) => c.lojista_company_id).filter(Boolean) as string[] : []),
    [precisaDaBase, clientes],
  );
  const { data: saude = [] } = useCompaniesHealth(companyIds);

  const filhos = useFilhos((krs.data ?? []).map((k) => k.id));
  const desdobrar = useDesdobrar();
  const gravarPonto = useGravarPontoNSM();
  const salvarNSM = useSalvarNSM();
  const salvarCiclo = useSalvarCiclo();
  const criarObjetivo = useCriarObjetivo();
  const salvarObjetivo = useSalvarObjetivo();
  const apagarObjetivo = useApagarObjetivo();
  const salvarKR = useSalvarKR();
  const apagarKR = useApagarKR();
  const fazerCheckin = useCheckin();

  const periodo = { inicio: ciclo.data?.inicio ?? '', fim: ciclo.data?.fim ?? '' };
  const dados = { clientes, pagamentos, prospects, reunioes, demos, transacoes, tickets, saude };

  /** O valor de agora de um KR: do sistema ou do último check-in. */
  const valorDoKr = (kr: KRRow): number | null => {
    if (kr.fonte === 'manual') return kr.valor_manual ?? null;
    if (!periodo.inicio) return null;
    return valorDaMetrica(kr.fonte as ChaveMetrica, dados, periodo);
  };

  const tempo = ciclo.data ? fracaoDoTempo(ciclo.data) : 0;
  const porObjetivo = useMemo(() => {
    const mapa = new Map<string, KRRow[]>();
    for (const k of krs.data ?? []) {
      if (!k.objetivo_id) continue;
      mapa.set(k.objetivo_id, [...(mapa.get(k.objetivo_id) ?? []), k]);
    }
    return mapa;
  }, [krs.data]);

  const comValor = (lista: KRRow[]) => lista.map((k) => ({ ...k, atual: valorDoKr(k) }));
  /* As metas que não estão sob objetivo nenhum: a lista principal. */
  const soltas = comValor((krs.data ?? []).filter((k) => !k.objetivo_id));
  /* O resumo conta TODAS as metas do período — as soltas e as agrupadas.
     Contar só as de objetivo mostrava "0 resultados-chave" com meta na
     tela logo abaixo. */
  const resumo = {
    ...resumoDoCiclo(
      [...(objetivos.data ?? []).map((o) => ({ krs: comValor(porObjetivo.get(o.id) ?? []) })),
       { krs: soltas }],
      tempo,
    ),
    objetivos: (objetivos.data ?? []).length,
  };

  const valorNSM = nsm.data ? valorDaMetrica(nsm.data.metrica, dados, {
    inicio: `${new Date().getFullYear()}-01-01`, fim: `${new Date().getFullYear()}-12-31`,
  }) : null;

  const ultimoCheckin = (krId: string) => (checkins.data ?? []).find((c) => c.kr_id === krId);

  /* A linha de uma meta. A mesma, solta no período ou dentro de um
     objetivo — eram dois blocos iguais, e dois blocos iguais divergem. */
  const linhaDaMeta = (kr: KRRow & { atual: number | null }) => {
    const p = progressoDoKr(kr);
    const s = saudeDoKr(p, tempo);
    const prev = previsaoFinal(kr, tempo);
    const ck = ultimoCheckin(kr.id);
    const def = kr.fonte !== 'manual' ? METRICAS[kr.fonte as ChaveMetrica] : null;
    /* O desdobramento desta meta nos pedaços do período, e se ele fecha.
       Em fluxo as partes somam; em estoque, o último degrau é que vale. */
    const meus = (filhos.data ?? []).filter((x) => x.pai_id === kr.id);
    const confere = meus.length
      ? conferirCascata(def?.natureza ?? 'fluxo', Number(kr.alvo),
          meus.map((x) => ({ id: x.id, inicio: x.ciclo?.inicio ?? '', fim: x.ciclo?.fim ?? '', alvo: Number(x.alvo) })))
      : null;
    return (
      <div key={kr.id} className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-foreground/85 leading-snug">{kr.titulo}</p>
            <div className="flex items-center gap-2 mt-1 text-[10.5px] flex-wrap">
              <span className="tabular-nums text-foreground/60">
                {formatarValor(kr.atual, kr.unidade)}
                <span className="text-foreground/30"> de </span>
                {formatarValor(kr.alvo, kr.unidade)}
                {kr.partida !== 0 && (
                  <span className="text-foreground/30"> · partiu de {formatarValor(kr.partida, kr.unidade)}</span>
                )}
              </span>
              <span className={cn('font-medium', TOM_TEXTO[ROTULO_SAUDE[s].tom])}>
                {ROTULO_SAUDE[s].texto}
              </span>
              {superou(kr) && <span className="text-emerald-500 font-medium">superou</span>}
              {prev !== null && (
                <span className="text-foreground/35">
                  no ritmo de hoje, termina em {formatarValor(prev, kr.unidade)}
                </span>
              )}
              <span className="text-foreground/25">
                {def ? `automático · ${def.rotulo}` : 'manual'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!kr.pai_id && !meus.length && horizonte !== 'mes' && ciclo.data && (
              <button
                onClick={() => desdobrar.mutateAsync({ kr, ciclo: ciclo.data! })
                  .then((n) => toast.success(`Dividida em ${n} ${n === 1 ? 'parte' : 'partes'}`))
                  .catch((e) => toast.error((e as Error).message))}
                disabled={desdobrar.isPending}
                title="Dividir nos meses (ou trimestres) deste período"
                className="h-7 px-2 rounded-lg text-[11px] font-medium text-primary/80 hover:text-primary hover:bg-primary/10 disabled:opacity-50">
                Desdobrar
              </button>
            )}
            <button onClick={() => setDialogCheckin(kr)}
              title="Check-in"
              className="h-7 px-2 rounded-lg text-[11px] font-medium text-foreground/50 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06]">
              Check-in
            </button>
            <button onClick={() => setDialogKR({ ...kr })}
              className="h-7 w-7 rounded-lg text-foreground/30 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={() => { if (confirm('Apagar este resultado-chave?')) apagarKR.mutate(kr.id); }}
              className="h-7 w-7 rounded-lg text-foreground/30 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="mt-2 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden relative">
          <div className={cn('h-full rounded-full transition-all', TOM_BARRA[s])}
            style={{ width: `${(p ?? 0) * 100}%` }} />
          {/* Onde o ritmo deveria estar hoje. */}
          <div className="absolute top-[-3px] h-[12px] w-px bg-foreground/40"
            style={{ left: `${tempo * 100}%` }} title="ritmo esperado hoje" />
        </div>

        {/* O desdobramento, e se as partes fecham com o todo. */}
        {confere && (
          <div className="mt-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2">
            <p className={cn('text-[11px] font-medium',
              confere.bate ? 'text-emerald-500' : 'text-amber-500')}>
              {confere.texto}
              {def?.natureza === 'estoque' && confere.bate && ' Em MRR e afins não se soma: o que vale é onde se quer estar no fim.'}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {[...meus].sort((a, b) => (a.ciclo?.inicio ?? '').localeCompare(b.ciclo?.inicio ?? '')).map((x) => (
                <span key={x.id} className="text-[10.5px] text-foreground/45 tabular-nums">
                  {x.ciclo?.rotulo}: <span className="text-foreground/70">{formatarValor(Number(x.alvo), kr.unidade)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {ck?.comentario && (
          <p className="text-[11px] text-foreground/40 mt-1.5">
            “{ck.comentario}” · {new Date(ck.created_at).toLocaleDateString('pt-BR')}
            {ck.autor_nome ? ` · ${ck.autor_nome}` : ''}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-light tracking-[0.22em] uppercase text-primary mb-3">Metas</p>
          <h1 className="text-[28px] sm:text-[34px] leading-[1.1] tracking-tight">
            <span className="block font-extralight text-foreground/45">Onde queremos chegar</span>
            <span className="block font-bold text-foreground">e quanto já andamos</span>
          </h1>
        </div>
      </header>

      {/* ── A métrica-norte ─────────────────────────────────────── */}
      <div>
        <SectionHeader
          title="Métrica-norte"
          right={
            <button onClick={() => setEditandoNSM(true)}
              className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Trocar
            </button>
          }
        />
        <Panel className="p-5">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-foreground/35">
                <Compass className="h-3.5 w-3.5" />
                <p className="text-[10px] font-semibold tracking-widest uppercase">{nsm.data?.rotulo ?? '—'}</p>
              </div>
              <p className="text-[34px] font-bold tabular-nums leading-tight mt-1">
                {formatarValor(valorNSM, (nsm.data?.unidade ?? 'numero') as never)}
              </p>
              {nsm.data?.porque && (
                <p className="text-[12px] text-foreground/45 leading-snug mt-1 max-w-xl">{nsm.data.porque}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-foreground/35 uppercase tracking-widest">Meta do ano</p>
              <p className="text-[18px] font-bold tabular-nums">
                {nsm.data?.meta_ano
                  ? formatarValor(nsm.data.meta_ano, (nsm.data.unidade ?? 'numero') as never)
                  : 'sem meta'}
              </p>
              {nsm.data?.meta_ano && valorNSM !== null && (
                <p className="text-[11px] text-foreground/40 mt-0.5">
                  {pct(Math.min(1, valorNSM / nsm.data.meta_ano))} do caminho
                </p>
              )}
              {valorNSM !== null && (
                <button
                  onClick={() => gravarPonto.mutateAsync(valorNSM).then(() => toast.success('Ponto de hoje guardado'))}
                  className="mt-2 text-[11px] text-foreground/40 hover:text-foreground underline">
                  guardar o ponto de hoje
                </button>
              )}
            </div>
          </div>

          {/* A série: um ponto por dia em que alguém abriu a tela e guardou. */}
          {(serie.data?.length ?? 0) > 1 && (
            <div className="mt-4 flex items-end gap-1 h-16">
              {serie.data!.slice(-60).map((p) => {
                const max = Math.max(...serie.data!.map((x) => Number(x.valor) || 0), 1);
                return (
                  <div key={p.dia} title={`${p.dia}: ${p.valor}`}
                    className="flex-1 bg-primary/50 hover:bg-primary rounded-t min-h-[2px]"
                    style={{ height: `${(Number(p.valor) / max) * 100}%` }} />
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Horizonte ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-black/[0.07] dark:border-white/[0.07] flex-wrap">
        {HORIZONTES.map((h) => (
          <button
            key={h.tipo}
            onClick={() => setHorizonte(h.tipo)}
            title={h.sub}
            className={cn(
              'h-9 px-3.5 text-[12.5px] font-medium transition-colors relative -mb-px border-b-2',
              horizonte === h.tipo
                ? 'text-foreground border-primary'
                : 'text-foreground/40 border-transparent hover:text-foreground/70',
            )}
          >
            {h.rotulo}
          </button>
        ))}
      </div>

      {/* Cada horizonte é um quadro próprio, e isso não estava dito em
          lugar nenhum: a pessoa trocava de aba e via o mesmo vazio sem
          entender que ali se escrevem OUTRAS metas. */}
      <p className="text-[12px] text-foreground/45 -mt-3">
        Cada horizonte tem as suas metas. Escreva a do prazo maior primeiro e use
        <span className="text-foreground/70"> desdobrar</span> para dividi-la nos meses — o
        sistema confere se as partes fecham com o todo.
      </p>

      {horizonte === 'livre' && (
        <Panel className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-foreground/45">De</Label>
            <Input type="date" className="h-10 rounded-xl w-[160px]" value={livre.inicio}
              onChange={(e) => setLivre((l) => ({ ...l, inicio: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-foreground/45">Até</Label>
            <Input type="date" className="h-10 rounded-xl w-[160px]" value={livre.fim}
              onChange={(e) => setLivre((l) => ({ ...l, fim: e.target.value }))} />
          </div>
          <p className="text-[11.5px] text-foreground/40 pb-2.5">
            Cada par de datas é um quadro próprio: as metas que você escrever aqui ficam guardadas
            neste período e voltam quando você escolher as mesmas datas.
          </p>
        </Panel>
      )}

      {ciclo.isPending ? (
        <Panel className="p-6 flex items-center gap-2 text-[13px] text-foreground/45">
          <Loader2 className="h-4 w-4 animate-spin" /> abrindo o ciclo…
        </Panel>
      ) : (
        <>
          {/* ── Onde o ciclo está ─────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Painel titulo={ciclo.data!.rotulo} valor={pct(resumo.progresso)}
              sub={`${Math.round(tempo * 100)}% do tempo corrido`} />
            <Painel titulo="Metas" valor={resumo.krs}
              sub={resumo.objetivos
                ? `${resumo.objetivos} ${resumo.objetivos === 1 ? 'objetivo' : 'objetivos'}`
                : 'sem objetivo agrupando'} />
            <Painel titulo="Em risco" valor={resumo.emRisco}
              tom={resumo.emRisco > 0 ? 'ruim' : undefined}
              sub={resumo.emRisco ? 'precisam de decisão' : 'nenhum'} />
            <Painel titulo="Sem medida" valor={resumo.semMedida}
              tom={resumo.semMedida > 0 ? 'atencao' : undefined}
              sub={resumo.semMedida ? 'ninguém mediu ainda' : 'todos medidos'} />
          </div>

          <div>
            <SectionHeader
              title={`Tema do ${HORIZONTES.find((h) => h.tipo === horizonte)?.rotulo.toLowerCase()}`}
            />
            <Panel className="p-4">
              <Input
                defaultValue={ciclo.data!.tema ?? ''}
                placeholder="Em uma frase: o foco deste ciclo. Ajuda a recusar objetivo que não cabe."
                className="h-11 rounded-xl"
                onBlur={(e) => {
                  if (e.target.value !== (ciclo.data!.tema ?? '')) {
                    salvarCiclo.mutate({ id: ciclo.data!.id, tema: e.target.value });
                  }
                }}
              />
            </Panel>
          </div>

          {/* ── Objetivos ─────────────────────────────────────── */}
          {/* ── As metas do período ───────────────────────────── */}
          <div>
            <SectionHeader
              title="Metas do período"
              right={
                <button
                  onClick={() => setDialogKR({ ciclo_id: ciclo.data!.id, unidade: 'numero', direcao: 'subir', fonte: 'manual', partida: 0 })}
                  className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Meta
                </button>
              }
            />
            {soltas.length === 0 ? (
              <Panel className="p-6">
                <p className="text-[13px] text-foreground/55 leading-relaxed">
                  Nenhuma meta neste período. Uma meta é uma frase com número e prazo — "MRR de
                  R$ 10.000 até dezembro" —, e quase sempre o número já está no painel: escolha a
                  métrica e ela se mede sozinha daqui para frente.
                </p>
              </Panel>
            ) : (
              <div className="flex flex-col gap-2">
                {soltas.map(linhaDaMeta)}
              </div>
            )}
          </div>

          {/* ── OKR, para quem quer agrupar ───────────────────── */}
          <div>
            <SectionHeader
              title="Objetivos"
              right={
                <button
                  onClick={() => setDialogObjetivo({ ciclo_id: ciclo.data!.id, nivel: 'empresa' })}
                  className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Objetivo
                </button>
              }
            />
            {(objetivos.data ?? []).length === 0 ? (
              <Panel className="p-5">
                <p className="text-[12.5px] text-foreground/45 leading-relaxed">
                  Opcional. Quando várias metas servem à mesma ideia — "ser a escolha óbvia de quem
                  vende pesado no Vale do Aço" —, um objetivo as agrupa e mostra o progresso do
                  conjunto. Para uma meta solta de MRR, não é preciso.
                </p>
              </Panel>
            ) : (
              <div className="flex flex-col gap-3">
                {(objetivos.data ?? []).map((o) => {
                  const lista = comValor(porObjetivo.get(o.id) ?? []);
                  const prog = progressoDoObjetivo(lista);
                  const dono = team.find((t) => t.id === o.dono_id);
                  return (
                    <Panel key={o.id} className="overflow-hidden">
                      <div className="px-4 py-3.5 flex items-start gap-3">
                        <Target className="h-4 w-4 text-primary/70 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold text-foreground leading-snug">{o.titulo}</p>
                          {o.porque && <p className="text-[11.5px] text-foreground/45 mt-0.5">{o.porque}</p>}
                          <div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-foreground/35">
                            <span className="uppercase tracking-wide">{o.nivel}</span>
                            {dono && <><span>·</span><span>{dono.full_name}</span></>}
                            {o.status !== 'ativo' && <><span>·</span><span>{o.status}</span></>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[18px] font-bold tabular-nums leading-none">{pct(prog)}</p>
                          <div className="flex items-center gap-1 mt-2">
                            <button onClick={() => setDialogObjetivo(o)}
                              className="h-7 w-7 rounded-lg text-foreground/35 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Apagar "${o.titulo}" e seus resultados-chave?`)) {
                                  apagarObjetivo.mutate(o.id);
                                }
                              }}
                              className="h-7 w-7 rounded-lg text-foreground/35 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-black/[0.05] dark:border-white/[0.05] divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                        {lista.map(linhaDaMeta)}
                        <button
                          onClick={() => setDialogKR({ ciclo_id: ciclo.data!.id, objetivo_id: o.id, unidade: 'numero', direcao: 'subir', fonte: 'manual', partida: 0 })}
                          className="w-full px-4 py-2.5 text-left text-[11.5px] text-primary hover:bg-primary/5 flex items-center gap-1.5">
                          <Plus className="h-3 w-3" /> Resultado-chave
                        </button>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {dialogObjetivo && (
        <DialogObjetivo
          valor={dialogObjetivo}
          equipe={team}
          onFechar={() => setDialogObjetivo(null)}
          onSalvar={async (v) => {
            if (v.id) await salvarObjetivo.mutateAsync(v as Objetivo & { id: string });
            else await criarObjetivo.mutateAsync(v as never);
            setDialogObjetivo(null);
            toast.success('Objetivo salvo');
          }}
        />
      )}

      {dialogKR && (
        <DialogKR
          valor={dialogKR}
          valorDe={(c) => (periodo.inicio ? valorDaMetrica(c, dados, periodo) : null)}
          onFechar={() => setDialogKR(null)}
          onSalvar={async (v) => {
            await salvarKR.mutateAsync(v as never);
            setDialogKR(null);
            toast.success('Resultado-chave salvo');
          }}
        />
      )}

      {dialogCheckin && (
        <DialogCheckin
          kr={dialogCheckin}
          atual={valorDoKr(dialogCheckin)}
          onFechar={() => setDialogCheckin(null)}
          onSalvar={async (v) => {
            await fazerCheckin.mutateAsync({
              kr_id: dialogCheckin.id, valor: v.valor, confianca: v.confianca,
              comentario: v.comentario, autor_id: member?.id ?? null,
              autor_nome: member?.full_name ?? null,
            });
            setDialogCheckin(null);
            toast.success('Check-in registrado');
          }}
        />
      )}

      {editandoNSM && nsm.data && (
        <DialogNSM
          valor={nsm.data}
          onFechar={() => setEditandoNSM(false)}
          onSalvar={async (v) => {
            await salvarNSM.mutateAsync(v);
            setEditandoNSM(false);
            toast.success('Métrica-norte atualizada');
          }}
        />
      )}
    </div>
  );
}

/* ── Peças ───────────────────────────────────────────────────── */

const Painel = ({ titulo, valor, sub, tom }: {
  titulo: string; valor: string | number; sub?: string; tom?: 'ruim' | 'atencao';
}) => (
  <Panel className="p-3.5">
    <p className="text-[10px] font-semibold tracking-widest uppercase text-foreground/35">{titulo}</p>
    <p className={cn('text-[19px] font-bold tabular-nums mt-1.5',
      tom === 'ruim' && 'text-red-400', tom === 'atencao' && 'text-amber-500')}>
      {valor}
    </p>
    {sub && <p className="text-[10.5px] text-foreground/35 mt-0.5">{sub}</p>}
  </Panel>
);

const campo = 'h-11 rounded-xl';

function DialogObjetivo({ valor, equipe, onFechar, onSalvar }: {
  valor: Partial<Objetivo>;
  equipe: { id: string; full_name: string }[];
  onFechar: () => void;
  onSalvar: (v: Partial<Objetivo>) => Promise<void>;
}) {
  const [v, setV] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  return (
    <Dialog open onOpenChange={onFechar}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{v.id ? 'Editar objetivo' : 'Novo objetivo'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[12px]">O objetivo</Label>
            <Input className={campo} autoFocus value={v.titulo ?? ''}
              placeholder="Ser a escolha óbvia de quem vende pesado no Vale do Aço"
              onChange={(e) => setV({ ...v, titulo: e.target.value })} />
            <p className="text-[11px] text-foreground/35">
              Curto, qualitativo e incômodo. O número vem nos resultados-chave.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Por que isso importa</Label>
            <Textarea rows={2} value={v.porque ?? ''}
              placeholder="Objetivo sem porquê vira tarefa."
              onChange={(e) => setV({ ...v, porque: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Dono</Label>
              <select className={cn(campo, 'w-full border border-black/[0.1] dark:border-white/[0.1] bg-background px-3 text-[13px]')}
                value={v.dono_id ?? ''} onChange={(e) => setV({ ...v, dono_id: e.target.value || null })}>
                <option value="">sem dono</option>
                {equipe.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Nível</Label>
              <select className={cn(campo, 'w-full border border-black/[0.1] dark:border-white/[0.1] bg-background px-3 text-[13px]')}
                value={v.nivel ?? 'empresa'} onChange={(e) => setV({ ...v, nivel: e.target.value as never })}>
                <option value="empresa">Empresa</option>
                <option value="time">Time</option>
                <option value="pessoa">Pessoa</option>
              </select>
            </div>
          </div>
          {v.id && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">Situação</Label>
              <select className={cn(campo, 'w-full border border-black/[0.1] dark:border-white/[0.1] bg-background px-3 text-[13px]')}
                value={v.status ?? 'ativo'} onChange={(e) => setV({ ...v, status: e.target.value as never })}>
                <option value="ativo">Ativo</option>
                <option value="rascunho">Rascunho</option>
                <option value="concluido">Concluído</option>
                <option value="abandonado">Abandonado</option>
              </select>
            </div>
          )}
          <Rodape salvando={salvando} onFechar={onFechar} podeSalvar={!!v.titulo?.trim()}
            onSalvar={async () => { setSalvando(true); try { await onSalvar(v); } finally { setSalvando(false); } }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DialogKR({ valor, valorDe, onFechar, onSalvar }: {
  valor: Partial<KRRow> & { ciclo_id: string };
  /** O valor de agora da métrica — vira a partida da meta. */
  valorDe: (c: ChaveMetrica) => number | null;
  onFechar: () => void;
  onSalvar: (v: Partial<KRRow> & { ciclo_id: string }) => Promise<void>;
}) {
  const [v, setV] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const def = v.fonte && v.fonte !== 'manual' ? METRICAS[v.fonte as ChaveMetrica] : null;

  /* Escolher a métrica responde quase tudo: unidade, direção, a partida
     (que é onde se está HOJE) e até o nome da meta. O que sobra para
     digitar é o alvo — que é a única coisa que o sistema não tem como
     saber. */
  const escolherFonte = (f: 'manual' | ChaveMetrica) => {
    if (f === 'manual') {
      setV({ ...v, fonte: 'manual', partida: 0 });
      return;
    }
    const d = METRICAS[f];
    const agora = valorDe(f);
    setV({
      ...v,
      fonte: f,
      unidade: d.unidade as never,
      direcao: (d.menorEMelhor ? 'descer' : 'subir') as never,
      partida: agora ?? 0,
      titulo: v.titulo?.trim() ? v.titulo : d.rotulo,
    });
  };
  return (
    <Dialog open onOpenChange={onFechar}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{v.id ? 'Editar resultado-chave' : 'Novo resultado-chave'}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label className="text-[12px]">O resultado</Label>
            <Input className={campo} autoFocus value={v.titulo ?? ''}
              placeholder="Chegar a 20 lojas pagando"
              onChange={(e) => setV({ ...v, titulo: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">O que medir</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ATALHOS.map((c) => (
                <button key={c} type="button" onClick={() => escolherFonte(c)}
                  className={cn('px-3 py-2.5 rounded-xl border-2 text-left text-[12px] font-medium transition-all',
                    v.fonte === c ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40')}>
                  {METRICAS[c].rotulo}
                  <span className="block text-[10px] font-normal text-foreground/35 tabular-nums">
                    hoje: {formatarValor(valorDe(c), METRICAS[c].unidade as never)}
                  </span>
                </button>
              ))}
              <button type="button" onClick={() => escolherFonte('manual')}
                className={cn('px-3 py-2.5 rounded-xl border-2 text-left text-[12px] font-medium transition-all',
                  (v.fonte ?? 'manual') === 'manual' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40')}>
                Outra coisa
                <span className="block text-[10px] font-normal text-foreground/35">eu informo no check-in</span>
              </button>
            </div>
            <button type="button" onClick={() => setVerTodas((x) => !x)}
              className="text-[11px] text-foreground/40 hover:text-foreground underline">
              {verTodas ? 'esconder a lista completa' : 'ver todas as métricas do painel'}
            </button>
            {verTodas && (
              <select className={cn(campo, 'w-full border border-black/[0.1] dark:border-white/[0.1] bg-background px-3 text-[13px]')}
                value={v.fonte ?? 'manual'}
                onChange={(e) => escolherFonte(e.target.value as never)}>
                <option value="manual">Manual — alguém informa no check-in</option>
                {CHAVES_DE_METRICA.map((c) => (
                  <option key={c} value={c}>{METRICAS[c].rotulo} (automático)</option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-foreground/35 leading-snug">
              {def
                ? `${def.explica} ${def.natureza === 'fluxo' ? 'Conta só o que acontecer dentro do ciclo.' : 'É o número de hoje, não do período.'}${def.daBase ? ' Lê o sistema dos clientes — cada leitura fica registrada.' : ''}`
                : 'Para o que o sistema não vê: contratar, assinar, lançar. O valor vem do check-in.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Partida</Label>
              <Input className={campo} inputMode="numeric" value={v.partida ?? 0}
                onChange={(e) => setV({ ...v, partida: Number(e.target.value.replace(',', '.')) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Alvo</Label>
              <Input className={campo} inputMode="numeric" value={v.alvo ?? ''}
                onChange={(e) => setV({ ...v, alvo: Number(e.target.value.replace(',', '.')) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Unidade</Label>
              <select className={cn(campo, 'w-full border border-black/[0.1] dark:border-white/[0.1] bg-background px-3 text-[13px]')}
                value={v.unidade ?? 'numero'} onChange={(e) => setV({ ...v, unidade: e.target.value as never })}>
                <option value="numero">Número</option>
                <option value="moeda">R$</option>
                <option value="percentual">%</option>
                <option value="marco">Marco (feito ou não)</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-foreground/35 -mt-1">
            A partida é de onde se está hoje. Sem ela, um KR que já nasce em 8 de 10 mostra 80% no primeiro dia.
          </p>

          <div className="space-y-1.5">
            <Label className="text-[12px]">Direção</Label>
            <div className="flex gap-2">
              {(['subir', 'descer'] as const).map((d) => (
                <button key={d} type="button" onClick={() => setV({ ...v, direcao: d })}
                  className={cn('px-4 py-2 rounded-xl border-2 text-[12.5px] font-medium',
                    (v.direcao ?? 'subir') === d
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/40')}>
                  {d === 'subir' ? 'Quanto maior, melhor' : 'Quanto menor, melhor'}
                </button>
              ))}
            </div>
          </div>

          <Rodape salvando={salvando} onFechar={onFechar}
            podeSalvar={!!v.titulo?.trim() && v.alvo !== undefined}
            onSalvar={async () => { setSalvando(true); try { await onSalvar(v); } finally { setSalvando(false); } }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DialogCheckin({ kr, atual, onFechar, onSalvar }: {
  kr: KRRow; atual: number | null;
  onFechar: () => void;
  onSalvar: (v: { valor: number | null; confianca: 'alta' | 'media' | 'baixa'; comentario: string }) => Promise<void>;
}) {
  const automatico = kr.fonte !== 'manual';
  const [valor, setValor] = useState(atual !== null ? String(atual) : '');
  const [confianca, setConfianca] = useState<'alta' | 'media' | 'baixa'>('media');
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);
  return (
    <Dialog open onOpenChange={onFechar}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Check-in</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-[12.5px] text-foreground/70">{kr.titulo}</p>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Onde está hoje</Label>
            <Input className={campo} inputMode="numeric" value={valor} disabled={automatico}
              onChange={(e) => setValor(e.target.value)} />
            {automatico && (
              <p className="text-[11px] text-foreground/35">
                Este número vem do sistema ({METRICAS[kr.fonte as ChaveMetrica]?.rotulo}) e não se digita.
                O check-in aqui é a leitura da semana e o comentário.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Confiança de bater o alvo</Label>
            <div className="flex gap-2">
              {([['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']] as const).map(([k, r]) => (
                <button key={k} type="button" onClick={() => setConfianca(k)}
                  className={cn('px-4 py-2 rounded-xl border-2 text-[12.5px] font-medium',
                    confianca === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40')}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">O que mudou desde a última vez</Label>
            <Textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)}
              placeholder="O que travou, o que destravou, o que você vai fazer a respeito." />
          </div>
          <Rodape salvando={salvando} onFechar={onFechar} podeSalvar
            rotulo="Registrar"
            onSalvar={async () => {
              setSalvando(true);
              try {
                await onSalvar({
                  valor: automatico ? atual : (valor === '' ? null : Number(valor.replace(',', '.'))),
                  confianca, comentario,
                });
              } finally { setSalvando(false); }
            }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DialogNSM({ valor, onFechar, onSalvar }: {
  valor: { metrica: ChaveMetrica; rotulo: string; porque: string | null; unidade: string; meta_ano: number | null };
  onFechar: () => void;
  onSalvar: (v: { metrica: ChaveMetrica; rotulo: string; porque: string; unidade: never; meta_ano: number | null }) => Promise<void>;
}) {
  const [v, setV] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  return (
    <Dialog open onOpenChange={onFechar}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Métrica-norte</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-[12px] text-foreground/50 leading-relaxed">
            Uma só. Ela mede o valor que o produto entrega, não o esforço da equipe — e por isso
            não muda de trimestre em trimestre. Se duas parecerem igualmente boas, escolha a que
            o cliente sentiria se parasse de subir.
          </p>
          <div className="space-y-1.5">
            <Label className="text-[12px]">A métrica</Label>
            <select className={cn(campo, 'w-full border border-black/[0.1] dark:border-white/[0.1] bg-background px-3 text-[13px]')}
              value={v.metrica}
              onChange={(e) => {
                const m = e.target.value as ChaveMetrica;
                setV({ ...v, metrica: m, rotulo: METRICAS[m].rotulo, unidade: METRICAS[m].unidade });
              }}>
              {CHAVES_DE_METRICA.map((c) => <option key={c} value={c}>{METRICAS[c].rotulo}</option>)}
            </select>
            <p className="text-[11px] text-foreground/35">{METRICAS[v.metrica]?.explica}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Como chamar na tela</Label>
            <Input className={campo} value={v.rotulo} onChange={(e) => setV({ ...v, rotulo: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Por que esta</Label>
            <Textarea rows={2} value={v.porque ?? ''} onChange={(e) => setV({ ...v, porque: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Meta do ano</Label>
            <Input className={campo} inputMode="numeric" value={v.meta_ano ?? ''}
              onChange={(e) => setV({ ...v, meta_ano: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} />
          </div>
          <Rodape salvando={salvando} onFechar={onFechar} podeSalvar
            onSalvar={async () => { setSalvando(true); try { await onSalvar(v as never); } finally { setSalvando(false); } }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

const Rodape = ({ salvando, onFechar, onSalvar, podeSalvar, rotulo = 'Salvar' }: {
  salvando: boolean; onFechar: () => void; onSalvar: () => void; podeSalvar: boolean; rotulo?: string;
}) => (
  <div className="flex items-center justify-end gap-2 pt-2">
    <button onClick={onFechar} disabled={salvando}
      className="h-10 px-4 rounded-xl text-[12.5px] text-foreground/50 hover:text-foreground">
      Cancelar
    </button>
    <button onClick={onSalvar} disabled={salvando || !podeSalvar}
      className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
      {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      {rotulo}
    </button>
  </div>
);
