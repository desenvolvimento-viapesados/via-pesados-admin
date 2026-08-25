import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CalendarDays, Video, Check, X, MonitorPlay, CalendarPlus, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useMeetings, useCreateMeeting, useUpdateMeeting, useProspects, useDemos,
  useAdvanceProspect, type Meeting,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SectionHeader, StatusBadge, EmptyState, Panel } from '@/components/admin/ui';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const KIND_LABELS: Record<string, string> = {
  descoberta: 'Descoberta',
  demo: 'Demonstração',
  proposta: 'Proposta',
  fechamento: 'Fechamento',
  onboarding: 'Onboarding',
  outro: 'Outro',
};

function NewMeetingDialog({
  open, onClose, defaultProspectId,
}: {
  open: boolean;
  onClose: () => void;
  defaultProspectId?: string | null;
}) {
  const { member } = useAuth();
  const create = useCreateMeeting();
  const advance = useAdvanceProspect();
  const { data: prospects = [] } = useProspects();
  const { data: demos = [] } = useDemos();

  const [form, setForm] = useState({
    prospect_id: defaultProspectId ?? '',
    demo_id: '', title: '', date: '', time: '', kind: 'demo', meet_link: '', notes: '',
  });

  useEffect(() => {
    if (defaultProspectId) setForm((f) => ({ ...f, prospect_id: defaultProspectId }));
  }, [defaultProspectId]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const activeProspects = prospects.filter((p) => !['ganho', 'perdido'].includes(p.stage));
  const availableDemos = demos.filter((d) => !form.prospect_id || d.prospect_id === form.prospect_id || !d.prospect_id);

  const submit = async () => {
    if (!form.date || !form.time) { toast.error('Informe data e horário'); return; }
    const prospect = prospects.find((p) => p.id === form.prospect_id);
    const title = form.title.trim() || (prospect ? `${KIND_LABELS[form.kind]} — ${prospect.company_name}` : KIND_LABELS[form.kind]);
    try {
      await create.mutateAsync({
        prospect_id: form.prospect_id || null,
        demo_id: form.demo_id || null,
        title,
        scheduled_at: new Date(`${form.date}T${form.time}`).toISOString(),
        kind: form.kind as Meeting['kind'],
        meet_link: form.meet_link || null,
        notes: form.notes || null,
        owner_id: member?.id ?? null,
      });
      if (prospect) {
        await advance.mutateAsync({ id: prospect.id, from: prospect.stage, to: 'reuniao' });
      }
      toast.success('Reunião agendada');
      setForm({ prospect_id: '', demo_id: '', title: '', date: '', time: '', kind: 'demo', meet_link: '', notes: '' });
      onClose();
    } catch {
      toast.error('Erro ao agendar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Nova reunião</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <select className={inputCls} value={form.prospect_id} onChange={(e) => set('prospect_id', e.target.value)}>
            <option value="">Selecionar prospect…</option>
            {activeProspects.map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            <input className={inputCls} type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </div>

          <select className={inputCls} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          {(form.kind === 'demo' || availableDemos.length > 0) && (
            <select className={inputCls} value={form.demo_id} onChange={(e) => set('demo_id', e.target.value)}>
              <option value="">Vincular amostra (opcional)…</option>
              {availableDemos.map((d) => <option key={d.id} value={d.id}>{d.company_name} ({d.status})</option>)}
            </select>
          )}

          <input className={inputCls} placeholder="Link da chamada (Meet, Zoom…)" value={form.meet_link} onChange={(e) => set('meet_link', e.target.value)} />
          <input className={inputCls} placeholder="Título (opcional — gerado automático)" value={form.title} onChange={(e) => set('title', e.target.value)} />
          <textarea className={cn(inputCls, 'h-16 py-2 resize-none')} placeholder="Pauta / observações" value={form.notes} onChange={(e) => set('notes', e.target.value)} />

          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Agendar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetingRow({
  meeting, onOpenDemo, demoUrl,
}: {
  meeting: Meeting;
  onOpenDemo: () => void;
  demoUrl?: string | null;
}) {
  const update = useUpdateMeeting();

  const d = new Date(meeting.scheduled_at);
  const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const setStatus = async (status: Meeting['status']) => {
    try {
      await update.mutateAsync({ id: meeting.id, status });
      toast.success(status === 'realizada' ? 'Reunião concluída' : 'Reunião cancelada');
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
      <div className="text-center shrink-0 w-14">
        <p className="text-[11px] text-foreground/40 leading-none">{dateStr}</p>
        <p className="text-[15px] font-bold text-foreground tabular-nums leading-tight mt-0.5">{timeStr}</p>
      </div>

      <div className="w-px self-stretch bg-black/[0.06] dark:bg-white/[0.06]" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-foreground truncate">{meeting.title}</p>
          <StatusBadge status={meeting.status} />
        </div>
        <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-foreground/40">
          <span>{KIND_LABELS[meeting.kind]}</span>
          {meeting.prospect && <span>· {meeting.prospect.company_name}</span>}
          {meeting.demo && (
            demoUrl ? (
              <a
                href={demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir a amostra deste cliente"
                className="flex items-center gap-1 text-violet-400 hover:underline"
              >
                <MonitorPlay className="h-3 w-3" /> Amostra pronta <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : (
              <button onClick={onOpenDemo} className="flex items-center gap-1 text-violet-400 hover:underline">
                <MonitorPlay className="h-3 w-3" /> {meeting.demo.company_name}
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {meeting.meet_link && (
          <a
            href={meeting.meet_link}
            target="_blank"
            rel="noopener noreferrer"
            title="Entrar na chamada"
            className="h-8 px-2.5 rounded-lg bg-blue-500/10 text-blue-400 text-[11.5px] font-medium hover:bg-blue-500/20 transition-colors flex items-center gap-1.5"
          >
            <Video className="h-3.5 w-3.5" /> Entrar
          </a>
        )}
        {meeting.status === 'agendada' && (
          <>
            <button
              onClick={() => setStatus('realizada')}
              title="Marcar como realizada"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setStatus('cancelada')}
              title="Cancelar"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ReunioesTab({
  newOpen, onCloseNew, defaultProspectId,
}: {
  newOpen: boolean;
  onCloseNew: () => void;
  defaultProspectId?: string | null;
}) {
  const navigate = useNavigate();
  const { data: meetings = [], isLoading } = useMeetings();
  const { data: prospects = [] } = useProspects();
  const { data: demos = [] } = useDemos();
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  const demoUrlById = useMemo(() => {
    const map: Record<string, string | null> = {};
    demos.forEach((d) => { map[d.id] = d.demo_url; });
    return map;
  }, [demos]);

  /** Chegou na etapa Reunião e ainda não tem horário marcado. */
  const pending = useMemo(() => {
    const withMeeting = new Set(
      meetings
        .filter((m) => m.status === 'agendada' || m.status === 'realizada')
        .map((m) => m.prospect_id)
        .filter(Boolean) as string[],
    );
    return prospects.filter((p) => p.stage === 'reuniao' && !withMeeting.has(p.id));
  }, [prospects, meetings]);

  const groups = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

    const today: Meeting[] = [];
    const upcoming: Meeting[] = [];
    const past: Meeting[] = [];

    meetings.forEach((m) => {
      const d = new Date(m.scheduled_at);
      if (d >= startOfDay && d < endOfDay) today.push(m);
      else if (d >= endOfDay) upcoming.push(m);
      else past.push(m);
    });
    past.reverse();
    return { today, upcoming, past: past.slice(0, 20) };
  }, [meetings]);

  const openDemos = () => navigate('/crm?tab=amostras');
  const rowProps = (m: Meeting) => ({
    meeting: m,
    onOpenDemo: openDemos,
    demoUrl: m.demo_id ? demoUrlById[m.demo_id] : null,
  });

  const closeDialog = () => { setScheduleFor(null); onCloseNew(); };

  return (
    <div className="flex flex-col gap-7">
      {/* Fila: quem entrou na etapa e falta marcar */}
      {pending.length > 0 && (
        <div>
          <SectionHeader title={`Aguardando agendamento · ${pending.length}`} />
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden border-primary/25">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="h-8 w-8 rounded-full bg-primary/15 text-primary text-[12px] font-bold flex items-center justify-center shrink-0">
                  {p.company_name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate">{p.company_name}</p>
                  <p className="text-[11px] text-foreground/40 truncate">
                    {p.contact_name ? `${p.contact_name} · ` : ''}entrou na etapa Reunião
                  </p>
                </div>
                <button
                  onClick={() => setScheduleFor(p.id)}
                  className="h-8 px-3 rounded-lg bg-primary/10 text-primary text-[11.5px] font-semibold hover:bg-primary/20 transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <CalendarPlus className="h-3.5 w-3.5" /> Agendar
                </button>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : meetings.length === 0 && pending.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="Nenhuma reunião agendada"
          sub="Mova um prospect para a etapa Reunião no funil — ele aparece aqui"
        />
      ) : (
        <>
          {groups.today.length > 0 && (
            <div>
              <SectionHeader title={`Hoje · ${groups.today.length}`} />
              <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
                {groups.today.map((m) => <MeetingRow key={m.id} {...rowProps(m)} />)}
              </Panel>
            </div>
          )}

          {groups.upcoming.length > 0 && (
            <div>
              <SectionHeader title="Próximas" />
              <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
                {groups.upcoming.map((m) => <MeetingRow key={m.id} {...rowProps(m)} />)}
              </Panel>
            </div>
          )}

          {groups.past.length > 0 && (
            <div>
              <SectionHeader title="Anteriores" />
              <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden opacity-70">
                {groups.past.map((m) => <MeetingRow key={m.id} {...rowProps(m)} />)}
              </Panel>
            </div>
          )}
        </>
      )}

      <NewMeetingDialog
        open={newOpen || !!scheduleFor}
        onClose={closeDialog}
        defaultProspectId={scheduleFor ?? defaultProspectId}
      />
    </div>
  );
}
