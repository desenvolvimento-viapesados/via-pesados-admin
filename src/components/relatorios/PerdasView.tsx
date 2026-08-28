import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart as RePieChart, Pie,
} from 'recharts';
import {
  XCircle, TrendingDown, Clock, Percent, DollarSign, Users, Calendar,
} from 'lucide-react';
import type { Client, Prospect } from '@/hooks/useAdmin';
import {
  GCard, SectionTitle, KpiGrid, Chart, CTip, Empty, RankRow,
  ZebraTable, Tr, Td, SubTabs, brl, brlFull, pct,
  TYPE_COLORS, EIXO, GRADE, CURSOR,
} from './primitives';

interface Props {
  clients: Client[];
  prospects: Prospect[];
  periodo: { start: string; end: string };
  label: string;
}

const dias = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));

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

export function PerdasView({ clients, prospects, periodo, label }: Props) {
  const navigate = useNavigate();
  const [sub, setSub] = useState('Cancelamentos');

  const inP = (iso: string | null | undefined) =>
    !!iso && iso.slice(0, 10) >= periodo.start && iso.slice(0, 10) <= periodo.end;

  /* ── Cancelamentos ───────────────────────────────────────────── */
  const churn = useMemo(() => {
    const cancelados = clients.filter((c) => c.status === 'cancelado');
    const noP = cancelados.filter((c) => inP(c.canceled_at));

    // Quanto tempo cada um ficou antes de sair
    const vidas = cancelados
      .filter((c) => c.activated_at && c.canceled_at)
      .map((c) => dias(c.activated_at!, c.canceled_at!));
    const vidaMedia = vidas.length ? Math.round(vidas.reduce((a, b) => a + b, 0) / vidas.length) : null;

    const serie = ultimos12().map((k) => ({
      mes: mesLabel(k),
      chave: k,
      Cancelamentos: cancelados.filter((c) => c.canceled_at?.slice(0, 7) === k).length,
      MRR: cancelados.filter((c) => c.canceled_at?.slice(0, 7) === k)
        .reduce((s, c) => s + Number(c.mrr ?? 0), 0),
    }));

    const faixas = [
      { nome: 'Menos de 3 meses', cor: 'hsl(0,80%,45%)', min: 0, max: 89 },
      { nome: '3 a 6 meses', cor: 'hsl(25,95%,53%)', min: 90, max: 179 },
      { nome: '6 a 12 meses', cor: 'hsl(45,90%,50%)', min: 180, max: 364 },
      { nome: 'Mais de 1 ano', cor: 'hsl(152,60%,45%)', min: 365, max: 99999 },
    ].map((f) => {
      const l = cancelados.filter((c) => {
        if (!c.activated_at || !c.canceled_at) return false;
        const d = dias(c.activated_at, c.canceled_at);
        return d >= f.min && d <= f.max;
      });
      return { ...f, n: l.length, mrr: l.reduce((s, c) => s + Number(c.mrr ?? 0), 0) };
    });

    const semData = cancelados.filter((c) => !c.activated_at || !c.canceled_at).length;

    return {
      total: cancelados.length,
      noP: noP.length,
      mrrNoP: noP.reduce((s, c) => s + Number(c.mrr ?? 0), 0),
      mrrTotal: cancelados.reduce((s, c) => s + Number(c.mrr ?? 0), 0),
      vidaMedia, nVidas: vidas.length, semData,
      serie,
      temSerie: serie.some((s) => s.Cancelamentos > 0),
      faixas,
      lista: [...cancelados].sort((a, b) => (b.canceled_at ?? '').localeCompare(a.canceled_at ?? '')),
    };
  }, [clients, periodo]);

  /* ── Negócios perdidos ───────────────────────────────────────── */
  const perdidos = useMemo(() => {
    const todos = prospects.filter((p) => p.stage === 'perdido');
    const noP = todos.filter((p) => inP(p.updated_at));
    const ganhosNoP = prospects.filter((p) => p.stage === 'ganho' && inP(p.updated_at)).length;

    const motivos = new Map<string, { nome: string; n: number; valor: number }>();
    let semMotivo = 0;
    todos.forEach((p) => {
      const raw = p.lost_reason?.trim();
      if (!raw) { semMotivo++; return; }
      const k = raw.toLowerCase();
      const a = motivos.get(k) ?? { nome: raw, n: 0, valor: 0 };
      a.n += 1; a.valor += Number(p.proposal_value ?? 0);
      motivos.set(k, a);
    });

    const porOrigem = new Map<string, number>();
    let semOrigem = 0;
    todos.forEach((p) => {
      const raw = p.source?.trim();
      if (!raw) { semOrigem++; return; }
      porOrigem.set(raw, (porOrigem.get(raw) ?? 0) + 1);
    });

    const tempos = todos.map((p) => dias(p.created_at, p.updated_at));
    const tempoMedio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;

    return {
      total: todos.length,
      noP: noP.length,
      valorNoP: noP.reduce((s, p) => s + Number(p.proposal_value ?? 0), 0),
      valorTotal: todos.reduce((s, p) => s + Number(p.proposal_value ?? 0), 0),
      decididos: noP.length + ganhosNoP,
      ganhosNoP,
      motivos: [...motivos.values()].sort((a, b) => b.n - a.n),
      semMotivo, comMotivo: todos.length - semMotivo,
      porOrigem: [...porOrigem.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n),
      semOrigem,
      tempoMedio, nTempos: tempos.length,
      lista: [...todos].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    };
  }, [prospects, periodo]);

  return (
    <div className="space-y-6">
      <SubTabs
        opcoes={['Cancelamentos', 'Negócios perdidos']}
        valor={sub}
        onChange={setSub}
        cor="primary"
      />

      {sub === 'Cancelamentos' && (
        <div className="space-y-6">
          <KpiGrid items={[
            {
              icon: <XCircle className="h-4 w-4" />, accent: true,
              label: `Cancelamentos · ${label}`,
              value: churn.noP > 0 ? String(churn.noP) : '—',
              sub: churn.noP > 0 ? `${brl(churn.mrrNoP)} de MRR perdido` : 'Nenhum cancelamento no período.',
            },
            {
              icon: <DollarSign className="h-4 w-4" />,
              label: 'MRR perdido · total',
              value: churn.total > 0 ? brl(churn.mrrTotal) : '—',
              negative: churn.mrrTotal > 0,
              sub: churn.total > 0
                ? `${churn.total} contrato${churn.total > 1 ? 's' : ''} encerrado${churn.total > 1 ? 's' : ''} no histórico`
                : 'Nenhum cancelamento no histórico.',
            },
            {
              icon: <Clock className="h-4 w-4" />,
              label: 'Vida média · total',
              value: churn.vidaMedia !== null ? `${churn.vidaMedia}d` : '—',
              sub: churn.nVidas > 0
                ? `Da ativação ao cancelamento, em ${churn.nVidas} contrato${churn.nVidas > 1 ? 's' : ''}`
                : 'Nenhum contrato com ativação e cancelamento registrados.',
            },
            {
              icon: <Users className="h-4 w-4" />,
              label: 'Base cancelada · hoje',
              value: churn.total > 0 ? pct(churn.total, clients.length, 0) : '—',
              sub: clients.length > 0
                ? `${churn.total} de ${clients.length} clientes já cadastrados`
                : 'Nenhum cliente cadastrado.',
            },
          ]} />

          <GCard>
            <SectionTitle
              icon={<TrendingDown className="h-4 w-4" />}
              title="Cancelamentos · 12 meses"
              sub="Quantidade e MRR perdido por mês de saída"
            />
            {churn.temSerie ? (
              <Chart h={280}>
                <BarChart data={churn.serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                  <XAxis dataKey="mes" {...EIXO} />
                  <YAxis yAxisId="l" allowDecimals={false} {...EIXO} />
                  <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} {...EIXO} />
                  <Tooltip cursor={CURSOR} content={<CTip fmt={(v) => (v > 100 ? brlFull(v) : String(v))} />} />
                  <Bar yAxisId="l" dataKey="Cancelamentos" fill="hsl(0,70%,50%)" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="r" dataKey="MRR" fill="hsl(0,80%,35%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </Chart>
            ) : (
              <Empty>Nenhum cancelamento nos últimos 12 meses.</Empty>
            )}
          </GCard>

          <GCard>
            <SectionTitle
              icon={<Calendar className="h-4 w-4" />}
              title="Quanto tempo ficaram antes de sair · total"
              sub="Saída precoce é falha de entrega ou de expectativa na venda; saída tardia costuma ser preço ou uso"
            />
            {churn.nVidas > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {churn.faixas.map((f) => (
                  <div
                    key={f.nome}
                    className="rounded-xl p-3 border"
                    style={{ background: `${f.cor}12`, borderColor: `${f.cor}33` }}
                  >
                    <p className="text-[11px] font-medium" style={{ color: f.cor }}>{f.nome}</p>
                    <p className="text-[17px] font-bold text-foreground leading-none mt-1.5 tabular-nums">{f.n}</p>
                    <p className="text-[10.5px] text-foreground/30 mt-1">{f.mrr > 0 ? `${brl(f.mrr)} perdidos` : 'sem MRR informado'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Empty h={140}>Nenhum contrato com ativação e cancelamento registrados.</Empty>
            )}
            {churn.semData > 0 && (
              <p className="text-[11px] text-foreground/30 mt-3">
                {churn.semData} cancelamento{churn.semData > 1 ? 's' : ''} sem data de ativação, fora desta contagem.
              </p>
            )}
          </GCard>

          <GCard>
            <SectionTitle
              icon={<XCircle className="h-4 w-4" />}
              title="Contratos encerrados · total"
              sub="Não há campo de motivo de cancelamento — registrar isso seria o próximo passo para entender o padrão"
            />
            {churn.lista.length > 0 ? (
              <ZebraTable head={['Cliente', 'Plano', 'Entrou', 'Saiu', 'Durou', 'MRR']} sticky>
                {churn.lista.slice(0, 15).map((c) => (
                  <Tr key={c.id} onClick={() => navigate(`/clientes/${c.id}`)}>
                    <Td sticky className="text-foreground/70">{c.company_name}</Td>
                    <Td className="text-foreground/50">{c.plan ?? '—'}</Td>
                    <Td>{c.activated_at ? c.activated_at.slice(0, 10).split('-').reverse().join('/') : '—'}</Td>
                    <Td>{c.canceled_at ? c.canceled_at.slice(0, 10).split('-').reverse().join('/') : '—'}</Td>
                    <Td>{c.activated_at && c.canceled_at ? `${dias(c.activated_at, c.canceled_at)}d` : '—'}</Td>
                    <Td className="font-semibold text-red-400">{Number(c.mrr ?? 0) > 0 ? brl(Number(c.mrr)) : '—'}</Td>
                  </Tr>
                ))}
              </ZebraTable>
            ) : (
              <Empty h={180}>Nenhum contrato encerrado — a base nunca perdeu um cliente.</Empty>
            )}
          </GCard>
        </div>
      )}

      {sub === 'Negócios perdidos' && (
        <div className="space-y-6">
          <KpiGrid items={[
            {
              icon: <XCircle className="h-4 w-4" />, accent: true,
              label: `Negócios perdidos · ${label}`,
              value: perdidos.noP > 0 ? String(perdidos.noP) : '—',
              sub: perdidos.valorNoP > 0
                ? `${brl(perdidos.valorNoP)} em propostas que não fecharam`
                : 'Nenhum negócio perdido no período.',
            },
            {
              icon: <Percent className="h-4 w-4" />,
              label: `Taxa de perda · ${label}`,
              value: pct(perdidos.noP, perdidos.decididos, 0),
              sub: perdidos.decididos > 0
                ? `${perdidos.noP} perdidos de ${perdidos.decididos} decididos`
                : 'Nenhum negócio decidido no período.',
            },
            {
              icon: <DollarSign className="h-4 w-4" />,
              label: 'Valor perdido · total',
              value: perdidos.valorTotal > 0 ? brl(perdidos.valorTotal) : '—',
              negative: perdidos.valorTotal > 0,
              sub: perdidos.total > 0
                ? `${perdidos.total} negócio${perdidos.total > 1 ? 's' : ''} no histórico`
                : 'Nenhum negócio perdido no histórico.',
            },
            {
              icon: <Clock className="h-4 w-4" />,
              label: 'Tempo até desistir · total',
              value: perdidos.tempoMedio !== null ? `${perdidos.tempoMedio}d` : '—',
              sub: perdidos.nTempos > 0
                ? `Da criação à perda, em ${perdidos.nTempos} negócio${perdidos.nTempos > 1 ? 's' : ''}`
                : 'Nenhum negócio perdido ainda.',
            },
          ]} />

          <div className="grid gap-4 md:grid-cols-2">
            <GCard>
              <SectionTitle
                icon={<TrendingDown className="h-4 w-4" />}
                title="Por que perdemos · total"
                sub="Motivo registrado no fechamento do negócio"
              />
              {perdidos.motivos.length > 0 ? (
                <div className="space-y-4">
                  <Chart h={240}>
                    <RePieChart>
                      <Pie
                        data={perdidos.motivos} dataKey="n" nameKey="nome"
                        cx="50%" cy="50%" innerRadius={46} outerRadius={80} paddingAngle={3}
                        label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                      >
                        {perdidos.motivos.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % 6]} />)}
                      </Pie>
                      <Tooltip content={<CTip fmt={(v) => `${v} negócio${v > 1 ? 's' : ''}`} />} />
                    </RePieChart>
                  </Chart>
                  <div className="space-y-2">
                    {perdidos.motivos.map((m, i) => (
                      <div key={m.nome} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: TYPE_COLORS[i % 6] }} />
                          <span className="text-[12px] text-foreground/60 truncate">{m.nome}</span>
                        </div>
                        <span className="text-[12px] font-medium text-foreground tabular-nums shrink-0">
                          {m.n}
                          {m.valor > 0 && <span className="text-foreground/30 ml-1.5">{brl(m.valor)}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  {perdidos.semMotivo > 0 && (
                    <p className="text-[11px] text-foreground/30">
                      {perdidos.comMotivo} de {perdidos.total} perdas com motivo registrado.
                    </p>
                  )}
                </div>
              ) : (
                <Empty h={240}>
                  {perdidos.total > 0
                    ? `${perdidos.total} negócio${perdidos.total > 1 ? 's' : ''} perdido${perdidos.total > 1 ? 's' : ''}, nenhum com motivo registrado.`
                    : 'Nenhum negócio perdido no histórico.'}
                </Empty>
              )}
            </GCard>

            <GCard>
              <SectionTitle
                icon={<Users className="h-4 w-4" />}
                title="Perdas por origem · total"
                sub="Canal que traz volume mas não fecha custa caro"
              />
              {perdidos.porOrigem.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {perdidos.porOrigem.slice(0, 8).map((o, i) => (
                      <RankRow key={o.nome} pos={i + 1} nome={o.nome} valor={String(o.n)} cor={TYPE_COLORS[i % 6]} />
                    ))}
                  </div>
                  {perdidos.semOrigem > 0 && (
                    <p className="text-[11px] text-foreground/30 mt-3">
                      {perdidos.semOrigem} perda{perdidos.semOrigem > 1 ? 's' : ''} sem origem informada.
                    </p>
                  )}
                </>
              ) : (
                <Empty h={240}>Nenhuma perda com origem informada.</Empty>
              )}
            </GCard>
          </div>

          <GCard>
            <SectionTitle
              icon={<XCircle className="h-4 w-4" />}
              title="Negócios perdidos · total"
              sub="Data de perda aproximada pela última atualização do registro"
            />
            {perdidos.lista.length > 0 ? (
              <ZebraTable head={['Empresa', 'Origem', 'Motivo', 'Durou', 'Valor']} sticky>
                {perdidos.lista.slice(0, 15).map((p) => (
                  <Tr key={p.id}>
                    <Td sticky className="text-foreground/70">{p.company_name}</Td>
                    <Td className="text-foreground/50">{p.source ?? '—'}</Td>
                    <Td className="text-foreground/50">{p.lost_reason ?? '—'}</Td>
                    <Td>{dias(p.created_at, p.updated_at)}d</Td>
                    <Td className="font-semibold text-foreground">
                      {Number(p.proposal_value ?? 0) > 0 ? brl(Number(p.proposal_value)) : '—'}
                    </Td>
                  </Tr>
                ))}
              </ZebraTable>
            ) : (
              <Empty h={180}>Nenhum negócio perdido no histórico.</Empty>
            )}
          </GCard>
        </div>
      )}
    </div>
  );
}
