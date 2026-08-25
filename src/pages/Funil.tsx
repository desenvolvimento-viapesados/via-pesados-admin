import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trophy, XCircle, Loader2, Phone, MapPin,
  CalendarPlus, MonitorPlay, MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import {
  useProspects, useCreateProspect, useUpdateProspect, useWinProspect,
  brl, type Prospect, type ProspectStage,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/admin/ui';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';

const PIPELINE: { key: ProspectStage; label: string }[] = [
  { key: 'novo',       label: 'Novos' },
  { key: 'contato',    label: 'Em contato' },
  { key: 'reuniao',    label: 'Reunião' },
  { key: 'proposta',   label: 'Proposta' },
  { key: 'fechamento', label: 'Fechamento' },
];

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

/* ── Dialog: novo prospect ──────────────────────────────────── */
function NewProspectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { member } = useAuth();
  const create = useCreateProspect();
  const [form, setForm] = useState({
    company_name: '', contact_name: '', whatsapp: '', email: '',
    city: '', state: '', source: '', proposal_value: '', plan: '', notes: '',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.company_name.trim()) { toast.error('Informe o nome da empresa'); return; }
    try {
      await create.mutateAsync({
        company_name: form.company_name.trim(),
        contact_name: form.contact_name || null,
        whatsapp: form.whatsapp || null,
        email: form.email || null,
        city: form.city || null,
        state: form.state || null,
        source: form.source || null,
        proposal_value: form.proposal_value ? Number(form.proposal_value) : null,
        plan: form.plan || null,
        notes: form.notes || null,
        owner_id: member?.id ?? null,
      });
      toast.success('Prospect criado');
      setForm({ company_name: '', contact_name: '', whatsapp: '', email: '', city: '', state: '', source: '', proposal_value: '', plan: '', notes: '' });
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
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="Mensalidade (R$)" type="number" value={form.proposal_value} onChange={(e) => set('proposal_value', e.target.value)} />
            <input className={inputCls} placeholder="Origem (indicação...)" value={form.source} onChange={(e) => set('source', e.target.value)} />
          </div>
          <textarea
            className={cn(inputCls, 'h-20 py-2 resize-none')}
            placeholder="Observações"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
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

/* ── Dialog: detalhe do prospect ────────────────────────────── */
function ProspectDialog({
  prospect, onClose,
}: {
  prospect: Prospect | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const update = useUpdateProspect();
  const win = useWinProspect();
  const [lostMode, setLostMode] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(prospect?.proposal_value?.toString() ?? '');
    setLostMode(false);
    setLostReason('');
  }, [prospect?.id]);

  if (!prospect) return null;

  const saveValue = async () => {
    const num = value ? Number(value) : null;
    if (num === prospect.proposal_value) return;
    await update.mutateAsync({ id: prospect.id, proposal_value: num });
    toast.success('Valor atualizado');
  };

  const handleWin = async () => {
    try {
      const client = await win.mutateAsync(prospect);
      toast.success('Venda fechada! Cliente criado.');
      onClose();
      navigate(`/clientes/${client.id}`);
    } catch {
      toast.error('Erro ao fechar venda');
    }
  };

  const handleLose = async () => {
    try {
      await update.mutateAsync({ id: prospect.id, stage: 'perdido', lost_reason: lostReason || null });
      toast.success('Prospect marcado como perdido');
      onClose();
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2.5">
            {prospect.company_name}
            <StatusBadge status={prospect.stage} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Infos */}
          <div className="space-y-1.5 text-[12.5px] text-foreground/60">
            {prospect.contact_name && <p>Contato: <span className="text-foreground">{prospect.contact_name}</span></p>}
            {prospect.whatsapp && (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> {prospect.whatsapp}
                <a
                  href={`https://wa.me/55${prospect.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-500 hover:underline flex items-center gap-1"
                >
                  <MessageCircle className="h-3 w-3" /> abrir
                </a>
              </p>
            )}
            {(prospect.city || prospect.state) && (
              <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {[prospect.city, prospect.state].filter(Boolean).join(' / ')}</p>
            )}
            {prospect.source && <p>Origem: <span className="text-foreground">{prospect.source}</span></p>}
            {prospect.notes && <p className="text-foreground/50 border-l-2 border-primary/30 pl-2 mt-2">{prospect.notes}</p>}
          </div>

          {/* Valor */}
          <div className="flex items-center gap-2">
            <input
              className={inputCls}
              type="number"
              placeholder="Mensalidade proposta (R$)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={saveValue}
            />
          </div>

          {/* Atalhos */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { onClose(); navigate(`/reunioes?new=1&prospect=${prospect.id}`); }}
              className="h-9 rounded-xl border border-blue-400/25 bg-blue-400/[0.06] text-blue-400 text-[12px] font-medium hover:bg-blue-400/[0.12] transition-colors flex items-center justify-center gap-1.5"
            >
              <CalendarPlus className="h-3.5 w-3.5" /> Agendar reunião
            </button>
            <button
              onClick={() => { onClose(); navigate(`/amostras?new=1&prospect=${prospect.id}`); }}
              className="h-9 rounded-xl border border-violet-400/25 bg-violet-400/[0.06] text-violet-400 text-[12px] font-medium hover:bg-violet-400/[0.12] transition-colors flex items-center justify-center gap-1.5"
            >
              <MonitorPlay className="h-3.5 w-3.5" /> Criar amostra
            </button>
          </div>

          {/* Ganhar / Perder */}
          {lostMode ? (
            <div className="space-y-2">
              <input
                className={inputCls}
                placeholder="Motivo da perda"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setLostMode(false)} className="h-9 rounded-xl border border-black/[0.1] dark:border-white/[0.1] text-[12px] text-foreground/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                  Voltar
                </button>
                <button onClick={handleLose} className="h-9 rounded-xl bg-red-500/15 text-red-400 text-[12px] font-semibold hover:bg-red-500/25 transition-colors">
                  Confirmar perda
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-black/[0.06] dark:border-white/[0.06]">
              <button
                onClick={() => setLostMode(true)}
                className="h-10 rounded-xl border border-red-400/20 text-red-400/80 text-[12.5px] font-medium hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1.5 mt-2"
              >
                <XCircle className="h-3.5 w-3.5" /> Perdido
              </button>
              <button
                onClick={handleWin}
                disabled={win.isPending}
                className="h-10 rounded-xl bg-emerald-500 text-white text-[12.5px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5 mt-2"
              >
                {win.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trophy className="h-3.5 w-3.5" />}
                Venda fechada
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Funil ──────────────────────────────────────────────────── */
export default function Funil() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [params, setParams] = useSearchParams();
  const { data: prospects = [], isLoading } = useProspects();
  const update = useUpdateProspect();

  const [newOpen, setNewOpen] = useState(params.get('new') === '1');
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (params.get('new') === '1') {
      setNewOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, []);

  const byStage = useMemo(() => {
    const map: Record<string, Prospect[]> = {};
    PIPELINE.forEach(({ key }) => { map[key] = []; });
    prospects.forEach((p) => { if (map[p.stage]) map[p.stage].push(p); });
    return map;
  }, [prospects]);

  const wonCount = prospects.filter((p) => p.stage === 'ganho').length;
  const lostCount = prospects.filter((p) => p.stage === 'perdido').length;

  const handleDrop = async (stage: ProspectStage) => {
    if (!dragId) return;
    const p = prospects.find((x) => x.id === dragId);
    setDragId(null);
    if (!p || p.stage === stage) return;
    try {
      await update.mutateAsync({ id: p.id, stage });
    } catch {
      toast.error('Erro ao mover');
    }
  };

  const daysIn = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <div className="relative w-full flex h-20 items-center px-4 sm:px-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-[13px] text-foreground/40 hover:text-foreground transition-colors group z-10"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Início</span>
          </button>

          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none">
            <img
              src={theme === 'dark' ? viaPesadosLogoDark : viaPesadosLogoLight}
              alt="Via Pesados"
              className="h-20 w-auto object-contain"
            />
          </div>

          <div className="ml-auto flex items-center gap-3 z-10">
            <span className="text-[11px] text-foreground/35 hidden sm:flex items-center gap-2">
              <span className="text-emerald-500 font-semibold">{wonCount} ganhos</span>·
              <span className="text-red-400/80 font-semibold">{lostCount} perdidos</span>
            </span>
            <button
              onClick={() => setNewOpen(true)}
              className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Prospect
            </button>
          </div>
        </div>
      </header>

      {/* Kanban */}
      <main className="flex-1 overflow-x-auto px-4 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : (
          <div className="flex gap-3 min-w-max h-full pb-4">
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
                  {/* Column header */}
                  <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] font-semibold text-foreground">{label}</p>
                      <span className="text-[10.5px] text-foreground/35 font-medium bg-black/[0.05] dark:bg-white/[0.06] rounded-full px-1.5 py-0.5">
                        {items.length}
                      </span>
                    </div>
                    {total > 0 && <p className="text-[10.5px] text-foreground/40 tabular-nums">{brl(total)}/mês</p>}
                  </div>

                  {/* Cards */}
                  <div className="flex-1 px-2 pb-2 space-y-1.5 overflow-y-auto min-h-[120px]">
                    {items.map((p) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={() => setDragId(p.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setSelected(p)}
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
        )}
      </main>

      <NewProspectDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <ProspectDialog prospect={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
