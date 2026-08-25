import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Loader2, Building2, ChevronRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useClients, useCreateClient, useOnboardingProgress, brl, type Client,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge, EmptyState, Panel, InitialAvatar } from '@/components/admin/ui';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

/* ── Dialog: novo cliente ───────────────────────────────────── */
function NewClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { member } = useAuth();
  const navigate = useNavigate();
  const create = useCreateClient();
  const [form, setForm] = useState({
    company_name: '', contact_name: '', whatsapp: '', email: '',
    cnpj: '', city: '', state: '', plan: '', mrr: '',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.company_name.trim()) { toast.error('Informe o nome da empresa'); return; }
    try {
      const client = await create.mutateAsync({
        company_name: form.company_name.trim(),
        contact_name: form.contact_name || null,
        whatsapp: form.whatsapp || null,
        email: form.email || null,
        cnpj: form.cnpj || null,
        city: form.city || null,
        state: form.state || null,
        plan: form.plan || null,
        mrr: form.mrr ? Number(form.mrr) : 0,
        owner_id: member?.id ?? null,
      });
      toast.success('Cliente criado — inicie a conexão');
      onClose();
      navigate(`/clientes/${client.id}`);
    } catch {
      toast.error('Erro ao criar cliente');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Novo cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <input className={inputCls} placeholder="Nome da empresa *" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="Contato" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
            <input className={inputCls} placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="E-mail" value={form.email} onChange={(e) => set('email', e.target.value)} />
            <input className={inputCls} placeholder="CNPJ" value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_70px] gap-2.5">
            <input className={inputCls} placeholder="Cidade" value={form.city} onChange={(e) => set('city', e.target.value)} />
            <input className={inputCls} placeholder="UF" maxLength={2} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="Plano" value={form.plan} onChange={(e) => set('plan', e.target.value)} />
            <input className={inputCls} placeholder="Mensalidade (R$)" type="number" value={form.mrr} onChange={(e) => set('mrr', e.target.value)} />
          </div>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar cliente
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Página ─────────────────────────────────────────────────── */
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
          <p className="text-[12px] text-foreground/40 mt-0.5">Carteira e conexão de novos sistemas</p>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Cliente
        </button>
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/30" />
          <input
            className={cn(inputCls, 'pl-9')}
            placeholder="Buscar cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
          sub={clients.length === 0 ? 'Feche a primeira venda no funil ou crie manualmente' : undefined}
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

                {/* Progresso onboarding */}
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
