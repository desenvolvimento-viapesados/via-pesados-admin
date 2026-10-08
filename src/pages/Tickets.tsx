import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, MessageSquare, Clock, Send, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useTickets, useCreateTicket, useUpdateTicket, useClients, useTeam,
  useTicketMensagens, useCreateTicketMensagem, type Ticket,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, Panel, InitialAvatar } from '@/components/admin/ui';
import {
  prazoDoChamado, ordenarChamados, ROTULO_PRIORIDADE, ROTULO_STATUS, PRAZO_EM_HORAS, type EstadoDoPrazo,
} from '@/lib/chamados';

/* Chamados: o que os clientes pediram, quem está cuidando, em que pé está e
   se está dentro do prazo (lib/chamados.ts). Cada chamado guarda a conversa
   do atendimento — antes era só assunto e um status que girava em ciclo. */

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const COR_PRIORIDADE: Record<string, string> = {
  baixa: 'text-zinc-400', media: 'text-blue-400', alta: 'text-amber-500', urgente: 'text-red-400',
};
const COR_PRAZO: Record<EstadoDoPrazo, string> = {
  no_prazo: 'text-foreground/40', perto: 'text-amber-500', estourado: 'text-red-400', resolvido: 'text-emerald-500/80',
};
const COR_STATUS: Record<string, string> = {
  aberto: 'bg-blue-500/10 text-blue-400',
  em_andamento: 'bg-primary/10 text-primary',
  aguardando: 'bg-amber-500/10 text-amber-500',
  resolvido: 'bg-emerald-500/10 text-emerald-500',
};

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

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
      toast.success('Chamado aberto');
      setForm({ client_id: '', subject: '', description: '', priority: 'media' });
      onClose();
    } catch {
      toast.error('Não consegui abrir o chamado');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Novo chamado</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <select className={inputCls} value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}>
            <option value="">Cliente (opcional)…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <input className={inputCls} placeholder="Assunto *" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
          <textarea className={cn(inputCls, 'h-24 py-2 resize-none')} placeholder="O que o cliente pediu" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <select className={inputCls} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
            {(['baixa', 'media', 'alta', 'urgente'] as const).map((p) => (
              <option key={p} value={p}>{ROTULO_PRIORIDADE[p]} — resolver em até {PRAZO_EM_HORAS[p] < 48 ? `${PRAZO_EM_HORAS[p]}h` : `${PRAZO_EM_HORAS[p] / 24} dias`}</option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Abrir chamado
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChamadoDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const navigate = useNavigate();
  const { member } = useAuth();
  const update = useUpdateTicket();
  const { data: equipe = [] } = useTeam();
  const { data: mensagens = [], isLoading } = useTicketMensagens(ticket.id);
  const enviar = useCreateTicketMensagem();
  const [texto, setTexto] = useState('');
  const prazo = prazoDoChamado(ticket);
  const nome = (id: string | null) => equipe.find((m) => m.id === id)?.full_name ?? 'Alguém da equipe';

  const mudar = async (patch: Partial<Ticket>) => {
    try {
      await update.mutateAsync({ id: ticket.id, ...patch, updated_at: new Date().toISOString() });
    } catch {
      toast.error('Não consegui salvar');
    }
  };

  const mandar = async () => {
    const conteudo = texto.trim();
    if (!conteudo) return;
    try {
      await enviar.mutateAsync({ ticket_id: ticket.id, author_id: member?.id ?? null, content: conteudo });
      setTexto('');
      // Responder um chamado aberto já o coloca em andamento.
      if (ticket.status === 'aberto') await mudar({ status: 'em_andamento' });
    } catch {
      toast.error('Não consegui registrar');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl p-0 overflow-hidden">
        <div className="p-5 border-b border-black/[0.06] dark:border-white/[0.06] space-y-3">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-semibold leading-snug pr-6">{ticket.subject}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-foreground/45">
            {ticket.client ? (
              <button onClick={() => navigate(`/clientes/${ticket.client!.id}`)} className="inline-flex items-center gap-1 hover:text-primary">
                {ticket.client.company_name} <ExternalLink className="h-3 w-3" />
              </button>
            ) : <span>Interno</span>}
            <span>aberto em {quando(ticket.created_at)}</span>
            <span className={cn('inline-flex items-center gap-1', COR_PRAZO[prazo.estado])}><Clock className="h-3 w-3" />{prazo.texto}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="text-[10.5px] text-foreground/40">Situação</span>
              <select
                className={cn(inputCls, 'h-9 text-[12.5px]')}
                value={ticket.status}
                onChange={(e) => {
                  const status = e.target.value as Ticket['status'];
                  mudar({ status, resolved_at: status === 'resolvido' ? new Date().toISOString() : null });
                }}
              >
                {Object.entries(ROTULO_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10.5px] text-foreground/40">Prioridade</span>
              <select className={cn(inputCls, 'h-9 text-[12.5px]')} value={ticket.priority}
                onChange={(e) => mudar({ priority: e.target.value as Ticket['priority'] })}>
                {(['baixa', 'media', 'alta', 'urgente'] as const).map((p) => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10.5px] text-foreground/40">Responsável</span>
              <select className={cn(inputCls, 'h-9 text-[12.5px]')} value={ticket.assigned_to ?? ''}
                onChange={(e) => mudar({ assigned_to: e.target.value || null })}>
                <option value="">Ninguém</option>
                {equipe.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="max-h-[46vh] overflow-y-auto p-5 space-y-3 bg-black/[0.015] dark:bg-white/[0.015]">
          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.07] bg-background p-3">
            <p className="text-[10.5px] text-foreground/40 mb-1">O que o cliente pediu</p>
            <p className="text-[13px] text-foreground/80 whitespace-pre-wrap">{ticket.description || 'Sem descrição.'}</p>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></div>
          ) : mensagens.map((m) => (
            <div key={m.id} className="flex gap-2.5">
              <InitialAvatar name={nome(m.author_id)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-foreground/45"><span className="font-medium text-foreground/70">{nome(m.author_id)}</span> · {quando(m.created_at)}</p>
                <p className="text-[13px] text-foreground/80 whitespace-pre-wrap mt-0.5">{m.content}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-black/[0.06] dark:border-white/[0.06] flex gap-2">
          <textarea
            className={cn(inputCls, 'h-16 py-2 resize-none flex-1')}
            placeholder="Registrar o que foi feito, combinado ou respondido ao cliente…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) mandar(); }}
          />
          <button
            onClick={mandar}
            disabled={!texto.trim() || enviar.isPending}
            className="h-16 w-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40"
            title="Registrar (Ctrl+Enter)"
          >
            {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Filtro = 'abertos' | 'meus' | 'atrasados' | 'todos';

export default function Tickets() {
  const { member } = useAuth();
  const { data: tickets = [], isLoading } = useTickets();
  const { data: equipe = [] } = useTeam();
  const [newOpen, setNewOpen] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('abertos');
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const lista = useMemo(() => {
    const ordenados = ordenarChamados(tickets);
    if (filtro === 'abertos') return ordenados.filter((t) => t.status !== 'resolvido');
    if (filtro === 'meus') return ordenados.filter((t) => t.status !== 'resolvido' && t.assigned_to === member?.id);
    if (filtro === 'atrasados') return ordenados.filter((t) => prazoDoChamado(t).estado === 'estourado');
    return ordenados;
  }, [tickets, filtro, member?.id]);

  const atrasados = tickets.filter((t) => prazoDoChamado(t).estado === 'estourado').length;
  const aberto = tickets.find((t) => t.id === abertoId) ?? null;
  const nome = (id: string | null) => (id ? equipe.find((m) => m.id === id)?.full_name ?? '—' : 'Ninguém');

  const FILTROS: { k: Filtro; rotulo: string }[] = [
    { k: 'abertos', rotulo: 'Abertos' },
    { k: 'meus', rotulo: 'Comigo' },
    { k: 'atrasados', rotulo: atrasados ? `Atrasados (${atrasados})` : 'Atrasados' },
    { k: 'todos', rotulo: 'Todos' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Chamados</h1>
          <p className="text-[12px] text-foreground/40 mt-0.5">O que os clientes pediram, quem está cuidando e o prazo</p>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Chamado
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTROS.map(({ k, rotulo }) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={cn(
              'h-9 px-3 rounded-xl text-[12px] font-medium transition-colors',
              filtro === k
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'border border-black/[0.08] dark:border-white/[0.08] text-foreground/50 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : lista.length === 0 ? (
        <EmptyState icon={<MessageSquare />} title="Nenhum chamado aqui" sub="Tudo em dia com os clientes" />
      ) : (
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {lista.map((t) => {
            const prazo = prazoDoChamado(t);
            return (
              <button
                key={t.id}
                onClick={() => setAbertoId(t.id)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
              >
                <span className={cn('text-[10px] font-bold uppercase tracking-wide shrink-0 w-16', COR_PRIORIDADE[t.priority])}>
                  {ROTULO_PRIORIDADE[t.priority]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{t.subject}</p>
                  <p className="text-[11px] text-foreground/40 truncate">
                    {t.client?.company_name ?? 'Interno'} · {nome(t.assigned_to)}
                  </p>
                </div>
                <span className={cn('hidden sm:inline-flex items-center gap-1 text-[11px] shrink-0', COR_PRAZO[prazo.estado])}>
                  <Clock className="h-3 w-3" /> {prazo.texto}
                </span>
                <span className={cn('text-[10.5px] font-semibold rounded-full px-2 py-0.5 shrink-0', COR_STATUS[t.status])}>
                  {ROTULO_STATUS[t.status]}
                </span>
              </button>
            );
          })}
        </Panel>
      )}

      <NewTicketDialog open={newOpen} onClose={() => setNewOpen(false)} />
      {aberto && <ChamadoDialog ticket={aberto} onClose={() => setAbertoId(null)} />}
    </div>
  );
}
