import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart as RePieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import {
  DollarSign, TrendingUp, BarChart3, AlertTriangle, Plus, Minus, ArrowUpDown,
  Percent, PieChart, MapPin, Users, Layers, CalendarRange,
} from 'lucide-react';
import type { Client } from '@/hooks/useAdmin';
import {
  GCard, SectionTitle, KpiGrid, AreaCard, Chart, CTip, Empty, RankRow,
  ZebraTable, Tr, Td, SubTabs, brl, brlFull, pct,
  TYPE_COLORS, STATUS_COLORS, STATUS_LABEL, EIXO, GRADE, CURSOR,
} from './primitives';

interface Props {
  clients: Client[];
  periodo: { start: string; end: string };
  label: string;
}

const mesKey = (iso: string) => iso.slice(0, 7);
const mesLabel = (k: string) => {
  const [y, m] = k.split('-');
  return `${m}/${y.slice(2)}`;
};

/** 12 chaves de mês terminando no mês corrente. */
const ultimos12 = () => {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

export function RecorrenciaTab({ clients, periodo, label }: Props) {
  const navigate = useNavigate();
  const [sub, setSub] = useState('Visão geral');

  const noPeriodo = (iso: string | null) => !!iso && iso.slice(0, 10) >= periodo.start && iso.slice(0, 10) <= periodo.end;

  /* ── Foto de hoje ─────────────────────────────────────────────── */
  const foto = useMemo(() => {
    const porStatus = (s: Client['status']) => clients.filter((c) => c.status === s);
    const somaMrr = (l: Client[]) => l.reduce((acc, c) => acc + Number(c.mrr ?? 0), 0);

    const ativos = porStatus('ativo');
    const mrrAtivo = somaMrr(ativos);
    const comMrr = ativos.filter((c) => Number(c.mrr ?? 0) > 0).length;
    const emRisco = [...porStatus('inadimplente'), ...porStatus('pausado')];

    return {
      mrrAtivo,
      nAtivos: ativos.length,
      comMrr,
      arpa: comMrr > 0 ? mrrAtivo / comMrr : null,
      risco: somaMrr(emRisco),
      nInad: porStatus('inadimplente').length,
      nPausado: porStatus('pausado').length,
      fases: (['onboarding', 'ativo', 'inadimplente', 'pausado', 'cancelado'] as const).map((s) => {
        const l = porStatus(s);
        return { s, n: l.length, mrr: somaMrr(l) };
      }),
      total: clients.length,
    };
  }, [clients]);

  /* ── Filme do período ─────────────────────────────────────────── */
  const filme = useMemo(() => {
    const ativados = clients.filter((c) => noPeriodo(c.activated_at));
    const cancelados = clients.filter((c) => noPeriodo(c.canceled_at));
    const mrrNovo = ativados.reduce((s, c) => s + Number(c.mrr ?? 0), 0);
    const mrrPerdido = cancelados.reduce((s, c) => s + Number(c.mrr ?? 0), 0);

    // Base no início do período: quem já estava vivo antes dele começar.
    const baseInicio = clients.filter((c) =>
      c.activated_at && c.activated_at.slice(0, 10) < periodo.start &&
      (!c.canceled_at || c.canceled_at.slice(0, 10) >= periodo.start));
    const mrrBase = baseInicio.reduce((s, c) => s + Number(c.mrr ?? 0), 0);

    return {
      mrrNovo, nAtivados: ativados.length,
      mrrPerdido, nCancelados: cancelados.length,
      liquido: mrrNovo - mrrPerdido,
      mrrBase, nBase: baseInicio.length,
    };
  }, [clients, periodo]);

  /* ── Série reconstruída ───────────────────────────────────────── */
  const serie = useMemo(() => ultimos12().map((k) => {
    const fim = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 1).toISOString().slice(0, 10);
    const vivos = clients.filter((c) =>
      c.activated_at && c.activated_at.slice(0, 10) < fim &&
      (!c.canceled_at || c.canceled_at.slice(0, 10) >= fim));
    return {
      mes: mesLabel(k),
      chave: k,
      MRR: vivos.reduce((s, c) => s + Number(c.mrr ?? 0), 0),
      Clientes: vivos.length,
      Novos: clients.filter((c) => c.activated_at && mesKey(c.activated_at) === k).length,
      Saíram: clients.filter((c) => c.canceled_at && mesKey(c.canceled_at) === k).length,
    };
  }), [clients]);

  const temSerie = serie.some((p) => p.MRR > 0 || p.Novos > 0 || p.Saíram > 0);

  /* ── Recortes ─────────────────────────────────────────────────── */
  const porPlano = useMemo(() => {
    const mapa = new Map<string, { nome: string; mrr: number; n: number }>();
    let semPlano = 0;
    clients.filter((c) => c.status === 'ativo').forEach((c) => {
      const raw = c.plan?.trim();
      if (!raw) { semPlano++; return; }
      const k = raw.toLowerCase();
      const a = mapa.get(k) ?? { nome: raw, mrr: 0, n: 0 };
      a.mrr += Number(c.mrr ?? 0); a.n += 1;
      mapa.set(k, a);
    });
    return {
      lista: [...mapa.values()].sort((a, b) => b.mrr - a.mrr || a.nome.localeCompare(b.nome)),
      semPlano,
    };
  }, [clients]);

  const porUf = useMemo(() => {
    const mapa = new Map<string, { uf: string; mrr: number; n: number }>();
    let semUf = 0;
    clients.filter((c) => c.status === 'ativo').forEach((c) => {
      const raw = c.state?.trim();
      if (!raw) { semUf++; return; }
      const k = raw.toUpperCase();
      const a = mapa.get(k) ?? { uf: k, mrr: 0, n: 0 };
      a.mrr += Number(c.mrr ?? 0); a.n += 1;
      mapa.set(k, a);
    });
    return { lista: [...mapa.values()].sort((a, b) => b.mrr - a.mrr).slice(0, 8), semUf };
  }, [clients]);

  /* ── Coortes: quem entrou em cada mês ainda está? ─────────────── */
  const coortes = useMemo(() => {
    const meses = ultimos12();
    return meses.map((k) => {
      const turma = clients.filter((c) => c.activated_at && mesKey(c.activated_at) === k);
      if (turma.length === 0) return null;
      const vivos = turma.filter((c) => !c.canceled_at).length;
      return {
        mes: mesLabel(k),
        n: turma.length,
        vivos,
        mrr: turma.filter((c) => !c.canceled_at).reduce((s, c) => s + Number(c.mrr ?? 0), 0),
        retencao: (vivos / turma.length) * 100,
      };
    }).filter(Boolean) as { mes: string; n: number; vivos: number; mrr: number; retencao: number }[];
  }, [clients]);

  /* ══ Render ═══════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">
      <SubTabs opcoes={['Visão geral', 'Movimento', 'Coortes']} valor={sub} onChange={setSub} cor="primary" />

      {sub === 'Visão geral' && (
        <div className="space-y-6">
          <KpiGrid items={[
            {
              icon: <DollarSign className="h-4 w-4" />, accent: true,
              label: 'MRR ativo · hoje',
              value: foto.nAtivos > 0 ? brl(foto.mrrAtivo) : '—',
              sub: foto.nAtivos > 0 ? `${foto.nAtivos} cliente${foto.nAtivos > 1 ? 's' : ''} ativo${foto.nAtivos > 1 ? 's' : ''}` : 'Nenhum cliente ativo.',
            },
            {
              icon: <TrendingUp className="h-4 w-4" />,
              label: 'ARR · hoje',
              value: foto.nAtivos > 0 ? brl(foto.mrrAtivo * 12) : '—',
              sub: 'MRR ativo × 12',
            },
            {
              icon: <BarChart3 className="h-4 w-4" />,
              label: 'ARPA · hoje',
              value: foto.arpa !== null ? brl(foto.arpa) : '—',
              sub: foto.comMrr > 0
                ? `MRR ÷ ${foto.comMrr} cliente${foto.comMrr > 1 ? 's' : ''} com valor informado`
                : 'Nenhum cliente com MRR informado.',
            },
            {
              icon: <AlertTriangle className="h-4 w-4" />,
              label: 'MRR em risco · hoje',
              value: brl(foto.risco),
              negative: foto.risco > 0,
              sub: `${foto.nInad} inadimplente${foto.nInad !== 1 ? 's' : ''} · ${foto.nPausado} pausado${foto.nPausado !== 1 ? 's' : ''}`,
            },
          ]} />

          {/* As cinco fases do contrato — a "área" de uma SaaS é o estado. */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {foto.fases.map(({ s, n, mrr }) => (
              <AreaCard
                key={s}
                nome={STATUS_LABEL[s]}
                cor={STATUS_COLORS[s]}
                valor={brl(mrr)}
                sub={`${n} cliente${n !== 1 ? 's' : ''} · ${pct(n, foto.total, 0)} da base`}
              />
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <GCard>
              <SectionTitle
                icon={<PieChart className="h-4 w-4" />}
                title="MRR por plano · hoje"
                sub="Participação de cada plano no recorrente ativo"
              />
              {porPlano.lista.length > 0 ? (
                <div className="space-y-4">
                  <Chart h={250}>
                    <RePieChart>
                      <Pie
                        data={porPlano.lista} dataKey="mrr" nameKey="nome"
                        cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={3}
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                      >
                        {porPlano.lista.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % 6]} />)}
                      </Pie>
                      <Tooltip content={<CTip fmt={brlFull} />} />
                    </RePieChart>
                  </Chart>
                  <div className="space-y-2">
                    {porPlano.lista.map((p, i) => (
                      <div key={p.nome} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: TYPE_COLORS[i % 6] }} />
                          <span className="text-[12px] text-foreground/60 truncate">{p.nome}</span>
                          <span className="text-[11px] text-foreground/30 shrink-0">{p.n}×</span>
                        </div>
                        <span className="text-[12px] font-medium text-foreground tabular-nums">{brl(p.mrr)}</span>
                      </div>
                    ))}
                  </div>
                  {porPlano.semPlano > 0 && (
                    <p className="text-[11px] text-foreground/30">
                      {porPlano.semPlano} cliente{porPlano.semPlano > 1 ? 's' : ''} sem plano informado, fora deste gráfico.
                    </p>
                  )}
                </div>
              ) : (
                <Empty h={250}>Nenhum cliente ativo com plano informado.</Empty>
              )}
            </GCard>

            <GCard>
              <SectionTitle
                icon={<MapPin className="h-4 w-4" />}
                title="MRR por UF · hoje"
                sub="Concentração geográfica do recorrente"
              />
              {porUf.lista.length > 0 ? (
                <>
                  <Chart h={250}>
                    <BarChart data={porUf.lista}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                      <XAxis dataKey="uf" {...EIXO} />
                      <YAxis tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} {...EIXO} />
                      <Tooltip cursor={CURSOR} content={<CTip fmt={brlFull} />} />
                      <Bar dataKey="mrr" name="MRR" fill="hsl(25,95%,53%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </Chart>
                  {porUf.semUf > 0 && (
                    <p className="text-[11px] text-foreground/30 mt-3">
                      {porUf.semUf} cliente{porUf.semUf > 1 ? 's' : ''} sem UF informada, fora deste gráfico.
                    </p>
                  )}
                </>
              ) : (
                <Empty h={250}>Nenhum cliente ativo com UF informada.</Empty>
              )}
            </GCard>
          </div>

          <GCard>
            <SectionTitle
              icon={<Users className="h-4 w-4" />}
              title="Maiores contratos · hoje"
              sub="Concentração de receita — quanto do MRR depende de cada cliente"
            />
            {foto.nAtivos > 0 ? (
              <div className="space-y-2">
                {[...clients.filter((c) => c.status === 'ativo')]
                  .sort((a, b) => Number(b.mrr ?? 0) - Number(a.mrr ?? 0))
                  .slice(0, 6)
                  .map((c, i) => (
                    <RankRow
                      key={c.id}
                      pos={i + 1}
                      nome={c.company_name}
                      meta={[c.plan, c.state].filter(Boolean).join(' · ') || undefined}
                      valor={`${brl(Number(c.mrr ?? 0))} · ${pct(Number(c.mrr ?? 0), foto.mrrAtivo, 0)}`}
                      cor={TYPE_COLORS[i % 6]}
                      onClick={() => navigate(`/clientes/${c.id}`)}
                    />
                  ))}
              </div>
            ) : (
              <Empty h={140}>Nenhum cliente ativo ainda.</Empty>
            )}
          </GCard>
        </div>
      )}

      {sub === 'Movimento' && (
        <div className="space-y-6">
          <KpiGrid items={[
            {
              icon: <Plus className="h-4 w-4" />, accent: true,
              label: `MRR novo · ${label}`,
              value: filme.nAtivados > 0 ? brl(filme.mrrNovo) : '—',
              sub: filme.nAtivados > 0 ? `${filme.nAtivados} ativação${filme.nAtivados > 1 ? 'ões' : ''}` : 'Nenhuma ativação no período.',
            },
            {
              icon: <Minus className="h-4 w-4" />,
              label: `MRR cancelado · ${label}`,
              value: filme.nCancelados > 0 ? brl(filme.mrrPerdido) : '—',
              negative: filme.mrrPerdido > 0,
              sub: filme.nCancelados > 0 ? `${filme.nCancelados} cancelamento${filme.nCancelados > 1 ? 's' : ''}` : 'Nenhum cancelamento no período.',
            },
            {
              icon: <ArrowUpDown className="h-4 w-4" />,
              label: `MRR líquido · ${label}`,
              value: (filme.nAtivados + filme.nCancelados) > 0 ? brl(filme.liquido) : '—',
              negative: filme.liquido < 0,
              sub: 'Novo − cancelado',
            },
            {
              icon: <Percent className="h-4 w-4" />,
              label: `Churn de receita · ${label}`,
              value: pct(filme.mrrPerdido, filme.mrrBase),
              negative: filme.mrrBase > 0 && filme.mrrPerdido > 0,
              sub: filme.mrrBase > 0
                ? `Cancelado ÷ ${brl(filme.mrrBase)} de base no início`
                : 'Sem base no início do período.',
            },
          ]} />

          <GCard>
            <SectionTitle
              icon={<TrendingUp className="h-4 w-4" />}
              title="Evolução do MRR · 12 meses"
              sub="Série reconstruída de activated_at e canceled_at com o valor ATUAL de cada contrato — não há histórico de alteração de mensalidade"
            />
            {temSerie ? (
              <Chart h={280}>
                <AreaChart data={serie}>
                  <defs>
                    <linearGradient id="gMrr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(25,95%,53%)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(25,95%,53%)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                  <XAxis dataKey="mes" {...EIXO} />
                  <YAxis tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} {...EIXO} />
                  <Tooltip cursor={CURSOR} content={<CTip fmt={brlFull} />} />
                  <Area type="monotone" dataKey="MRR" stroke="hsl(25,95%,53%)" strokeWidth={2} fill="url(#gMrr)" />
                </AreaChart>
              </Chart>
            ) : (
              <Empty>Nenhum contrato ativado nos últimos 12 meses.</Empty>
            )}
          </GCard>

          <GCard>
            <SectionTitle
              icon={<ArrowUpDown className="h-4 w-4" />}
              title="Entradas e saídas · 12 meses"
              sub="Contratos ativados e cancelados, mês a mês"
            />
            {temSerie ? (
              <Chart h={260}>
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                  <XAxis dataKey="mes" {...EIXO} />
                  <YAxis allowDecimals={false} {...EIXO} />
                  <Tooltip cursor={CURSOR} content={<CTip fmt={(v) => String(v)} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Novos" fill="hsl(152,60%,45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Saíram" fill="hsl(0,70%,50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </Chart>
            ) : (
              <Empty h={260}>Nenhuma ativação ou cancelamento nos últimos 12 meses.</Empty>
            )}
          </GCard>

          <GCard>
            <SectionTitle
              icon={<CalendarRange className="h-4 w-4" />}
              title="Base mês a mês · 12 meses"
              sub="Clientes vivos ao fim de cada mês e o recorrente correspondente"
            />
            {temSerie ? (
              <ZebraTable head={['Mês', 'Entraram', 'Saíram', 'Base', 'MRR']}>
                {[...serie].reverse().map((s) => (
                  <Tr key={s.chave}>
                    <Td sticky className="text-foreground/60">{s.mes}</Td>
                    <Td className={s.Novos > 0 ? 'text-emerald-500' : 'text-foreground/25'}>{s.Novos || '—'}</Td>
                    <Td className={s.Saíram > 0 ? 'text-red-400' : 'text-foreground/25'}>{s.Saíram || '—'}</Td>
                    <Td>{s.Clientes}</Td>
                    <Td className="font-semibold text-foreground">{brl(s.MRR)}</Td>
                  </Tr>
                ))}
              </ZebraTable>
            ) : (
              <Empty h={200}>Nenhum movimento de contrato nos últimos 12 meses.</Empty>
            )}
          </GCard>
        </div>
      )}

      {sub === 'Coortes' && (
        <div className="space-y-6">
          <GCard>
            <SectionTitle
              icon={<Layers className="h-4 w-4" />}
              title="Retenção por turma de entrada · 12 meses"
              sub="De cada turma que entrou no mês, quantos continuam hoje. Sem histórico de mensalidade, o MRR é o valor atual dos sobreviventes"
            />
            {coortes.length > 0 ? (
              <ZebraTable head={['Turma', 'Entraram', 'Continuam', 'Retenção', 'MRR vivo']} sticky>
                {coortes.map((c) => (
                  <Tr key={c.mes}>
                    <Td sticky className="text-foreground/60">{c.mes}</Td>
                    <Td>{c.n}</Td>
                    <Td>{c.vivos}</Td>
                    <Td className={
                      c.retencao === 100 ? 'text-emerald-500'
                        : c.retencao >= 50 ? 'text-foreground/70'
                          : 'text-red-400'
                    }>
                      {c.retencao.toFixed(0)}%
                    </Td>
                    <Td className="font-semibold text-foreground">{brl(c.mrr)}</Td>
                  </Tr>
                ))}
              </ZebraTable>
            ) : (
              <Empty h={200}>Nenhum contrato foi ativado nos últimos 12 meses — sem turmas para acompanhar.</Empty>
            )}
          </GCard>

          <GCard>
            <SectionTitle
              icon={<BarChart3 className="h-4 w-4" />}
              title="Retenção por turma · 12 meses"
              sub="A mesma leitura em barra — turma que cai cedo é problema de entrega, não de venda"
            />
            {coortes.length > 0 ? (
              <Chart h={260}>
                <BarChart data={coortes}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                  <XAxis dataKey="mes" {...EIXO} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...EIXO} />
                  <Tooltip cursor={CURSOR} content={<CTip fmt={(v) => `${v.toFixed(0)}%`} />} />
                  <Bar dataKey="retencao" name="Retenção" radius={[4, 4, 0, 0]}>
                    {coortes.map((c, i) => (
                      <Cell key={i} fill={c.retencao === 100 ? 'hsl(152,60%,45%)' : c.retencao >= 50 ? 'hsl(45,90%,50%)' : 'hsl(0,70%,50%)'} />
                    ))}
                  </Bar>
                </BarChart>
              </Chart>
            ) : (
              <Empty h={260}>Nenhuma turma de entrada nos últimos 12 meses.</Empty>
            )}
          </GCard>
        </div>
      )}
    </div>
  );
}
