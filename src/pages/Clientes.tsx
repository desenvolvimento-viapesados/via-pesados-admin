import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Building2, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClients, useOnboardingProgress, brl, type Client } from '@/hooks/useAdmin';
import { NewClientDialog } from '@/components/crm/NewClientDialog';
import { StatusBadge, EmptyState, Panel, InitialAvatar } from '@/components/admin/ui';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

export default function Clientes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: clients = [], isLoading } = useClients();
  const { data: progress = {} } = useOnboardingProgress();
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todos' | Client['status']>('todos');

  useEffect(() => {
    if (params.get('new') === '1') {
      setNewOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, []);

  const filtered = useMemo(() => {
    let list = clients;
    if (filter !== 'todos') list = list.filter((c) => c.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.company_name.toLowerCase().includes(q) ||
        (c.contact_name ?? '').toLowerCase().includes(q) ||
        (c.city ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [clients, filter, search]);

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: 'todos',        label: 'Todos' },
    { key: 'onboarding',   label: 'Onboarding' },
    { key: 'ativo',        label: 'Ativos' },
    { key: 'inadimplente', label: 'Inadimplentes' },
    { key: 'cancelado',    label: 'Cancelados' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Clientes</h1>
          <p className="text-[12px] text-foreground/40 mt-0.5">Carteira e contas da plataforma</p>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Cliente
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/30" />
          <input className={cn(inputCls, 'pl-9')} placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'h-10 px-3 rounded-xl text-[12px] font-medium whitespace-nowrap transition-colors',
                filter === key
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'border border-black/[0.08] dark:border-white/[0.08] text-foreground/50 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={clients.length === 0 ? 'Nenhum cliente ainda' : 'Nenhum resultado'}
          sub={clients.length === 0 ? 'Feche a primeira venda no CRM' : undefined}
        />
      ) : (
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {filtered.map((c) => {
            const prog = progress[c.id];
            const pct = prog ? Math.round((prog.done / prog.total) * 100) : 0;
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors text-left group"
              >
                <InitialAvatar name={c.company_name} src={c.logo_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13.5px] font-semibold text-foreground truncate">{c.company_name}</p>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-[11px] text-foreground/40 mt-0.5 truncate">
                    {[c.contact_name, [c.city, c.state].filter(Boolean).join('/'), c.plan].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>

                {c.status === 'onboarding' && prog && (
                  <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 w-24">
                    <p className="text-[10px] text-foreground/40 tabular-nums">{prog.done}/{prog.total} etapas</p>
                    <div className="h-1.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                <p className="text-[13px] font-bold text-foreground tabular-nums shrink-0 w-24 text-right">
                  {brl(c.mrr)}<span className="text-[10px] font-normal text-foreground/35">/mês</span>
                </p>
                <ChevronRight className="h-4 w-4 text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            );
          })}
        </Panel>
      )}

      <NewClientDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
