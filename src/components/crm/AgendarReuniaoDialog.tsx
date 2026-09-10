import { useState, useEffect } from 'react';
import { Loader2, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCreateMeeting, useUpdateProspect, type Prospect } from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, FUNCTIONS_URL } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const TIPOS: Record<string, string> = {
  descoberta: 'Descoberta',
  demo: 'Demonstração',
  proposta: 'Proposta',
  fechamento: 'Fechamento',
  onboarding: 'Onboarding',
  outro: 'Outro',
};

/** Arredonda para a próxima meia hora — ninguém marca reunião às 14h07. */
function proximaMeiaHora() {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30);
  // datetime-local quer horário LOCAL sem fuso; toISOString devolve UTC e
  // adiantaria o campo em três horas.
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Agenda a reunião de um prospect.
 *
 * `moverParaReuniao` é o caso do arrasto no funil: a etapa só muda depois
 * que a reunião existe. Sem isso a coluna Reunião encheria de prospect sem
 * horário marcado, que é justamente o que ela deveria estar mostrando.
 */
export function AgendarReuniaoDialog({
  prospect, moverParaReuniao = false, onClose, onAgendada,
}: {
  prospect: Prospect | null;
  moverParaReuniao?: boolean;
  onClose: () => void;
  onAgendada?: () => void;
}) {
  const { member } = useAuth();
  const criar = useCreateMeeting();
  const atualizar = useUpdateProspect();
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    scheduled_at: proximaMeiaHora(),
    duration_min: '45',
    kind: 'descoberta',
    meet_link: '',
    notes: '',
  });

  useEffect(() => {
    if (prospect) {
      setForm({
        scheduled_at: proximaMeiaHora(),
        duration_min: '45',
        kind: 'descoberta',
        meet_link: '',
        notes: '',
      });
    }
  }, [prospect?.id]);

  if (!prospect) return null;

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.scheduled_at) { toast.error('Informe a data e a hora'); return; }
    const quando = new Date(form.scheduled_at);
    if (Number.isNaN(quando.getTime())) { toast.error('Data inválida'); return; }

    setSalvando(true);
    try {
      const reuniao = await criar.mutateAsync({
        prospect_id: prospect.id,
        title: `${TIPOS[form.kind]} — ${prospect.company_name}`,
        scheduled_at: quando.toISOString(),
        duration_min: Number(form.duration_min) || 45,
        kind: form.kind as never,
        status: 'agendada',
        meet_link: form.meet_link.trim() || null,
        notes: form.notes.trim() || null,
        owner_id: member?.id ?? null,
      });

      // A etapa muda DEPOIS da reunião existir. Se a criação falhar, o card
      // fica onde estava em vez de virar um "em reunião" sem reunião.
      if (moverParaReuniao && prospect.stage !== 'reuniao') {
        await atualizar.mutateAsync({ id: prospect.id, stage: 'reuniao' });
      }

      /* Confirmação no WhatsApp do prospecto. Fora do try principal de
         propósito: reunião agendada e mensagem enviada são coisas
         diferentes, e uma falha no aviso não pode desfazer o agendamento
         nem assustar quem já marcou. Se não sair, o servidor registra o
         motivo em wa_envios. */
      const meetingId = (reuniao as { id?: string } | undefined)?.id;
      if (meetingId) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          await fetch(`${FUNCTIONS_URL}/reuniao-avisos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token ?? ''}`,
            },
            body: JSON.stringify({ acao: 'confirmada', meeting_id: meetingId }),
          });
        } catch {
          // silencioso: o agendamento é o que importa nesta tela
        }
      }

      toast.success(
        `Reunião marcada para ${quando.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
      );
      onAgendada?.();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao agendar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-blue-400" />
            Agendar reunião
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 pt-1">
          <p className="text-[12.5px] text-foreground/50">
            Com <span className="text-foreground font-medium">{prospect.company_name}</span>
            {prospect.contact_name && <span className="text-foreground/60"> · {prospect.contact_name}</span>}
          </p>

          <div className="grid grid-cols-[1fr_92px] gap-2.5">
            <input
              className={inputCls}
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => set('scheduled_at', e.target.value)}
            />
            <input
              className={inputCls}
              type="number"
              min={15}
              step={15}
              placeholder="min"
              value={form.duration_min}
              onChange={(e) => set('duration_min', e.target.value)}
            />
          </div>

          <select className={inputCls} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <input
            className={inputCls}
            placeholder="Link da chamada (opcional)"
            value={form.meet_link}
            onChange={(e) => set('meet_link', e.target.value)}
          />

          <textarea
            className={cn(inputCls, 'h-16 py-2 resize-none')}
            placeholder="Pauta ou observações"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />

          <button
            onClick={submit}
            disabled={salvando}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {moverParaReuniao ? 'Agendar e mover para Reunião' : 'Agendar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
