import { useState, useMemo } from 'react';
import { Plus, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useTickets, useCreateTicket, useUpdateTicket, useClients, type Ticket,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge, EmptyState, Panel } from '@/components/admin/ui';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const PRIORITY_STYLES: Record<string, string> = {
  baixa: 'text-zinc-400',
  media: 'text-blue-400',
  alta: 'text-amber-500',
  urgente: 'text-red-400',
};

function NewTicketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { member } = useAuth();
  const create = useCreateTicket();
  const { data: clients = [] } = useClients();
  const [form, setForm] = useState({ client_id: '', subject: '', description: '', priority: 'media' });

  const submit = async () => {
    if (!form.subject.trim()) { toast.error('Informe o assunto'); return; }
    try {
      await create.mutateAsync({
        client_id: form.client_id || null,
        subject: form.subject.trim(),
        description: form.description || null,
        priority: form.priority as Ticket['priority'],
        assigned_to: member?.id ?? null,
      });
      toast.success('Ticket criado');
      setForm({ client_id: '', subject: '', description: '', priority: 'media' });
      onClose();
    } catch {
      toast.error('Erro ao criar ticket');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Novo ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <select className={inputCls} value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}>
            <option value="">Cliente (opcional)…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <input className={inputCls} placeholder="Assunto *" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
          <textarea className={cn(inputCls, 'h-20 py-2 resize-none')} placeholder="Descrição" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <select className={inputCls} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar ticket
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Tickets() {
  const { data: tickets = [], isLoading } = useTickets();
  const update = useUpdateTicket();
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState<'abertos' | 'todos'>('abertos');

  const filtered = useMemo(
    () => (filter === 'abertos' ? tickets.filter((t) => t.status !== 'resolvido') : tickets),
    [tickets, filter],
  );

  const cycle = async (t: Ticket) => {
    const next: Record<Ticket['status'], Ticket['status']> = {
      aberto: 'em_andamento',
      em_andamento: 'aguardando',
      aguardando: 'resolvido',
      resolvido: 'aberto',
    };
    const status = next[t.status];
    try {
      await update.mutateAsync({
        id: t.id,
        status,
        resolved_at: status === 'resolvido' ? new Date().toISOString() : null,
      });
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Suporte</h1>
          <p className="text-[12px] text-foreground/40 mt-0.5">Tickets dos clientes da plataforma</p>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Ticket
        </button>
      </div>

      <div className="flex gap-1.5">
        {(['abertos', 'todos'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              'h-9 px-3 rounded-xl text-[12px] font-medium capitalize transition-colors',
              filter === k
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'border border-black/[0.08] dark:border-white/[0.08] text-foreground/50 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
            )}
          >
            {k}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<MessageSquare />} title="Nenhum ticket" sub="Tudo em dia com os clientes" />
      ) : (
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {filtered.map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-center gap-3">
              <span className={cn('text-[10px] font-bold uppercase tracking-wide shrink-0 w-14', PRIORITY_STYLES[t.priority])}>
                {t.priority}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground truncate">{t.subject}</p>
                <p className="text-[11px] text-foreground/40 truncate">
                  {t.client?.company_name ?? 'Interno'} · {new Date(t.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <button onClick={() => cycle(t)} title="Avançar status">
                <StatusBadge status={t.status} className="cursor-pointer hover:opacity-80" />
              </button>
            </div>
          ))}
        </Panel>
      )}

      <NewTicketDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
