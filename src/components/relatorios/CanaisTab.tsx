import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import {
  Radio, Coins, Gauge, XCircle, TrendingUp, Users, Timer, AlertTriangle,
  Target, Percent, Layers,
} from 'lucide-react';
import type {
  Client, Prospect, Meeting, AcquisitionChannel, ProspectEvent, FinTransaction,
} from '@/hooks/useAdmin';
import {
  GCard, SectionTitle, KpiGrid, Chart, CTip, Empty, ZebraTable, Tr, Td,
  SubTabs, BarRow, brl, brlFull, pct, razao, EIXO, GRADE, CURSOR,
} from './primitives';

/* ══════════════════════════════════════════════════════════════════
   AQUISIÇÃO POR CANAL

   Três fontes se cruzam aqui, e cada uma responde uma pergunta:
   · prospects.channel_id  — de onde veio
   · prospect_events       — por onde passou e quanto tempo levou
   · financial_transactions.channel_id — quanto custou

   REGRA DE COORTE: tudo é medido sobre os prospects CRIADOS no período,
   e o marco conta onde ele aconteceu, mesmo que depois do fim do período.
   Filtrar cada degrau pela própria data cruzaria turmas diferentes e
   produziria taxas acima de 100%.

   O QUE NÃO EXISTE, e por quê — nada aqui é estimado:
   · LTV depende de vida média, que depende de cancelamento. Sem cliente
     cancelado, LTV e LTV/CAC aparecem como travessão, não como número
     bonito. Métrica inventada em verde é pior que célula vazia.
   ══════════════════════════════════════════════════════════════════ */

interface Props {
  prospects: Prospect[];
  clients: Client[];
  meetings: Meeting[];
  canais: AcquisitionChannel[];
  eventos: ProspectEvent[];
  transacoes: FinTransaction[];
  periodo: { start: string; end: string };
  label: string;
}

const DIA = 86_400_000;
const dias = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / DIA);
const nDias = (n: number) => (n >= 10 ? `${Math.round(n)}d` : `${n.toFixed(1)}d`);

const ORDEM_ETAPA = ['contato', 'oportunidade', 'reuniao', 'vendido'] as const;
const ROTULO_ETAPA: Record<string, string> = {
  contato: 'Contato', oportunidade: 'Oportunidade',
  reuniao: 'Reunião', vendido: 'Vendido', perdido: 'Perdido',
};

const SEM_CANAL = '__sem__';

/** Uma linha de canal, com tudo já calculado. */
interface Linha {
  id: string;
  nome: string;
  cor: string;
  leads: number;
  chegouOportunidade: number;
  chegouReuniao: number;
  vendidos: number;
  perdidos: number;
  abertos: number;
  mrr: number;
  investimento: number;
  cicloDias: number | null;
  reunioesRealizadas: number;
  reunioesAgendadas: number;
  /** dias médios em cada etapa */
  tempoEtapa: Record<string, number | null>;
  /** onde morreram os perdidos */
  morteEm: Record<string, number>;
  motivos: { motivo: string; n: number }[];
}

export function CanaisTab({
  prospects, clients, meetings, canais, eventos, transacoes, periodo, label,
}: Props) {
  const [sub, setSub] = useState('Desempenho');

  const inP = (iso: string | null | undefined) =>
    !!iso && iso.slice(0, 10) >= periodo.start && iso.slice(0, 10) <= periodo.end;

  /* ── Vida média, medida. Sem cancelamento não há número. ────────── */
  const vidaMediaMeses = useMemo(() => {
    const encerrados = clients.filter((c) => c.canceled_at && c.activated_at);
    if (encerrados.length === 0) return null;
    const total = encerrados.reduce(
      (s, c) => s + dias(c.activated_at as string, c.canceled_at as string) / 30.44, 0,
    );
    return total / encerrados.length;
  }, [clients]);

  /* ── Índice de eventos por prospect ─────────────────────────────── */
  const eventosPor = useMemo(() => {
    const m = new Map<string, ProspectEvent[]>();
    eventos.forEach((e) => {
      const l = m.get(e.prospect_id) ?? [];
      l.push(e);
      m.set(e.prospect_id, l);
    });
    m.forEach((l) => l.sort((a, b) => a.at.localeCompare(b.at)));
    return m;
  }, [eventos]);

  /* ── A tabela-mãe ───────────────────────────────────────────────── */
  const linhas = useMemo<Linha[]>(() => {
    const daTurma = prospects.filter((p) => inP(p.created_at));

    const mapa = new Map<string, Linha>();
    const nova = (id: string, nome: string, cor: string): Linha => ({
      id, nome, cor,
      leads: 0, chegouOportunidade: 0, chegouReuniao: 0, vendidos: 0,
      perdidos: 0, abertos: 0, mrr: 0, investimento: 0, cicloDias: null,
      reunioesRealizadas: 0, reunioesAgendadas: 0,
      tempoEtapa: {}, morteEm: {}, motivos: [],
    });

    canais.forEach((c) => mapa.set(c.id, nova(c.id, c.name, c.color)));
    mapa.set(SEM_CANAL, nova(SEM_CANAL, 'Sem canal informado', '#64748b'));

    // acumuladores que viram média no fim
    const ciclos = new Map<string, number[]>();
    const temposEtapa = new Map<string, Record<string, number[]>>();
    const motivos = new Map<string, Map<string, number>>();

    const clientePorProspect = new Map<string, Client>();
    clients.forEach((c) => { if (c.prospect_id) clientePorProspect.set(c.prospect_id, c); });

    for (const p of daTurma) {
      const chave = p.channel_id ?? SEM_CANAL;
      const l = mapa.get(chave) ?? mapa.get(SEM_CANAL)!;
      l.leads += 1;

      const evs = eventosPor.get(p.id) ?? [];
      const alcancou = new Set(evs.map((e) => e.to_stage));
      // O estágio atual conta como alcançado mesmo sem evento — protege
      // linhas antigas, anteriores ao gatilho.
      alcancou.add(p.stage);

      if (alcancou.has('oportunidade') || alcancou.has('reuniao') || alcancou.has('vendido')) l.chegouOportunidade += 1;
      if (alcancou.has('reuniao') || alcancou.has('vendido')) l.chegouReuniao += 1;
      if (alcancou.has('vendido')) l.vendidos += 1;
      if (p.stage === 'perdido') l.perdidos += 1;
      if (p.stage !== 'perdido' && p.stage !== 'vendido') l.abertos += 1;

      // MRR: o do cliente quando existe; a proposta como aproximação nos
      // vendidos que ainda não viraram cliente.
      if (alcancou.has('vendido')) {
        const cli = clientePorProspect.get(p.id);
        l.mrr += cli?.mrr ?? p.proposal_value ?? 0;
      }

      // ciclo: do primeiro evento até a entrada em vendido
      const venda = evs.find((e) => e.to_stage === 'vendido');
      if (venda) {
        const d = dias(p.created_at, venda.at);
        const arr = ciclos.get(chave) ?? [];
        arr.push(d);
        ciclos.set(chave, arr);
      }

      // tempo em cada etapa
      const porEtapa = temposEtapa.get(chave) ?? {};
      evs.forEach((e, i) => {
        const prox = evs[i + 1];
        if (!prox) return;                       // etapa ainda em curso
        const d = dias(e.at, prox.at);
        (porEtapa[e.to_stage] ??= []).push(d);
      });
      temposEtapa.set(chave, porEtapa);

      // onde morreu
      if (p.stage === 'perdido') {
        const antes = [...evs].reverse().find((e) => e.to_stage !== 'perdido');
        const etapa = antes?.to_stage ?? 'contato';
        l.morteEm[etapa] = (l.morteEm[etapa] ?? 0) + 1;
        if (p.lost_reason) {
          const m = motivos.get(chave) ?? new Map<string, number>();
          const k = p.lost_reason.trim();
          m.set(k, (m.get(k) ?? 0) + 1);
          motivos.set(chave, m);
        }
      }
    }

    // reuniões da turma
    const idsDaTurma = new Set(daTurma.map((p) => p.id));
    const canalDe = new Map(daTurma.map((p) => [p.id, p.channel_id ?? SEM_CANAL]));
    meetings.forEach((m) => {
      if (!m.prospect_id || !idsDaTurma.has(m.prospect_id)) return;
      const l = mapa.get(canalDe.get(m.prospect_id) as string);
      if (!l) return;
      l.reunioesAgendadas += 1;
      if (m.status === 'realizada') l.reunioesRealizadas += 1;
    });

    // investimento: despesa com canal, pela COMPETÊNCIA no período
    transacoes.forEach((t) => {
      if (t.type !== 'despesa' || !t.channel_id) return;
      if (!inP(t.competence_date)) return;
      const l = mapa.get(t.channel_id);
      if (l) l.investimento += Number(t.amount) || 0;
    });

    // fecha as médias
    mapa.forEach((l, chave) => {
      const c = ciclos.get(chave);
      l.cicloDias = c && c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;

      const pe = temposEtapa.get(chave) ?? {};
      ORDEM_ETAPA.forEach((et) => {
        const arr = pe[et];
        l.tempoEtapa[et] = arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      });

      l.motivos = [...(motivos.get(chave)?.entries() ?? [])]
        .map(([motivo, n]) => ({ motivo, n }))
        .sort((a, b) => b.n - a.n);
    });

    return [...mapa.values()]
      .filter((l) => l.leads > 0 || l.investimento > 0)
      .sort((a, b) => b.leads - a.leads || b.investimento - a.investimento);
  }, [prospects, clients, meetings, canais, eventosPor, transacoes, periodo.start, periodo.end]);

  const tot = useMemo(() => linhas.reduce((a, l) => ({
    leads: a.leads + l.leads,
    vendidos: a.vendidos + l.vendidos,
    mrr: a.mrr + l.mrr,
    investimento: a.investimento + l.investimento,
  }), { leads: 0, vendidos: 0, mrr: 0, investimento: 0 }), [linhas]);

  /* Concentração: quanto dos vendidos vem do maior canal. Depender de um
     canal só é risco, e é invisível numa tabela ordenada por volume. */
  const concentracao = useMemo(() => {
    if (tot.vendidos === 0) return null;
    const maior = Math.max(...linhas.map((l) => l.vendidos));
    return maior / tot.vendidos;
  }, [linhas, tot.vendidos]);

  const melhorCanal = useMemo(() => {
    const comCac = linhas.filter((l) => l.vendidos > 0 && l.investimento > 0);
    if (!comCac.length) return null;
    return comCac.reduce((melhor, l) =>
      (l.investimento / l.vendidos) < (melhor.investimento / melhor.vendidos) ? l : melhor);
  }, [linhas]);

  const semCanal = linhas.find((l) => l.id === SEM_CANAL)?.leads ?? 0;

  if (linhas.length === 0) {
    return (
      <GCard>
        <SectionTitle icon={<Radio className="h-4 w-4" />} title="Aquisição por canal" sub={label} />
        <Empty>Nenhum prospect criado neste período.</Empty>
      </GCard>
    );
  }

  return (
    <div className="space-y-5">
      <KpiGrid
        cols={4}
        items={[
          {
            label: 'Leads no período', value: String(tot.leads),
            sub: `${linhas.filter((l) => l.leads > 0).length} canais ativos`,
            icon: <Users className="h-4 w-4" />,
          },
          {
            label: 'CAC médio',
            value: razao(tot.investimento, tot.vendidos, brl),
            sub: tot.investimento === 0
              ? 'Nenhuma despesa marcada com canal'
              : `${brl(tot.investimento)} ÷ ${tot.vendidos} clientes`,
            icon: <Coins className="h-4 w-4" />,
            accent: true,
          },
          {
            label: 'Menor CAC',
            value: melhorCanal ? melhorCanal.nome : '—',
            sub: melhorCanal ? `${brl(melhorCanal.investimento / melhorCanal.vendidos)} por cliente` : 'Sem custo lançado',
            icon: <Target className="h-4 w-4" />,
          },
          {
            label: 'Concentração',
            value: concentracao === null ? '—' : `${(concentracao * 100).toFixed(0)}%`,
            sub: concentracao === null ? 'Sem vendas no período' : 'dos ganhos vêm do maior canal',
            icon: <Layers className="h-4 w-4" />,
            negative: concentracao !== null && concentracao > 0.6,
          },
        ]}
      />

      {semCanal > 0 && (
        <div className="flex items-start gap-2 text-[12px] text-amber-500 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>
            <b>{semCanal}</b> {semCanal === 1 ? 'prospect' : 'prospects'} sem canal informado no período.
            Enquanto existirem, toda taxa abaixo está subestimada — eles entram no total e em nenhum canal.
          </span>
        </div>
      )}

      <SubTabs opcoes={['Desempenho', 'Custo', 'Velocidade', 'Perdas']} valor={sub} onChange={setSub} cor="primary" />

      {/* ─────────────────────────── DESEMPENHO ─────────────────────── */}
      {sub === 'Desempenho' && (
        <>
          <GCard>
            <SectionTitle
              icon={<Radio className="h-4 w-4" />}
              title="Funil por canal"
              sub={`Coorte de ${label}: prospects criados no período, com o marco contado onde aconteceu`}
            />
            <ZebraTable
              sticky
              head={['Canal', 'Leads', '%', '→ Oportun.', 'taxa', '→ Reunião', 'taxa', 'Vendidos', 'win rate', 'Perdidos', 'Abertos', 'MRR', 'Ticket', 'Ciclo']}
            >
              {linhas.map((l) => (
                <Tr key={l.id}>
                  <Td sticky>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: l.cor }} />
                      {l.nome}
                    </span>
                  </Td>
                  <Td className="text-foreground font-semibold">{l.leads}</Td>
                  <Td>{pct(l.leads, tot.leads, 0)}</Td>
                  <Td>{l.chegouOportunidade}</Td>
                  <Td>{pct(l.chegouOportunidade, l.leads, 0)}</Td>
                  <Td>{l.chegouReuniao}</Td>
                  <Td>{pct(l.chegouReuniao, l.leads, 0)}</Td>
                  <Td className="text-emerald-400 font-semibold">{l.vendidos}</Td>
                  <Td className="text-emerald-400">{pct(l.vendidos, l.leads, 0)}</Td>
                  <Td className="text-red-400/70">{l.perdidos}</Td>
                  <Td>{l.abertos}</Td>
                  <Td className="text-foreground">{brl(l.mrr)}</Td>
                  <Td>{razao(l.mrr, l.vendidos, brl)}</Td>
                  <Td>{l.cicloDias === null ? '—' : nDias(l.cicloDias)}</Td>
                </Tr>
              ))}
            </ZebraTable>
          </GCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <GCard>
              <SectionTitle icon={<Percent className="h-4 w-4" />} title="Volume × conversão" sub="Canal que traz muito e converte pouco fica embaixo à direita" />
              {linhas.filter((l) => l.leads > 0).length === 0 ? (
                <Empty h={260}>Sem leads no período.</Empty>
              ) : (
                <Chart h={260}>
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 0 }}>
                    <CartesianGrid stroke={GRADE} />
                    <XAxis
                      type="number" dataKey="leads" name="Leads" {...EIXO}
                      label={{ value: 'leads', position: 'insideBottom', offset: -12, fill: 'rgba(148,163,184,0.6)', fontSize: 11 }}
                    />
                    <YAxis
                      type="number" dataKey="conv" name="Conversão" unit="%" {...EIXO}
                    />
                    <ZAxis type="number" dataKey="mrr" range={[60, 400]} name="MRR" />
                    <Tooltip cursor={CURSOR} content={<CTip fmt={(v: number) => String(v)} />} />
                    <Scatter
                      data={linhas.filter((l) => l.leads > 0).map((l) => ({
                        nome: l.nome, leads: l.leads, mrr: l.mrr,
                        conv: Number(((l.vendidos / l.leads) * 100).toFixed(1)),
                        cor: l.cor,
                      }))}
                    >
                      {linhas.filter((l) => l.leads > 0).map((l) => <Cell key={l.id} fill={l.cor} />)}
                    </Scatter>
                  </ScatterChart>
                </Chart>
              )}
            </GCard>

            <GCard>
              <SectionTitle icon={<Users className="h-4 w-4" />} title="Comparecimento em reunião" sub="Agendadas × realizadas, por canal" />
              <div className="space-y-2.5 pt-1">
                {linhas.filter((l) => l.reunioesAgendadas > 0).length === 0 ? (
                  <Empty h={200}>Nenhuma reunião agendada para esta turma.</Empty>
                ) : (
                  linhas.filter((l) => l.reunioesAgendadas > 0).map((l) => (
                    <BarRow
                      key={l.id}
                      label={l.nome}
                      valor={l.reunioesRealizadas}
                      total={l.reunioesAgendadas}
                      cor={l.cor}
                      right={`${l.reunioesRealizadas}/${l.reunioesAgendadas}`}
                    />
                  ))
                )}
              </div>
            </GCard>
          </div>
        </>
      )}

      {/* ─────────────────────────── CUSTO ──────────────────────────── */}
      {sub === 'Custo' && (
        <>
          <GCard>
            <SectionTitle
              icon={<Coins className="h-4 w-4" />}
              title="Custo de aquisição por canal"
              sub="Despesas com canal marcado, pela competência no período"
            />
            {tot.investimento === 0 ? (
              <Empty h={160}>
                Nenhuma despesa marcada com canal neste período. Em Financeiro, escolha o canal
                ao lançar a despesa — é o que transforma gasto em CAC.
              </Empty>
            ) : (
              <ZebraTable
                sticky
                head={['Canal', 'Investido', 'Leads', 'Custo/lead', 'Reuniões', 'Custo/reunião', 'Clientes', 'CAC', 'Ticket', 'Payback', 'LTV', 'LTV/CAC', 'Retorno']}
              >
                {linhas.map((l) => {
                  const cac = l.vendidos > 0 ? l.investimento / l.vendidos : null;
                  const ticket = l.vendidos > 0 ? l.mrr / l.vendidos : null;
                  const ltv = ticket !== null && vidaMediaMeses !== null ? ticket * vidaMediaMeses : null;
                  return (
                    <Tr key={l.id}>
                      <Td sticky>
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: l.cor }} />
                          {l.nome}
                        </span>
                      </Td>
                      <Td className="text-foreground">{l.investimento > 0 ? brl(l.investimento) : '—'}</Td>
                      <Td>{l.leads}</Td>
                      <Td>{razao(l.investimento, l.leads, brl)}</Td>
                      <Td>{l.reunioesRealizadas}</Td>
                      <Td>{razao(l.investimento, l.reunioesRealizadas, brl)}</Td>
                      <Td className="text-emerald-400">{l.vendidos}</Td>
                      <Td className="text-foreground font-semibold">{cac === null ? '—' : brl(cac)}</Td>
                      <Td>{ticket === null ? '—' : brl(ticket)}</Td>
                      <Td>{cac !== null && ticket ? `${(cac / ticket).toFixed(1)} m` : '—'}</Td>
                      <Td>{ltv === null ? '—' : brl(ltv)}</Td>
                      <Td className={ltv !== null && cac ? (ltv / cac >= 3 ? 'text-emerald-400' : 'text-amber-400') : ''}>
                        {ltv !== null && cac ? `${(ltv / cac).toFixed(1)}×` : '—'}
                      </Td>
                      <Td>{razao(l.mrr, l.investimento, (n) => `${n.toFixed(2)}×`)}</Td>
                    </Tr>
                  );
                })}
              </ZebraTable>
            )}
            <p className="text-[11px] text-foreground/35 mt-3 leading-relaxed">
              {vidaMediaMeses === null ? (
                <>
                  <b>LTV aparece como travessão de propósito.</b> Ele depende da vida média do cliente,
                  que depende de cliente cancelado — e ainda não há nenhum. Preencher com um chute
                  daria um LTV/CAC bonito e falso.
                </>
              ) : (
                <>Vida média medida: <b>{vidaMediaMeses.toFixed(1)} meses</b>, de {clients.filter((c) => c.canceled_at).length} cliente(s) encerrado(s). LTV = ticket × vida média.</>
              )}
            </p>
          </GCard>

          <GCard>
            <SectionTitle icon={<TrendingUp className="h-4 w-4" />} title="Investido × MRR gerado" sub="A barra clara é o que entrou de recorrente" />
            {tot.investimento === 0 && tot.mrr === 0 ? (
              <Empty h={260}>Sem investimento nem receita no período.</Empty>
            ) : (
              <Chart h={280}>
                <BarChart data={linhas.map((l) => ({ nome: l.nome, Investido: l.investimento, MRR: l.mrr }))}>
                  <CartesianGrid stroke={GRADE} vertical={false} />
                  <XAxis dataKey="nome" {...EIXO} interval={0} angle={-18} textAnchor="end" height={62} />
                  <YAxis {...EIXO} tickFormatter={(v) => brl(v as number)} />
                  <Tooltip cursor={CURSOR} content={<CTip fmt={brlFull} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Investido" fill="rgba(148,163,184,0.45)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="MRR" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </Chart>
            )}
          </GCard>
        </>
      )}

      {/* ─────────────────────────── VELOCIDADE ─────────────────────── */}
      {sub === 'Velocidade' && (
        <>
          <GCard>
            <SectionTitle
              icon={<Timer className="h-4 w-4" />}
              title="Tempo em cada etapa"
              sub="Média de dias entre a entrada na etapa e a saída dela — só transições concluídas"
            />
            <ZebraTable sticky head={['Canal', ...ORDEM_ETAPA.slice(0, 3).map((e) => ROTULO_ETAPA[e]), 'Ciclo total']}>
              {linhas.map((l) => (
                <Tr key={l.id}>
                  <Td sticky>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: l.cor }} />
                      {l.nome}
                    </span>
                  </Td>
                  {ORDEM_ETAPA.slice(0, 3).map((e) => (
                    <Td key={e}>{l.tempoEtapa[e] === null || l.tempoEtapa[e] === undefined ? '—' : nDias(l.tempoEtapa[e] as number)}</Td>
                  ))}
                  <Td className="text-foreground font-semibold">{l.cicloDias === null ? '—' : nDias(l.cicloDias)}</Td>
                </Tr>
              ))}
            </ZebraTable>
            <p className="text-[11px] text-foreground/35 mt-3">
              Etapa em curso não entra na média — ela ainda não terminou, e contá-la puxaria o número para baixo todo dia.
            </p>
          </GCard>

          <GCard>
            <SectionTitle icon={<Gauge className="h-4 w-4" />} title="Parados" sub="Aberto há mais tempo na mesma etapa — a fila de quem precisa de um toque" />
            <ParadosLista prospects={prospects} canais={canais} eventosPor={eventosPor} />
          </GCard>
        </>
      )}

      {/* ─────────────────────────── PERDAS ─────────────────────────── */}
      {sub === 'Perdas' && (
        <>
          <GCard>
            <SectionTitle
              icon={<XCircle className="h-4 w-4" />}
              title="Em que etapa cada canal morre"
              sub="A última etapa antes de virar perdido — `stage` sozinho não guarda isso"
            />
            {linhas.every((l) => l.perdidos === 0) ? (
              <Empty h={200}>Nenhuma perda registrada nesta turma.</Empty>
            ) : (
              <ZebraTable sticky head={['Canal', ...ORDEM_ETAPA.slice(0, 3).map((e) => ROTULO_ETAPA[e]), 'Total perdido', '% da turma']}>
                {linhas.filter((l) => l.perdidos > 0).map((l) => (
                  <Tr key={l.id}>
                    <Td sticky>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: l.cor }} />
                        {l.nome}
                      </span>
                    </Td>
                    {ORDEM_ETAPA.slice(0, 3).map((e) => <Td key={e}>{l.morteEm[e] ?? 0}</Td>)}
                    <Td className="text-red-400 font-semibold">{l.perdidos}</Td>
                    <Td>{pct(l.perdidos, l.leads, 0)}</Td>
                  </Tr>
                ))}
              </ZebraTable>
            )}
          </GCard>

          <GCard>
            <SectionTitle icon={<AlertTriangle className="h-4 w-4" />} title="Motivos, por canal" sub="Texto do campo de perda, agrupado" />
            {linhas.every((l) => l.motivos.length === 0) ? (
              <Empty h={180}>
                Nenhum motivo preenchido. O campo aparece ao marcar um prospect como perdido —
                sem ele a coluna acima diz onde perdeu, mas não por quê.
              </Empty>
            ) : (
              <div className="space-y-4 pt-1">
                {linhas.filter((l) => l.motivos.length > 0).map((l) => (
                  <div key={l.id}>
                    <p className="text-[12px] font-medium text-foreground/70 mb-2 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: l.cor }} />
                      {l.nome}
                    </p>
                    <div className="space-y-1.5">
                      {l.motivos.map((m) => (
                        <BarRow
                          key={m.motivo}
                          label={m.motivo}
                          valor={m.n}
                          total={l.perdidos}
                          cor={l.cor}
                          right={String(m.n)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GCard>
        </>
      )}
    </div>
  );
}

/* ── Parados ──────────────────────────────────────────────────────
   Fora da coorte de propósito: aqui a pergunta não é "como foi o
   período", é "quem está esquecido agora". */
function ParadosLista({
  prospects, canais, eventosPor,
}: {
  prospects: Prospect[];
  canais: AcquisitionChannel[];
  eventosPor: Map<string, ProspectEvent[]>;
}) {
  const nomeCanal = new Map(canais.map((c) => [c.id, c] as const));

  const lista = useMemo(() => {
    const agora = Date.now();
    return prospects
      .filter((p) => p.stage !== 'vendido' && p.stage !== 'perdido')
      .map((p) => {
        const evs = eventosPor.get(p.id) ?? [];
        const ultimo = evs[evs.length - 1];
        const desde = ultimo ? ultimo.at : p.created_at;
        return { p, dias: (agora - new Date(desde).getTime()) / DIA, desde };
      })
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 12);
  }, [prospects, eventosPor]);

  if (lista.length === 0) return <Empty h={160}>Nenhum prospect em aberto.</Empty>;

  return (
    <ZebraTable head={['Prospect', 'Canal', 'Etapa', 'Parado há']}>
      {lista.map(({ p, dias: d }) => {
        const c = p.channel_id ? nomeCanal.get(p.channel_id) : null;
        return (
          <Tr key={p.id}>
            <Td sticky className="text-left text-foreground">{p.company_name}</Td>
            <Td>
              {c ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </span>
              ) : '—'}
            </Td>
            <Td>{ROTULO_ETAPA[p.stage] ?? p.stage}</Td>
            <Td className={d > 21 ? 'text-red-400 font-semibold' : d > 10 ? 'text-amber-400' : ''}>
              {nDias(d)}
            </Td>
          </Tr>
        );
      })}
    </ZebraTable>
  );
}
