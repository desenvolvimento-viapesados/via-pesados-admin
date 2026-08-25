import { useMemo } from 'react';
import { TrendingUp, Users, AlertTriangle } from 'lucide-react';
import { useClients, usePayments, brl, brlFull } from '@/hooks/useAdmin';
import { SectionHeader, Panel, Kpi, StatusBadge } from '@/components/admin/ui';

export default function Financeiro() {
  const { data: clients = [] } = useClients();
  const { data: payments = [] } = usePayments();

  const stats = useMemo(() => {
    const active = clients.filter((c) => c.status === 'ativo');
    const onboarding = clients.filter((c) => c.status === 'onboarding');
    const churned = clients.filter((c) => c.status === 'cancelado');
    const overdueClients = clients.filter((c) => c.status === 'inadimplente');

    const mrrActive = active.reduce((s, c) => s + (c.mrr ?? 0), 0);
    const mrrOnboarding = onboarding.reduce((s, c) => s + (c.mrr ?? 0), 0);
    const mrrLost = churned.reduce((s, c) => s + (c.mrr ?? 0), 0);

    const month = new Date().toISOString().slice(0, 7);
    const receivedMonth = payments
      .filter((p) => p.status === 'pago' && (p.paid_at ?? '').slice(0, 7) === month)
      .reduce((s, p) => s + p.amount, 0);

    const today = new Date().toISOString().slice(0, 10);
    const overdue = payments
      .filter((p) => (p.status === 'pendente' && p.due_date < today) || p.status === 'atrasado')
      .reduce((s, p) => s + p.amount, 0);

    // Receita por mês (últimos 6)
    const byMonth: Record<string, number> = {};
    payments.filter((p) => p.status === 'pago' && p.paid_at).forEach((p) => {
      const m = p.paid_at!.slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + p.amount;
    });
    const months = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);

    return { active, onboarding, overdueClients, mrrActive, mrrOnboarding, mrrLost, receivedMonth, overdue, months };
  }, [clients, payments]);

  const fmtMonth = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Financeiro</h1>
        <p className="text-[12px] text-foreground/40 mt-0.5">Receita recorrente e saúde da carteira</p>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="MRR ativo" value={brl(stats.mrrActive)} sub={`${stats.active.length} clientes`} accent="text-primary" />
        <Kpi label="MRR entrando" value={brl(stats.mrrOnboarding)} sub={`${stats.onboarding.length} em onboarding`} accent="text-amber-500" />
        <Kpi label="Recebido no mês" value={brl(stats.receivedMonth)} accent="text-emerald-500" />
        <Kpi label="Inadimplência" value={brl(stats.overdue)} sub={`${stats.overdueClients.length} clientes`} accent="text-red-400" />
      </div>

      {/* Receita por mês */}
      <div>
        <SectionHeader title="Receita por mês" />
        {stats.months.length === 0 ? (
          <Panel className="p-8 text-center">
            <TrendingUp className="h-8 w-8 text-foreground/15 mx-auto mb-2" />
            <p className="text-[12.5px] text-foreground/40">Nenhum recebimento registrado ainda</p>
          </Panel>
        ) : (
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
            {stats.months.map(([m, v]) => {
              const max = Math.max(...stats.months.map(([, x]) => x));
              return (
                <div key={m} className="px-4 py-3 flex items-center gap-4">
                  <p className="text-[12.5px] text-foreground/60 capitalize w-40 shrink-0">{fmtMonth(m)}</p>
                  <div className="flex-1 h-2 rounded-full bg-black/[0.05] dark:bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${max ? (v / max) * 100 : 0}%` }} />
                  </div>
                  <p className="text-[13px] font-bold text-foreground tabular-nums shrink-0">{brlFull(v)}</p>
                </div>
              );
            })}
          </Panel>
        )}
      </div>

      {/* Carteira */}
      <div>
        <SectionHeader title="Carteira por cliente" />
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {clients.filter((c) => c.status !== 'cancelado').length === 0 ? (
            <div className="p-8 text-center">
              <Users className="h-8 w-8 text-foreground/15 mx-auto mb-2" />
              <p className="text-[12.5px] text-foreground/40">Nenhum cliente na carteira</p>
            </div>
          ) : (
            clients
              .filter((c) => c.status !== 'cancelado')
              .sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0))
              .map((c) => (
                <div key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                  <p className="text-[12.5px] font-medium text-foreground truncate flex-1">{c.company_name}</p>
                  <StatusBadge status={c.status} />
                  <p className="text-[12.5px] font-bold text-foreground tabular-nums w-28 text-right">
                    {brl(c.mrr)}<span className="text-[10px] font-normal text-foreground/35">/mês</span>
                  </p>
                </div>
              ))
          )}
        </Panel>
      </div>

      {stats.mrrLost > 0 && (
        <Panel className="p-4 flex items-center gap-3 border-red-500/20">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[12px] text-foreground/60">
            MRR perdido com cancelamentos: <span className="font-bold text-red-400">{brl(stats.mrrLost)}/mês</span>
          </p>
        </Panel>
      )}
    </div>
  );
}
