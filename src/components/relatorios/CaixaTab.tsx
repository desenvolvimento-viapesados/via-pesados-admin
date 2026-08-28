import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  PieChart as RePieChart, Pie, ComposedChart, Line,
} from 'recharts';
import {
  DollarSign, TrendingDown, Scale, Percent, PieChart, Layers,
  Receipt, AlertTriangle, CalendarClock, Wallet, CreditCard,
} from 'lucide-react';
import type { FinTransaction, Payment } from '@/hooks/useAdmin';
import {
  GCard, SectionTitle, KpiGrid, AreaCard, Chart, CTip, Empty, RankRow, TintedBlock,
  ZebraTable, Tr, Td, SubTabs, brl, brlFull, pct,
  TYPE_COLORS, EIXO, GRADE, CURSOR,
} from './primitives';
import { cn } from '@/lib/utils';

interface Props {
  transacoes: FinTransaction[];
  payments: Payment[];
  periodo: { start: string; end: string };
  label: string;
}

type Regime = 'competencia' | 'caixa';

/** As três áreas de receita da Via Pesados — o equivalente aos cartões
 *  coloridos de Veículos/Financiamento/Consórcio do lojista. */
const AREAS = [
  { nome: 'Assinaturas', cor: 'hsl(25,95%,53%)', casa: (c: string) => c.startsWith('Assinatura') },
  { nome: 'Implantação', cor: 'hsl(220,70%,55%)', casa: (c: string) => c.startsWith('Implanta') },
  { nome: 'Serviços', cor: 'hsl(152,60%,45%)', casa: (c: string) => c.startsWith('Serviço') },
];

const mesLabel = (k: string) => `${k.slice(5, 7)}/${k.slice(2, 4)}`;

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

const hoje = () => new Date().toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000));

export function CaixaTab({ transacoes, payments, periodo, label }: Props) {
  const [sub, setSub] = useState('Resultado');
  const [regime, setRegime] = useState<Regime>('competencia');

  const inP = (iso: string | null | undefined) =>
    !!iso && iso.slice(0, 10) >= periodo.start && iso.slice(0, 10) <= periodo.end;

  /** O regime decide qual data recorta e quais linhas entram. */
  const doRegime = useMemo(() => transacoes.filter((t) =>
    regime === 'competencia'
      ? t.status !== 'cancelado' && inP(t.competence_date)
      : t.status === 'pago' && inP(t.payment_date),
  ), [transacoes, periodo, regime]);

  const res = useMemo(() => {
    const soma = (l: FinTransaction[]) => l.reduce((s, t) => s + Number(t.amount), 0);
    const receita = soma(doRegime.filter((t) => t.type === 'receita'));
    const despesa = soma(doRegime.filter((t) => t.type === 'despesa'));
    return {
      receita, despesa, resultado: receita - despesa,
      margem: receita > 0 ? ((receita - despesa) / receita) * 100 : null,
      nLancamentos: doRegime.length,
    };
  }, [doRegime]);

  const porArea = useMemo(() => AREAS.map((a) => {
    const l = doRegime.filter((t) => t.type === 'receita' && a.casa(t.category?.name ?? ''));
    return { ...a, valor: l.reduce((s, t) => s + Number(t.amount), 0), n: l.length };
  }), [doRegime]);

  const outrasReceitas = useMemo(() => {
    const l = doRegime.filter((t) => t.type === 'receita' && !AREAS.some((a) => a.casa(t.category?.name ?? '')));
    return { valor: l.reduce((s, t) => s + Number(t.amount), 0), n: l.length };
  }, [doRegime]);

  /* ── Série de 12 meses ───────────────────────────────────────── */
  const serie = useMemo(() => ultimos12().map((k) => {
    const doM = transacoes.filter((t) => {
      const d = regime === 'competencia' ? t.competence_date : t.payment_date;
      const ok = regime === 'competencia' ? t.status !== 'cancelado' : t.status === 'pago';
      return ok && d?.slice(0, 7) === k;
    });
    const r = doM.filter((t) => t.type === 'receita').reduce((s, t) => s + Number(t.amount), 0);
    const d = doM.filter((t) => t.type === 'despesa').reduce((s, t) => s + Number(t.amount), 0);
    return { mes: mesLabel(k), chave: k, Receita: r, Despesa: d, Resultado: r - d };
  }), [transacoes, regime]);

  const temSerie = serie.some((s) => s.Receita > 0 || s.Despesa > 0);

  /* ── Categorias ──────────────────────────────────────────────── */
  const categorias = useMemo(() => {
    const agrupar = (tipo: 'receita' | 'despesa') => {
      const mapa = new Map<string, { nome: string; cor: string; total: number; n: number }>();
      doRegime.filter((t) => t.type === tipo).forEach((t) => {
        const nome = t.category?.name ?? 'Sem categoria';
        const a = mapa.get(nome) ?? { nome, cor: t.category?.color ?? '#64748b', total: 0, n: 0 };
        a.total += Number(t.amount); a.n += 1;
        mapa.set(nome, a);
      });
      return [...mapa.values()].sort((a, b) => b.total - a.total);
    };
    return { receita: agrupar('receita'), despesa: agrupar('despesa') };
  }, [doRegime]);

  /* ── Cobrança ────────────────────────────────────────────────── */
  const cobranca = useMemo(() => {
    const h = hoje();
    const validas = payments.filter((p) => p.status !== 'cancelado');
    const emAberto = validas.filter((p) => p.status !== 'pago');
    const vencidas = emAberto.filter((p) => p.due_date < h);

    const faixas = [
      { nome: '1–15 dias', cor: 'hsl(45,90%,50%)', min: 1, max: 15 },
      { nome: '16–30 dias', cor: 'hsl(25,95%,53%)', min: 16, max: 30 },
      { nome: '31–60 dias', cor: 'hsl(0,70%,50%)', min: 31, max: 60 },
      { nome: '+60 dias', cor: 'hsl(0,80%,40%)', min: 61, max: 99999 },
    ].map((f) => {
      const l = vencidas.filter((p) => {
        const d = diasEntre(p.due_date, h);
        return d >= f.min && d <= f.max;
      });
      return { ...f, valor: l.reduce((s, p) => s + Number(p.amount), 0), n: l.length };
    });

    const recebidas = validas.filter((p) => p.status === 'pago' && inP(p.paid_at));
    const cobradas = validas.filter((p) => inP(p.due_date));

    const porMetodo = new Map<string, { nome: string; valor: number; n: number }>();
    let semMetodo = 0;
    recebidas.forEach((p) => {
      if (!p.method) { semMetodo++; return; }
      const a = porMetodo.get(p.method) ?? { nome: p.method, valor: 0, n: 0 };
      a.valor += Number(p.amount); a.n += 1;
      porMetodo.set(p.method, a);
    });

    return {
      emAberto: emAberto.reduce((s, p) => s + Number(p.amount), 0),
      nEmAberto: emAberto.length,
      vencido: vencidas.reduce((s, p) => s + Number(p.amount), 0),
      nVencidas: vencidas.length,
      faixas,
      recebido: recebidas.reduce((s, p) => s + Number(p.amount), 0),
      nRecebidas: recebidas.length,
      cobrado: cobradas.reduce((s, p) => s + Number(p.amount), 0),
      nCobradas: cobradas.length,
      porMetodo: [...porMetodo.values()].sort((a, b) => b.valor - a.valor),
      semMetodo,
    };
  }, [payments, periodo]);

  const sufixo = `regime ${regime === 'competencia' ? 'competência' : 'caixa'}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <SubTabs opcoes={['Resultado', 'Categorias', 'Cobrança']} valor={sub} onChange={setSub} cor="emerald" />
        {sub !== 'Cobrança' && (
          <div className="flex items-center gap-1 ml-auto p-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06]">
            {([['competencia', 'Competência'], ['caixa', 'Caixa']] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setRegime(v)}
                className={cn(
                  'h-7 px-3 rounded-lg text-[12px] font-medium transition-colors',
                  regime === v ? 'bg-emerald-500/12 text-emerald-400' : 'text-foreground/35 hover:text-foreground/60',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {sub === 'Resultado' && (
        <div className="space-y-6">
          <KpiGrid items={[
            {
              icon: <DollarSign className="h-4 w-4" />, accent: true,
              label: `Receita · ${label}`,
              value: res.receita > 0 ? brl(res.receita) : '—',
              sub: res.nLancamentos > 0 ? sufixo : 'Nenhum lançamento no período.',
            },
            {
              icon: <TrendingDown className="h-4 w-4" />,
              label: `Despesa · ${label}`,
              value: res.despesa > 0 ? brl(res.despesa) : '—',
              negative: res.despesa > 0,
              sub: res.nLancamentos > 0 ? sufixo : 'Nenhum lançamento no período.',
            },
            {
              icon: <Scale className="h-4 w-4" />,
              label: `Resultado · ${label}`,
              value: res.nLancamentos > 0 ? brl(res.resultado) : '—',
              negative: res.resultado < 0,
              sub: 'Receita − despesa',
            },
            {
              icon: <Percent className="h-4 w-4" />,
              label: `Margem · ${label}`,
              value: res.margem !== null ? `${res.margem.toFixed(1)}%` : '—',
              negative: res.margem !== null && res.margem < 0,
              sub: res.receita > 0 ? `Resultado ÷ ${brl(res.receita)} de receita` : 'Sem receita no período.',
            },
          ]} />

          {/* As três áreas de receita da Via Pesados */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {porArea.map((a) => (
              <AreaCard
                key={a.nome}
                nome={a.nome}
                cor={a.cor}
                valor={brl(a.valor)}
                sub={`${a.n} lançamento${a.n !== 1 ? 's' : ''} · ${pct(a.valor, res.receita, 0)} da receita`}
              />
            ))}
            <AreaCard
              nome="Outras"
              cor="hsl(220,10%,45%)"
              valor={brl(outrasReceitas.valor)}
              sub={`${outrasReceitas.n} lançamento${outrasReceitas.n !== 1 ? 's' : ''} · ${pct(outrasReceitas.valor, res.receita, 0)} da receita`}
            />
          </div>

          <GCard>
            <SectionTitle
              icon={<Layers className="h-4 w-4" />}
              title={`Receita, despesa e resultado · 12 meses · ${sufixo}`}
              sub="Barras somam o movimento do mês; a linha é o resultado acumulado do mês"
            />
            {temSerie ? (
              <Chart h={300}>
                <ComposedChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                  <XAxis dataKey="mes" {...EIXO} />
                  <YAxis tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} {...EIXO} />
                  <Tooltip cursor={CURSOR} content={<CTip fmt={brlFull} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Receita" fill="hsl(152,60%,45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesa" fill="hsl(0,70%,50%)" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="Resultado" stroke="hsl(25,95%,53%)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </Chart>
            ) : (
              <Empty h={300}>Nenhum lançamento nos últimos 12 meses.</Empty>
            )}
          </GCard>

          <GCard>
            <SectionTitle
              icon={<Receipt className="h-4 w-4" />}
              title={`DRE mensal · 12 meses · ${sufixo}`}
              sub="O mesmo movimento em números, mês a mês"
            />
            {temSerie ? (
              <ZebraTable head={['Mês', 'Receita', 'Despesa', 'Resultado', 'Margem']} sticky>
                {[...serie].reverse().map((s) => (
                  <Tr key={s.chave}>
                    <Td sticky className="text-foreground/60">{s.mes}</Td>
                    <Td className={s.Receita > 0 ? 'text-emerald-500' : 'text-foreground/25'}>{s.Receita > 0 ? brl(s.Receita) : '—'}</Td>
                    <Td className={s.Despesa > 0 ? 'text-red-400' : 'text-foreground/25'}>{s.Despesa > 0 ? `−${brl(s.Despesa)}` : '—'}</Td>
                    <Td className={cn('font-semibold', s.Resultado > 0 ? 'text-emerald-500' : s.Resultado < 0 ? 'text-red-400' : 'text-foreground/25')}>
                      {(s.Receita > 0 || s.Despesa > 0) ? brl(s.Resultado) : '—'}
                    </Td>
                    <Td>{pct(s.Resultado, s.Receita, 0)}</Td>
                  </Tr>
                ))}
              </ZebraTable>
            ) : (
              <Empty h={200}>Nenhum lançamento nos últimos 12 meses.</Empty>
            )}
          </GCard>
        </div>
      )}

      {sub === 'Categorias' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {([['Receita', categorias.receita], ['Despesa', categorias.despesa]] as const).map(([titulo, lista]) => {
              const total = lista.reduce((s, c) => s + c.total, 0);
              return (
                <GCard key={titulo}>
                  <SectionTitle
                    icon={<PieChart className="h-4 w-4" />}
                    title={`${titulo} por categoria · ${label}`}
                    sub={`Participação de cada categoria · ${sufixo}`}
                  />
                  {lista.length > 0 ? (
                    <div className="space-y-4">
                      <Chart h={240}>
                        <RePieChart>
                          <Pie
                            data={lista} dataKey="total" nameKey="nome"
                            cx="50%" cy="50%" innerRadius={46} outerRadius={80} paddingAngle={3}
                            label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                            labelLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                          >
                            {/* Categorias são a única dimensão com cor persistida no banco. */}
                            {lista.map((c) => <Cell key={c.nome} fill={c.cor} />)}
                          </Pie>
                          <Tooltip content={<CTip fmt={brlFull} />} />
                        </RePieChart>
                      </Chart>
                      <div className="space-y-2">
                        {lista.map((c) => (
                          <div key={c.nome} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c.cor }} />
                              <span className="text-[12px] text-foreground/60 truncate">{c.nome}</span>
                              <span className="text-[11px] text-foreground/25 shrink-0">{c.n}×</span>
                            </div>
                            <span className="text-[12px] font-medium text-foreground tabular-nums shrink-0">
                              {brl(c.total)}
                              <span className="text-foreground/30 ml-1.5">{pct(c.total, total, 0)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Empty h={240}>Nenhum lançamento de {titulo.toLowerCase()} no período.</Empty>
                  )}
                </GCard>
              );
            })}
          </div>

          <GCard>
            <SectionTitle
              icon={<TrendingDown className="h-4 w-4" />}
              title={`Maiores despesas · ${label}`}
              sub={`Onde o dinheiro sai · ${sufixo}`}
            />
            {categorias.despesa.length > 0 ? (
              <div className="space-y-2">
                {categorias.despesa.slice(0, 8).map((c, i) => (
                  <RankRow
                    key={c.nome}
                    pos={i + 1}
                    nome={c.nome}
                    meta={`${c.n} lançamento${c.n > 1 ? 's' : ''}`}
                    valor={brl(c.total)}
                    cor={c.cor}
                  />
                ))}
              </div>
            ) : (
              <Empty h={200}>Nenhuma despesa lançada no período.</Empty>
            )}
          </GCard>
        </div>
      )}

      {sub === 'Cobrança' && (
        <div className="space-y-6">
          <p className="text-[11px] text-foreground/30 -mb-2">
            Cobranças não têm responsável — esta sub-aba não é filtrada por colaborador.
          </p>

          <KpiGrid items={[
            {
              icon: <Wallet className="h-4 w-4" />, accent: true,
              label: `Recebido · ${label}`,
              value: cobranca.nRecebidas > 0 ? brl(cobranca.recebido) : '—',
              sub: cobranca.nRecebidas > 0
                ? `${cobranca.nRecebidas} cobrança${cobranca.nRecebidas > 1 ? 's' : ''} liquidada${cobranca.nRecebidas > 1 ? 's' : ''}`
                : 'Nenhuma cobrança recebida no período.',
            },
            {
              icon: <Percent className="h-4 w-4" />,
              label: `Taxa de liquidação · ${label}`,
              value: pct(cobranca.recebido, cobranca.cobrado, 0),
              sub: cobranca.nCobradas > 0
                ? `Recebido ÷ ${brl(cobranca.cobrado)} com vencimento no período`
                : 'Nada com vencimento no período.',
            },
            {
              icon: <CalendarClock className="h-4 w-4" />,
              label: 'Em aberto · hoje',
              value: cobranca.nEmAberto > 0 ? brl(cobranca.emAberto) : '—',
              sub: cobranca.nEmAberto > 0
                ? `${cobranca.nEmAberto} cobrança${cobranca.nEmAberto > 1 ? 's' : ''} pendente${cobranca.nEmAberto > 1 ? 's' : ''}`
                : 'Nenhuma cobrança em aberto.',
            },
            {
              icon: <AlertTriangle className="h-4 w-4" />,
              label: 'Vencido · hoje',
              value: cobranca.nVencidas > 0 ? brl(cobranca.vencido) : '—',
              negative: cobranca.vencido > 0,
              sub: cobranca.nVencidas > 0
                ? `${cobranca.nVencidas} cobrança${cobranca.nVencidas > 1 ? 's' : ''} vencida${cobranca.nVencidas > 1 ? 's' : ''}`
                : 'Nada vencido.',
            },
          ]} />

          <GCard>
            <SectionTitle
              icon={<CalendarClock className="h-4 w-4" />}
              title="Idade do vencido · hoje"
              sub="Quanto tempo cada real está parado — dívida velha raramente volta inteira"
            />
            {cobranca.nVencidas > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {cobranca.faixas.map((f) => (
                  <TintedBlock
                    key={f.nome}
                    titulo={f.nome}
                    cor={f.cor}
                    valor={brl(f.valor)}
                    sub={`${f.n} cobrança${f.n !== 1 ? 's' : ''}`}
                  />
                ))}
              </div>
            ) : (
              <Empty h={140}>Nenhuma cobrança vencida.</Empty>
            )}
          </GCard>

          <GCard>
            <SectionTitle
              icon={<CreditCard className="h-4 w-4" />}
              title={`Recebido por meio de pagamento · ${label}`}
              sub="Por onde o dinheiro entra"
            />
            {cobranca.porMetodo.length > 0 ? (
              <>
                <Chart h={240}>
                  <BarChart data={cobranca.porMetodo}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                    <XAxis dataKey="nome" {...EIXO} />
                    <YAxis tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} {...EIXO} />
                    <Tooltip cursor={CURSOR} content={<CTip fmt={brlFull} />} />
                    <Bar dataKey="valor" name="Recebido" radius={[4, 4, 0, 0]}>
                      {cobranca.porMetodo.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % 6]} />)}
                    </Bar>
                  </BarChart>
                </Chart>
                {cobranca.semMetodo > 0 && (
                  <p className="text-[11px] text-foreground/30 mt-3">
                    {cobranca.semMetodo} recebimento{cobranca.semMetodo > 1 ? 's' : ''} sem meio informado, fora deste gráfico.
                  </p>
                )}
              </>
            ) : (
              <Empty h={240}>Nenhum recebimento com meio informado no período.</Empty>
            )}
          </GCard>
        </div>
      )}
    </div>
  );
}
