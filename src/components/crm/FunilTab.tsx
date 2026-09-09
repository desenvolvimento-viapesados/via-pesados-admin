import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy, XCircle, Loader2, Phone, MapPin, CalendarPlus, MonitorPlay, MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useProspects, useCreateProspect, useUpdateProspect, useChannels,
  brl, type Prospect, type ProspectStage,
} from '@/hooks/useAdmin';
import { AgendarReuniaoDialog } from './AgendarReuniaoDialog';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/admin/ui';
import { RegistrarVendaDialog } from './RegistrarVendaDialog';

const PIPELINE: { key: ProspectStage; label: string }[] = [
  { key: 'contato',      label: 'Contato' },
  { key: 'oportunidade', label: 'Oportunidade' },
  { key: 'reuniao',      label: 'Reunião' },
  { key: 'vendido',      label: 'Vendido' },
];

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

/* ── Novo prospect ──────────────────────────────────────────── */
function NewProspectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { member } = useAuth();
  const create = useCreateProspect();
  const { data: canais = [] } = useChannels();
  const [form, setForm] = useState({
    company_name: '', contact_name: '', whatsapp: '', email: '',
    city: '', state: '', channel_id: '', source: '', proposal_value: '', plan: '', notes: '',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.company_name.trim()) { toast.error('Informe o nome da empresa'); return; }
    // Canal é obrigatório na entrada, não depois: preenchido de memória semanas
    // adiante ele deixa de ser dado e vira chute — e é a base de todo o
    // relatório de aquisição.
    if (!form.channel_id) { toast.error('Escolha por onde este prospect chegou'); return; }
    try {
      await create.mutateAsync({
        company_name: form.company_name.trim(),
        contact_name: form.contact_name || null,
        whatsapp: form.whatsapp || null,
        email: form.email || null,
        city: form.city || null,
        state: form.state || null,
        channel_id: form.channel_id,
        source: form.source || null,
        proposal_value: form.proposal_value ? Number(form.proposal_value) : null,
        plan: form.plan || null,
        notes: form.notes || null,
        owner_id: member?.id ?? null,
      });
      toast.success('Prospect criado');
      setForm({ company_name: '', contact_name: '', whatsapp: '', email: '', city: '', state: '', channel_id: '', source: '', proposal_value: '', plan: '', notes: '' });
      onClose();
    } catch {
      toast.error('Erro ao criar prospect');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Novo prospect</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <input className={inputCls} placeholder="Nome da empresa *" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="Contato" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
            <input className={inputCls} placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
          </div>
          <input className={inputCls} placeholder="E-mail" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <div className="grid grid-cols-[1fr_80px] gap-2.5">
            <input className={inputCls} placeholder="Cidade" value={form.city} onChange={(e) => set('city', e.target.value)} />
            <input className={inputCls} placeholder="UF" maxLength={2} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} />
          </div>
          <select className={inputCls} value={form.channel_id} onChange={(e) => set('channel_id', e.target.value)}>
            <option value="">Por onde chegou? *</option>
            {canais.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="Mensalidade (R$)" type="number" value={form.proposal_value} onChange={(e) => set('proposal_value', e.target.value)} />
            <input className={inputCls} placeholder="Detalhe: campanha, quem indicou…" value={form.source} onChange={(e) => set('source', e.target.value)} />
          </div>
          <textarea className={cn(inputCls, 'h-20 py-2 resize-none')} placeholder="Observações" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar prospect
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Aba ────────────────────────────────────────────────────── */
export function FunilTab({ newOpen, onCloseNew }: { newOpen: boolean; onCloseNew: () => void }) {
  const navigate = useNavigate();
  const { data: prospects = [], isLoading } = useProspects();
  const update = useUpdateProspect();
  const [saleFor, setSaleFor] = useState<Prospect | null>(null);
  const [reuniaoPara, setReuniaoPara] = useState<Prospect | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map: Record<string, Prospect[]> = {};
    PIPELINE.forEach(({ key }) => { map[key] = []; });
    prospects.forEach((p) => { if (map[p.stage]) map[p.stage].push(p); });
    return map;
  }, [prospects]);

  const handleDrop = async (stage: ProspectStage) => {
    if (!dragId) return;
    const p = prospects.find((x) => x.id === dragId);
    setDragId(null);
    if (!p || p.stage === stage) return;

    // Vendido não é um card arrastado para uma coluna: é a venda acontecendo.
    // Abre o registro (mensalidade, contrato, canais, domínio) e o próprio
    // fluxo grava o estágio no fim. Mover sem isso deixaria um "vendido" sem
    // cliente provisionado, que é o estado que ninguém consegue explicar
    // depois.
    if (stage === 'vendido') {
      setSaleFor(p);
      return;
    }

    // Reunião sem horário marcado é um card que mente: a coluna existe para
    // mostrar o que está agendado. O diálogo cria a reunião e só então move.
    if (stage === 'reuniao') {
      setReuniaoPara(p);
      return;
    }

    try {
      await update.mutateAsync({ id: p.id, stage });
    } catch {
      toast.error('Erro ao mover');
    }
  };

  const daysIn = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {PIPELINE.map(({ key, label }) => {
            const items = byStage[key] ?? [];
            const total = items.reduce((s, p) => s + (p.proposal_value ?? 0), 0);
            return (
              <div
                key={key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(key)}
                className="w-[270px] flex flex-col rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.05] dark:border-white/[0.05]"
              >
                <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-semibold text-foreground">{label}</p>
                    <span className="text-[10.5px] text-foreground/35 font-medium bg-black/[0.05] dark:bg-white/[0.06] rounded-full px-1.5 py-0.5">
                      {items.length}
                    </span>
                  </div>
                  {total > 0 && <p className="text-[10.5px] text-foreground/40 tabular-nums">{brl(total)}/mês</p>}
                </div>

                <div className="flex-1 px-2 pb-2 space-y-1.5 overflow-y-auto min-h-[120px]">
                  {items.map((p) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => navigate(`/crm/prospect/${p.id}`)}
                      className={cn(
                        'rounded-xl border border-black/[0.07] dark:border-white/[0.08] bg-background p-3 cursor-pointer',
                        'hover:border-primary/40 hover:shadow-md transition-all',
                        dragId === p.id && 'opacity-40',
                      )}
                    >
                      <p className="text-[12.5px] font-semibold text-foreground leading-tight">{p.company_name}</p>
                      {p.contact_name && <p className="text-[11px] text-foreground/45 mt-0.5">{p.contact_name}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[11.5px] font-semibold text-primary tabular-nums">
                          {p.proposal_value ? `${brl(p.proposal_value)}/mês` : '—'}
                        </p>
                        <p className="text-[10px] text-foreground/30">{daysIn(p.updated_at)}d</p>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="flex items-center justify-center h-24 text-[11px] text-foreground/20">
                      Arraste para cá
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <NewProspectDialog open={newOpen} onClose={onCloseNew} />
      <RegistrarVendaDialog open={!!saleFor} prospect={saleFor} onClose={() => setSaleFor(null)} />
      {reuniaoPara && (
        <AgendarReuniaoDialog
          prospect={reuniaoPara}
          moverParaReuniao
          onClose={() => setReuniaoPara(null)}
        />
      )}
    </>
  );
}
