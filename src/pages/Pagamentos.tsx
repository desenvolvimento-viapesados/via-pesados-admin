import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePayments, useUpdatePayment, brlFull, type Payment } from '@/hooks/useAdmin';
import { StatusBadge, EmptyState, Panel, Kpi } from '@/components/admin/ui';

export default function Pagamentos() {
  const navigate = useNavigate();
  const { data: payments = [], isLoading } = usePayments();
  const update = useUpdatePayment();
  const [filter, setFilter] = useState<'todos' | Payment['status']>('todos');

  const enriched = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return payments.map((p) => ({
      ...p,
      status: p.status === 'pendente' && p.due_date < today ? ('atrasado' as const) : p.status,
    }));
  }, [payments]);

  const stats = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    const received = enriched.filter((p) => p.status === 'pago' && (p.paid_at ?? '').slice(0, 7) === month).reduce((s, p) => s + p.amount, 0);
    const pending = enriched.filter((p) => p.status === 'pendente').reduce((s, p) => s + p.amount, 0);
    const overdue = enriched.filter((p) => p.status === 'atrasado').reduce((s, p) => s + p.amount, 0);
    return { received, pending, overdue };
  }, [enriched]);

  const filtered = filter === 'todos' ? enriched : enriched.filter((p) => p.status === filter);

  const markPaid = async (p: Payment) => {
    try {
      await update.mutateAsync({ id: p.id, status: 'pago', paid_at: new Date().toISOString() });
      toast.success('Pagamento confirmado');
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const cancel = async (p: Payment) => {
    try {
      await update.mutateAsync({ id: p.id, status: 'cancelado' });
      toast.success('Cobrança cancelada');
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: 'todos',    label: 'Todos' },
    { key: 'pendente', label: 'Pendentes' },
    { key: 'atrasado', label: 'Atrasados' },
    { key: 'pago',     label: 'Pagos' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Pagamentos</h1>
        <p className="text-[12px] text-foreground/40 mt-0.5">Cobranças e recebimentos dos clientes</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Recebido no mês" value={brlFull(stats.received)} accent="text-emerald-500" />
        <Kpi label="A receber" value={brlFull(stats.pending)} accent="text-amber-500" />
        <Kpi label="Em atraso" value={brlFull(stats.overdue)} accent="text-red-400" />
      </div>

      <div className="flex gap-1.5">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'h-9 px-3 rounded-xl text-[12px] font-medium transition-colors',
              filter === key
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'border border-black/[0.08] dark:border-white/[0.08] text-foreground/50 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<CreditCard />} title="Nenhuma cobrança" sub="Crie cobranças na página do cliente" />
      ) : (
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {filtered.map((p) => (
            <div key={p.id} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground truncate">{p.description}</p>
                <button
                  onClick={() => p.client && navigate(`/clientes/${p.client.id}`)}
                  className="text-[11px] text-foreground/40 hover:text-primary truncate"
                >
                  {p.client?.company_name ?? '—'} · venc. {new Date(p.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </button>
              </div>
              <p className="text-[13.5px] font-bold text-foreground tabular-nums shrink-0">{brlFull(p.amount)}</p>
              <StatusBadge status={p.status} />
              {(p.status === 'pendente' || p.status === 'atrasado') && (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => markPaid(p)}
                    title="Marcar pago"
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => cancel(p)}
                    title="Cancelar"
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}
