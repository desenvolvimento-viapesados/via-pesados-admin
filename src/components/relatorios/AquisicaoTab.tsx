import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  PieChart as RePieChart, Pie,
} from 'recharts';
import {
  Target, TrendingUp, Clock, Trophy, Filter, MonitorPlay, CalendarDays,
  Radio, Percent, Users, Handshake,
} from 'lucide-react';
import type { Client, Prospect, Meeting, Demo } from '@/hooks/useAdmin';
import {
  GCard, SectionTitle, KpiGrid, Chart, CTip, Empty, RankRow, BarRow,
  ZebraTable, Tr, Td, SubTabs, brl, brlFull, pct,
  TYPE_COLORS, EIXO, GRADE, CURSOR,
} from './primitives';

interface Props {
  prospects: Prospect[];
  clients: Client[];
  meetings: Meeting[];
  demos: Demo[];
  periodo: { start: string; end: string };
  label: string;
}

const dias = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));

const ETAPAS_ABERTAS = ['novo', 'contato', 'reuniao', 'amostra', 'proposta', 'fechamento'] as const;

const ETAPA_LABEL: Record<string, string> = {
  novo: 'Novo', contato: 'Em contato', reuniao: 'Reunião',
  amostra: 'Amostra', proposta: 'Proposta', fechamento: 'Fechamento',
};

export function AquisicaoTab({ prospects, clients, meetings, demos, periodo, label }: Props) {
  const [sub, setSub] = useState('Funil');

  const inP = (iso: string | null | undefined) =>
    !!iso && iso.slice(0, 10) >= periodo.start && iso.slice(0, 10) <= periodo.end;

  /* ── Funil de MARCOS, sobre UMA coorte ────────────────────────────
     A coorte é o conjunto de prospects CRIADOS no período. Todas as
     etapas medem esses mesmos prospects, aconteça o marco quando
     acontecer — é o que torna as taxas de passagem comparáveis e
     impede que passem de 100%. Filtrar cada etapa pela própria data
     misturaria grupos: reuniões de março com prospects de abril.

     Os marcos são registros que existem por si (reunião realizada,
     amostra criada, proposta com valor); só o último degrau usa
     `stage`, porque "fechado" não tem marco próprio — e por isso ele
     mede a situação de HOJE dos prospects da coorte. */
  const funil = useMemo(() => {
    const criados = prospects.filter((p) => inP(p.created_at));
    const coorte = new Set(criados.map((p) => p.id));
    const comReuniao = new Set(
      meetings
        .filter((m) => m.status === 'realizada' && m.prospect_id && coorte.has(m.prospect_id))
        .map((m) => m.prospect_id!),
    );
    const comAmostra = new Set(
      demos.filter((d) => d.prospect_id && coorte.has(d.prospect_id)).map((d) => d.prospect_id!),
    );
    const comProposta = criados.filter((p) => Number(p.proposal_value ?? 0) > 0);
    const ganhos = criados.filter((p) => p.stage === 'ganho');

    return [
      { etapa: 'Prospects criados', n: criados.length, cor: TYPE_COLORS[1] },
      { etapa: 'Reunião realizada', n: comReuniao.size, cor: TYPE_COLORS[5] },
      { etapa: 'Amostra criada', n: comAmostra.size, cor: TYPE_COLORS[3] },
      { etapa: 'Proposta enviada', n: comProposta.length, cor: TYPE_COLORS[4] },
      { etapa: 'Fechado', n: ganhos.length, cor: TYPE_COLORS[2] },
    ];
  }, [prospects, meetings, demos, periodo]);

  const kpisFunil = useMemo(() => {
    const ganhos = prospects.filter((p) => p.stage === 'ganho' && inP(p.updated_at));
    const perdidos = prospects.filter((p) => p.stage === 'perdido' && inP(p.updated_at));
    const decididos = ganhos.length + perdidos.length;

    const abertos = prospects.filter((p) => (ETAPAS_ABERTAS as readonly string[]).includes(p.stage));
    const pipeline = abertos.reduce((s, p) => s + Number(p.proposal_value ?? 0), 0);
    const comValor = abertos.filter((p) => Number(p.proposal_value ?? 0) > 0).length;

    /* Ciclo = do primeiro registro do prospect até virar cliente.
       `clients.created_at` É o instante do ganho: o cliente nasce no
       "Registrar venda". Usar contract_signed_at aqui mediria o
       PÓS-venda — e ele quase nunca é preenchido. */
    const porId = new Map(prospects.map((p) => [p.id, p]));
    const ciclos = clients.flatMap((c) => {
      const origem = c.prospect_id ? porId.get(c.prospect_id) : undefined;
      return origem ? [dias(origem.created_at, c.created_at)] : [];
    });
    const ciclo = ciclos.length ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length) : null;

    return {
      ganhos: ganhos.length, perdidos: perdidos.length, decididos,
      winRate: decididos > 0 ? (ganhos.length / decididos) * 100 : null,
      pipeline, abertos: abertos.length, comValor,
      ciclo, nCiclo: ciclos.length,
      valorGanho: ganhos.reduce((s, p) => s + Number(p.proposal_value ?? 0), 0),
    };
  }, [prospects, clients, periodo]);

  const porEtapa = useMemo(() => {
    const lista = ETAPAS_ABERTAS.map((e) => {
      const l = prospects.filter((p) => p.stage === e);
      return {
        etapa: ETAPA_LABEL[e],
        n: l.length,
        valor: l.reduce((s, p) => s + Number(p.proposal_value ?? 0), 0),
      };
    });
    return { lista, max: Math.max(...lista.map((l) => l.n), 0), total: lista.reduce((s, l) => s + l.n, 0) };
  }, [prospects]);

  /* ── Origem ───────────────────────────────────────────────────── */
  const origem = useMemo(() => {
    const mapa = new Map<string, { nome: string; total: number; ganhos: number; valor: number }>();
    let semOrigem = 0;
    prospects.filter((p) => inP(p.created_at)).forEach((p) => {
      const raw = p.source?.trim();
      if (!raw) { semOrigem++; return; }
      const k = raw.toLowerCase();
      const a = mapa.get(k) ?? { nome: raw, total: 0, ganhos: 0, valor: 0 };
      a.total += 1;
      if (p.stage === 'ganho') { a.ganhos += 1; a.valor += Number(p.proposal_value ?? 0); }
      mapa.set(k, a);
    });
    const lista = [...mapa.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
    return { lista, semOrigem, comOrigem: lista.reduce((s, o) => s + o.total, 0) };
  }, [prospects, periodo]);

  const ganhosPorOrigem = useMemo(
    () => origem.lista.filter((o) => o.ganhos > 0).map((o) => ({ nome: o.nome, ganhos: o.ganhos })),
    [origem],
  );

  /* ── Agenda ───────────────────────────────────────────────────── */
  const agenda = useMemo(() => {
    const noP = meetings.filter((m) => inP(m.scheduled_at));
    const realizadas = noP.filter((m) => m.status === 'realizada').length;
    const canceladas = noP.filter((m) => m.status === 'cancelada').length;
    const agendadas = noP.filter((m) => m.status === 'agendada').length;

    const porTipo = new Map<string, number>();
    noP.forEach((m) => {
      const k = m.kind?.trim() || 'Não informado';
      porTipo.set(k, (porTipo.get(k) ?? 0) + 1);
    });

    const amostras = demos.filter((d) => inP(d.created_at));
    return {
      total: noP.length, realizadas, canceladas, agendadas,
      porTipo: [...porTipo.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n),
      amostras: amostras.length,
      convertidas: amostras.filter((d) => d.status === 'convertida').length,
      apresentadas: amostras.filter((d) => d.status === 'apresentada' || d.status === 'convertida').length,
      descartadas: amostras.filter((d) => d.status === 'descartada').length,
    };
  }, [meetings, demos, periodo]);

  return (
    <div className="space-y-6">
      <SubTabs opcoes={['Funil', 'Origem', 'Agenda']} valor={sub} onChange={setSub} cor="blue" />

      {sub === 'Funil' && (
        <div className="space-y-6">
          <KpiGrid items={[
            {
              icon: <Trophy className="h-4 w-4" />, accent: true,
              label: `Negócios ganhos · ${label}`,
              value: kpisFunil.ganhos > 0 ? String(kpisFunil.ganhos) : '—',
              sub: kpisFunil.ganhos === 0
                ? 'Nenhum negócio fechado no período.'
                : kpisFunil.valorGanho > 0
                  ? `${brl(kpisFunil.valorGanho)} em propostas fechadas`
                  : 'Sem valor de proposta informado nesses negócios.',
            },
            {
              icon: <Percent className="h-4 w-4" />,
              label: `Win rate · ${label}`,
              value: kpisFunil.winRate !== null ? `${kpisFunil.winRate.toFixed(0)}%` : '—',
              sub: kpisFunil.decididos > 0
                ? `${kpisFunil.ganhos} de ${kpisFunil.decididos} decididos`
                : 'Nenhum negócio decidido no período.',
            },
            {
              icon: <Target className="h-4 w-4" />,
              label: 'Pipeline aberto · hoje',
              value: kpisFunil.comValor > 0 ? brl(kpisFunil.pipeline) : '—',
              sub: kpisFunil.abertos > 0
                ? `${kpisFunil.abertos} em aberto · ${kpisFunil.comValor} com valor informado`
                : 'Nenhum prospect em aberto.',
            },
            {
              icon: <Clock className="h-4 w-4" />,
              label: 'Ciclo de venda · hoje',
              value: kpisFunil.ciclo !== null ? `${kpisFunil.ciclo}d` : '—',
              sub: kpisFunil.nCiclo > 0
                ? `Do 1º contato ao fechamento · média de ${kpisFunil.nCiclo} venda${kpisFunil.nCiclo > 1 ? 's' : ''}`
                : 'Nenhuma venda com prospect de origem ainda.',
            },
          ]} />

          <GCard>
            <SectionTitle
              icon={<Filter className="h-4 w-4" />}
              title={`Funil da coorte · ${label}`}
              sub="Os mesmos prospects — os criados no período — em todas as etapas, com cada marco contado onde quer que tenha acontecido. É isso que mantém as passagens abaixo de 100%"
            />
            {funil[0].n > 0 ? (
              <div className="space-y-4">
                <Chart h={260}>
                  <BarChart data={funil} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRADE} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} {...EIXO} />
                    <YAxis type="category" dataKey="etapa" width={130} {...EIXO} />
                    <Tooltip cursor={CURSOR} content={<CTip fmt={(v) => String(v)} />} />
                    <Bar dataKey="n" name="Prospects" radius={[0, 4, 4, 0]}>
                      {funil.map((f, i) => <Cell key={i} fill={f.cor} />)}
                    </Bar>
                  </BarChart>
                </Chart>
                <div className="space-y-1.5">
                  {funil.slice(1).map((f, i) => {
                    const antes = funil[i];
                    return (
                      <div key={f.etapa} className="flex items-center justify-between text-[11.5px]">
                        <span className="text-foreground/40">{antes.etapa} → {f.etapa}</span>
                        <span className="text-foreground/70 tabular-nums">
                          {pct(f.n, antes.n, 0)}
                          <span className="text-foreground/25 ml-1.5">{f.n} de {antes.n}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Empty>Nenhum prospect criado no período — sem funil para desenhar.</Empty>
            )}
          </GCard>

          <GCard>
            <SectionTitle
              icon={<TrendingUp className="h-4 w-4" />}
              title="Onde os negócios estão parados · hoje"
              sub="Distribuição da carteira aberta por etapa atual, com o valor de proposta acumulado"
            />
            {porEtapa.total > 0 ? (
              <div className="space-y-3">
                {porEtapa.lista.map((e, i) => (
                  <BarRow
                    key={e.etapa}
                    label={e.etapa}
                    valor={e.n}
                    total={porEtapa.max}
                    cor={TYPE_COLORS[i % 6]}
                    right={e.valor > 0 ? `${e.n} · ${brl(e.valor)}` : String(e.n)}
                  />
                ))}
              </div>
            ) : (
              <Empty h={200}>Nenhum prospect em aberto no funil.</Empty>
            )}
          </GCard>
        </div>
      )}

      {sub === 'Origem' && (
        <div className="space-y-6">
          <KpiGrid cols={3} items={[
            {
              icon: <Radio className="h-4 w-4" />, accent: true,
              label: `Origens ativas · ${label}`,
              value: origem.lista.length > 0 ? String(origem.lista.length) : '—',
              sub: origem.comOrigem > 0
                ? `${origem.comOrigem} prospect${origem.comOrigem > 1 ? 's' : ''} com origem rastreada`
                : 'Nenhum prospect com origem informada.',
            },
            {
              icon: <Users className="h-4 w-4" />,
              label: `Rastreabilidade · ${label}`,
              value: pct(origem.comOrigem, origem.comOrigem + origem.semOrigem, 0),
              sub: origem.semOrigem > 0
                ? `${origem.semOrigem} sem origem informada`
                : 'Todos os prospects têm origem.',
            },
            {
              icon: <Handshake className="h-4 w-4" />,
              label: `Ganhos da coorte · ${label}`,
              value: ganhosPorOrigem.length > 0
                ? String(ganhosPorOrigem.reduce((s, o) => s + o.ganhos, 0))
                : '—',
              sub: ganhosPorOrigem.length > 0
                ? `Criados no período e ganhos até hoje · ${ganhosPorOrigem.length} origem${ganhosPorOrigem.length > 1 ? 'ns' : ''}`
                : 'Nenhum prospect do período fechou com origem informada.',
            },
          ]} />

          <div className="grid gap-4 md:grid-cols-2">
            <GCard>
              <SectionTitle
                icon={<Radio className="h-4 w-4" />}
                title={`Prospects por origem · ${label}`}
                sub="Volume que cada canal trouxe"
              />
              {origem.lista.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {origem.lista.slice(0, 8).map((o, i) => (
                      <RankRow
                        key={o.nome}
                        pos={i + 1}
                        nome={o.nome}
                        meta={o.ganhos > 0 ? `${o.ganhos} ganho${o.ganhos > 1 ? 's' : ''} · ${brl(o.valor)}` : 'nenhum ganho ainda'}
                        valor={String(o.total)}
                        cor={TYPE_COLORS[i % 6]}
                      />
                    ))}
                  </div>
                  {origem.semOrigem > 0 && (
                    <p className="text-[11px] text-foreground/30 mt-3">
                      {origem.comOrigem} de {origem.comOrigem + origem.semOrigem} prospects com origem rastreada.
                    </p>
                  )}
                </>
              ) : (
                <Empty h={240}>Nenhum prospect com origem informada no período.</Empty>
              )}
            </GCard>

            <GCard>
              <SectionTitle
                icon={<Trophy className="h-4 w-4" />}
                title={`Origem dos ganhos · ${label}`}
                sub="De onde vieram os negócios que fecharam"
              />
              {ganhosPorOrigem.length > 0 ? (
                <Chart h={260}>
                  <RePieChart>
                    <Pie
                      data={ganhosPorOrigem} dataKey="ganhos" nameKey="nome"
                      cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={3}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                    >
                      {ganhosPorOrigem.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % 6]} />)}
                    </Pie>
                    <Tooltip content={<CTip fmt={(v) => `${v} ganho${v > 1 ? 's' : ''}`} />} />
                  </RePieChart>
                </Chart>
              ) : (
                <Empty h={260}>Nenhum negócio ganho com origem informada no período.</Empty>
              )}
            </GCard>
          </div>

          <GCard>
            <SectionTitle
              icon={<Percent className="h-4 w-4" />}
              title={`Conversão por origem · ${label}`}
              sub="Qual canal traz volume e qual traz fechamento — o denominador aparece sempre"
            />
            {origem.lista.length > 0 ? (
              <ZebraTable head={['Origem', 'Prospects', 'Ganhos', 'Conversão', 'Valor ganho']} sticky>
                {origem.lista.map((o) => (
                  <Tr key={o.nome}>
                    <Td sticky className="text-foreground/70">{o.nome}</Td>
                    <Td>{o.total}</Td>
                    <Td className={o.ganhos > 0 ? 'text-emerald-500' : 'text-foreground/25'}>{o.ganhos || '—'}</Td>
                    <Td>{pct(o.ganhos, o.total, 0)}</Td>
                    <Td className="font-semibold text-foreground">{o.valor > 0 ? brl(o.valor) : '—'}</Td>
                  </Tr>
                ))}
              </ZebraTable>
            ) : (
              <Empty h={200}>Nenhuma origem rastreada no período.</Empty>
            )}
          </GCard>
        </div>
      )}

      {sub === 'Agenda' && (
        <div className="space-y-6">
          <KpiGrid items={[
            {
              icon: <CalendarDays className="h-4 w-4" />, accent: true,
              label: `Reuniões realizadas · ${label}`,
              value: agenda.realizadas > 0 ? String(agenda.realizadas) : '—',
              sub: agenda.total > 0
                ? `de ${agenda.total} agendada${agenda.total > 1 ? 's' : ''} no período`
                : 'Nenhuma reunião no período.',
            },
            {
              icon: <Percent className="h-4 w-4" />,
              label: `Comparecimento · ${label}`,
              value: pct(agenda.realizadas, agenda.realizadas + agenda.canceladas, 0),
              sub: agenda.canceladas > 0
                ? `${agenda.canceladas} cancelada${agenda.canceladas > 1 ? 's' : ''}`
                : 'Nenhuma reunião cancelada.',
            },
            {
              icon: <MonitorPlay className="h-4 w-4" />,
              label: `Amostras criadas · ${label}`,
              value: agenda.amostras > 0 ? String(agenda.amostras) : '—',
              sub: agenda.amostras > 0
                ? `${agenda.apresentadas} apresentada${agenda.apresentadas !== 1 ? 's' : ''} · ${agenda.descartadas} descartada${agenda.descartadas !== 1 ? 's' : ''}`
                : 'Nenhuma amostra criada no período.',
            },
            {
              icon: <Trophy className="h-4 w-4" />,
              label: `Conversão de amostra · ${label}`,
              value: pct(agenda.convertidas, agenda.amostras, 0),
              sub: agenda.amostras > 0
                ? `${agenda.convertidas} de ${agenda.amostras} viraram cliente`
                : 'Sem amostras para medir.',
            },
          ]} />

          <div className="grid gap-4 md:grid-cols-2">
            <GCard>
              <SectionTitle
                icon={<CalendarDays className="h-4 w-4" />}
                title={`Situação das reuniões · ${label}`}
                sub="Realizadas, ainda agendadas e canceladas"
              />
              {agenda.total > 0 ? (
                <Chart h={240}>
                  <BarChart data={[
                    { nome: 'Realizadas', n: agenda.realizadas },
                    { nome: 'Agendadas', n: agenda.agendadas },
                    { nome: 'Canceladas', n: agenda.canceladas },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                    <XAxis dataKey="nome" {...EIXO} />
                    <YAxis allowDecimals={false} {...EIXO} />
                    <Tooltip cursor={CURSOR} content={<CTip fmt={(v) => String(v)} />} />
                    <Bar dataKey="n" name="Reuniões" radius={[4, 4, 0, 0]}>
                      <Cell fill="hsl(152,60%,45%)" />
                      <Cell fill="hsl(45,90%,50%)" />
                      <Cell fill="hsl(0,70%,50%)" />
                    </Bar>
                  </BarChart>
                </Chart>
              ) : (
                <Empty h={240}>Nenhuma reunião no período.</Empty>
              )}
            </GCard>

            <GCard>
              <SectionTitle
                icon={<Filter className="h-4 w-4" />}
                title={`Reuniões por tipo · ${label}`}
                sub="Que formato de conversa acontece mais"
              />
              {agenda.porTipo.length > 0 ? (
                <div className="space-y-2">
                  {agenda.porTipo.map((t, i) => (
                    <RankRow key={t.nome} pos={i + 1} nome={t.nome} valor={String(t.n)} cor={TYPE_COLORS[i % 6]} />
                  ))}
                </div>
              ) : (
                <Empty h={240}>Nenhuma reunião no período.</Empty>
              )}
            </GCard>
          </div>

          <GCard>
            <SectionTitle
              icon={<MonitorPlay className="h-4 w-4" />}
              title={`Situação das amostras · ${label}`}
              sub="A amostra é o argumento de venda mais forte — não há registro de quando foi apresentada, só do estado atual"
            />
            {agenda.amostras > 0 ? (
              <Chart h={240}>
                <BarChart data={[
                  { nome: 'Criadas', n: agenda.amostras },
                  { nome: 'Apresentadas', n: agenda.apresentadas },
                  { nome: 'Convertidas', n: agenda.convertidas },
                  { nome: 'Descartadas', n: agenda.descartadas },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                  <XAxis dataKey="nome" {...EIXO} />
                  <YAxis allowDecimals={false} {...EIXO} />
                  <Tooltip cursor={CURSOR} content={<CTip fmt={(v) => String(v)} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="n" name="Amostras" radius={[4, 4, 0, 0]}>
                    <Cell fill={TYPE_COLORS[1]} />
                    <Cell fill={TYPE_COLORS[3]} />
                    <Cell fill="hsl(152,60%,45%)" />
                    <Cell fill="hsl(0,70%,50%)" />
                  </Bar>
                </BarChart>
              </Chart>
            ) : (
              <Empty h={240}>Nenhuma amostra criada no período.</Empty>
            )}
          </GCard>
        </div>
      )}
    </div>
  );
}
