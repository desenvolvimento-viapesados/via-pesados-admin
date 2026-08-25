import { useMemo } from 'react';
import { useProspects, useMeetings, useDemos, useClients, brl } from '@/hooks/useAdmin';
import { SectionHeader, Panel, Kpi } from '@/components/admin/ui';

export default function Relatorios() {
  const { data: prospects = [] } = useProspects();
  const { data: meetings = [] } = useMeetings();
  const { data: demos = [] } = useDemos();
  const { data: clients = [] } = useClients();

  const stats = useMemo(() => {
    const total = prospects.length;
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

    // Funil por etapa
    const stages: { key: string; label: string }[] = [
      { key: 'novo',       label: 'Novos' },
      { key: 'contato',    label: 'Em contato' },
      { key: 'reuniao',    label: 'Reunião' },
      { key: 'proposta',   label: 'Proposta' },
      { key: 'fechamento', label: 'Fechamento' },
      { key: 'ganho',      label: 'Ganhos' },
    ];
    const funnel = stages.map(({ key, label }) => ({
      label,
      count: prospects.filter((p) => p.stage === key).length,
    }));
    const maxCount = Math.max(1, ...funnel.map((f) => f.count));

    // Motivos de perda
    const lossReasons: Record<string, number> = {};
    prospects.filter((p) => p.stage === 'perdido').forEach((p) => {
      const r = p.lost_reason?.trim() || 'Sem motivo registrado';
      lossReasons[r] = (lossReasons[r] ?? 0) + 1;
    });

    return {
      total, won, lost, conversion, avgTicket,
      meetingsDone, meetingsScheduled,
      demosCreated, demosConverted, demoConversion,
      funnel, maxCount,
      lossReasons: Object.entries(lossReasons).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [prospects, meetings, demos, clients]);

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Relatórios</h1>
        <p className="text-[12px] text-foreground/40 mt-0.5">Conversão e desempenho comercial</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Conversão" value={`${stats.conversion}%`} sub={`${stats.won} ganhos · ${stats.lost} perdidos`} accent="text-primary" />
        <Kpi label="Ticket médio" value={brl(stats.avgTicket)} sub="mensalidade média" />
        <Kpi label="Reuniões" value={stats.meetingsDone} sub={`${stats.meetingsScheduled} agendadas`} />
        <Kpi label="Amostras" value={`${stats.demoConversion}%`} sub={`${stats.demosConverted}/${stats.demosCreated} converteram`} accent="text-violet-400" />
      </div>

      {/* Funil */}
      <div>
        <SectionHeader title="Funil por etapa" />
        <Panel className="p-4 space-y-2.5">
          {stats.funnel.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <p className="text-[12px] text-foreground/50 w-24 shrink-0">{f.label}</p>
              <div className="flex-1 h-6 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full rounded-lg bg-primary/60 flex items-center px-2 transition-all"
                  style={{ width: `${Math.max(6, (f.count / stats.maxCount) * 100)}%` }}
                >
                  <span className="text-[11px] font-bold text-white tabular-nums">{f.count}</span>
                </div>
              </div>
            </div>
          ))}
        </Panel>
      </div>

      {/* Motivos de perda */}
      {stats.lossReasons.length > 0 && (
        <div>
          <SectionHeader title="Motivos de perda" />
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
            {stats.lossReasons.map(([reason, count]) => (
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
