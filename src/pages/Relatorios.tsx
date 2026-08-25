import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useProspects, useMeetings, useDemos, useClients, brl } from '@/hooks/useAdmin';
import { SectionHeader, Panel, Kpi } from '@/components/admin/ui';

/** Últimos N meses como 'YYYY-MM', do mais antigo ao mais recente. */
const lastMonths = (n: number) => {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};

export default function Relatorios() {
  const { data: prospects = [] } = useProspects();
  const { data: meetings = [] } = useMeetings();
  const { data: demos = [] } = useDemos();
  const { data: clients = [] } = useClients();

  /* ── Conversão comercial ──────────────────────────────────── */
  const comercial = useMemo(() => {
    const won = prospects.filter((p) => p.stage === 'ganho').length;
    const lost = prospects.filter((p) => p.stage === 'perdido').length;
    const closed = won + lost;
    const conversion = closed > 0 ? Math.round((won / closed) * 100) : 0;

    const activeClients = clients.filter((c) => c.status === 'ativo' || c.status === 'onboarding');
    const avgTicket = activeClients.length
      ? activeClients.reduce((s, c) => s + (c.mrr ?? 0), 0) / activeClients.length
      : 0;

    const meetingsDone = meetings.filter((m) => m.status === 'realizada').length;
    const meetingsScheduled = meetings.filter((m) => m.status === 'agendada').length;

    const demosCreated = demos.length;
    const demosConverted = demos.filter((d) => d.status === 'convertida').length;
    const demoConversion = demosCreated > 0 ? Math.round((demosConverted / demosCreated) * 100) : 0;

    const stages = [
      { key: 'novo',       label: 'Novos' },
      { key: 'contato',    label: 'Em contato' },
      { key: 'reuniao',    label: 'Reunião' },
      { key: 'amostra',    label: 'Amostra' },
      { key: 'proposta',   label: 'Proposta' },
      { key: 'fechamento', label: 'Fechamento' },
      { key: 'ganho',      label: 'Ganhos' },
    ];
    const funnel = stages.map(({ key, label }) => ({
      label,
      count: prospects.filter((p) => p.stage === key).length,
    }));

    const lossReasons: Record<string, number> = {};
    prospects.filter((p) => p.stage === 'perdido').forEach((p) => {
      const r = p.lost_reason?.trim() || 'Sem motivo registrado';
      lossReasons[r] = (lossReasons[r] ?? 0) + 1;
    });

    return {
      won, lost, conversion, avgTicket,
      meetingsDone, meetingsScheduled,
      demosCreated, demosConverted, demoConversion,
      funnel, maxCount: Math.max(1, ...funnel.map((f) => f.count)),
      lossReasons: Object.entries(lossReasons).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [prospects, meetings, demos, clients]);

  /* ── Crescimento da carteira ──────────────────────────────── */
  const crescimento = useMemo(() => {
    const months = lastMonths(6);

    const series = months.map((m) => {
      const end = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1); // 1º dia do mês seguinte

      // clientes vivos ao fim do mês
      const alive = clients.filter((c) => {
        const created = new Date(c.created_at);
        if (created >= end) return false;
        if (!c.canceled_at) return c.status !== 'cancelado';
        return new Date(c.canceled_at) >= end;
      });

      return {
        month: m,
        novos: clients.filter((c) => c.created_at.slice(0, 7) === m).length,
        churn: clients.filter((c) => (c.canceled_at ?? '').slice(0, 7) === m).length,
        ativos: alive.length,
        mrr: alive.reduce((s, c) => s + (c.mrr ?? 0), 0),
      };
    });

    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    const mrrDelta = last && prev ? last.mrr - prev.mrr : 0;
    const maxMrr = Math.max(1, ...series.map((s) => s.mrr));

    return { series, last, mrrDelta, maxMrr };
  }, [clients]);

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Relatórios</h1>
        <p className="text-[12px] text-foreground/40 mt-0.5">Conversão comercial e crescimento da carteira</p>
      </div>

      {/* ── Conversão ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Conversão" value={`${comercial.conversion}%`} sub={`${comercial.won} ganhos · ${comercial.lost} perdidos`} accent="text-primary" />
        <Kpi label="Ticket médio" value={brl(comercial.avgTicket)} sub="mensalidade média" />
        <Kpi label="Reuniões" value={comercial.meetingsDone} sub={`${comercial.meetingsScheduled} agendadas`} />
        <Kpi label="Amostras" value={`${comercial.demoConversion}%`} sub={`${comercial.demosConverted}/${comercial.demosCreated} converteram`} accent="text-violet-400" />
      </div>

      <div>
        <SectionHeader title="Funil por etapa" />
        <Panel className="p-4 space-y-2.5">
          {comercial.funnel.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <p className="text-[12px] text-foreground/50 w-24 shrink-0">{f.label}</p>
              <div className="flex-1 h-6 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full rounded-lg bg-primary/60 flex items-center px-2 transition-all"
                  style={{ width: `${Math.max(6, (f.count / comercial.maxCount) * 100)}%` }}
                >
                  <span className="text-[11px] font-bold text-white tabular-nums">{f.count}</span>
                </div>
              </div>
            </div>
          ))}
        </Panel>
      </div>

      {/* ── Crescimento ────────────────────────────────────── */}
      <div>
        <SectionHeader
          title="Crescimento da carteira"
          right={
            crescimento.mrrDelta !== 0 ? (
              <span className={`text-[11px] font-semibold flex items-center gap-1 ${crescimento.mrrDelta > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                {crescimento.mrrDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {crescimento.mrrDelta > 0 ? '+' : ''}{brl(crescimento.mrrDelta)} no mês
              </span>
            ) : undefined
          }
        />
        <Panel className="overflow-hidden">
          {/* Barras de MRR por mês */}
          <div className="p-4 flex items-end gap-2 h-40">
            {crescimento.series.map((s) => (
              <div key={s.month} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <span className="text-[10px] font-semibold text-foreground/60 tabular-nums">{brl(s.mrr)}</span>
                <div
                  className="w-full rounded-t-lg bg-primary/60 hover:bg-primary/80 transition-all min-h-[3px]"
                  style={{ height: `${(s.mrr / crescimento.maxMrr) * 100}%` }}
                  title={`${s.ativos} clientes ativos`}
                />
                <span className="text-[10px] text-foreground/35 capitalize">{monthLabel(s.month)}</span>
              </div>
            ))}
          </div>

          {/* Detalhe mês a mês */}
          <div className="border-t border-black/[0.06] dark:border-white/[0.06] divide-y divide-black/[0.05] dark:divide-white/[0.05]">
            {[...crescimento.series].reverse().map((s) => (
              <div key={s.month} className="px-4 py-2.5 flex items-center gap-3 text-[12px]">
                <p className="text-foreground/60 capitalize w-20 shrink-0">{monthLabel(s.month)}</p>
                <p className="text-emerald-500 font-medium w-20 tabular-nums">
                  {s.novos > 0 ? `+${s.novos} novo${s.novos > 1 ? 's' : ''}` : '—'}
                </p>
                <p className="text-red-400/80 font-medium w-24 tabular-nums">
                  {s.churn > 0 ? `−${s.churn} cancel.` : '—'}
                </p>
                <p className="text-foreground/45 flex-1 tabular-nums">{s.ativos} ativos</p>
                <p className="font-bold text-foreground tabular-nums shrink-0">{brl(s.mrr)}<span className="text-[10px] font-normal text-foreground/35">/mês</span></p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Perdas ─────────────────────────────────────────── */}
      {comercial.lossReasons.length > 0 && (
        <div>
          <SectionHeader title="Motivos de perda" />
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
            {comercial.lossReasons.map(([reason, count]) => (
              <div key={reason} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <p className="text-[12.5px] text-foreground/70 truncate">{reason}</p>
                <p className="text-[12.5px] font-bold text-red-400/80 tabular-nums shrink-0">{count}</p>
              </div>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}
