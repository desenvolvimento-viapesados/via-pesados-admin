import { useState } from 'react';
import { Plus, Loader2, UserCheck, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useTeam, useUpdateTeamMember, inviteTeamMember, type TeamMemberRow,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, Panel, InitialAvatar } from '@/components/admin/ui';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  suporte: 'Suporte',
  financeiro: 'Financeiro',
};

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'vendedor' });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.full_name.trim() || !form.email.trim() || form.password.length < 6) {
      toast.error('Preencha nome, e-mail e senha (mín. 6 caracteres)');
      return;
    }
    setLoading(true);
    try {
      await inviteTeamMember(form);
      toast.success(`${form.full_name} adicionado à equipe`);
      setForm({ full_name: '', email: '', password: '', role: 'vendedor' });
      onClose();
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao adicionar membro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Adicionar membro</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <input className={inputCls} placeholder="Nome completo *" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          <input className={inputCls} type="email" placeholder="E-mail *" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <input className={inputCls} type="password" placeholder="Senha provisória *" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <select className={inputCls} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button
            onClick={submit}
            disabled={loading}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Adicionar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Equipe() {
  const { member: me, isAdmin } = useAuth();
  const { data: team = [], isLoading } = useTeam();
  const update = useUpdateTeamMember();
  const [inviteOpen, setInviteOpen] = useState(false);

  const setRole = async (m: TeamMemberRow, role: TeamMemberRow['role']) => {
    if (!isAdmin) { toast.error('Apenas administradores'); return; }
    try {
      await update.mutateAsync({ id: m.id, role });
      toast.success('Papel atualizado');
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const toggleActive = async (m: TeamMemberRow) => {
    if (!isAdmin) { toast.error('Apenas administradores'); return; }
    if (m.id === me?.id) { toast.error('Você não pode desativar a si mesmo'); return; }
    try {
      await update.mutateAsync({ id: m.id, is_active: !m.is_active });
      toast.success(m.is_active ? 'Acesso desativado' : 'Acesso reativado');
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Equipe</h1>
          <p className="text-[12px] text-foreground/40 mt-0.5">Membros e acessos ao painel da empresa</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setInviteOpen(true)}
            className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Membro
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : team.length === 0 ? (
        <EmptyState icon={<UserCheck />} title="Nenhum membro" />
      ) : (
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {team.map((m) => (
            <div key={m.id} className={cn('px-4 py-3 flex items-center gap-3', !m.is_active && 'opacity-45')}>
              <InitialAvatar name={m.full_name} src={m.avatar_url} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-semibold text-foreground truncate">{m.full_name}</p>
                  {m.role === 'admin' && <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
                  {m.id === me?.id && <span className="text-[10px] text-foreground/35">(você)</span>}
                </div>
                <p className="text-[11px] text-foreground/40 truncate">{m.email}</p>
              </div>

              {isAdmin ? (
                <>
                  <select
                    value={m.role}
                    onChange={(e) => setRole(m, e.target.value as TeamMemberRow['role'])}
                    className="h-8 px-2 rounded-lg bg-background border border-black/[0.1] dark:border-white/[0.1] text-[11.5px] text-foreground"
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button
                    onClick={() => toggleActive(m)}
                    className={cn(
                      'h-8 px-2.5 rounded-lg text-[11.5px] font-medium transition-colors shrink-0',
                      m.is_active
                        ? 'text-foreground/40 hover:text-red-400 hover:bg-red-500/10'
                        : 'text-emerald-500 hover:bg-emerald-500/10',
                    )}
                  >
                    {m.is_active ? 'Desativar' : 'Reativar'}
                  </button>
                </>
              ) : (
                <span className="text-[11.5px] text-foreground/50">{ROLE_LABELS[m.role]}</span>
              )}
            </div>
          ))}
        </Panel>
      )}

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
