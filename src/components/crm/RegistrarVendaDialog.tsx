import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRegisterSale, brlFull, type Prospect } from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const empty = {
  company_name: '', legal_name: '', cnpj: '', address: '',
  legal_rep_name: '', legal_rep_cpf: '',
  contact_name: '', whatsapp: '', email: '', city: '', state: '',
  plan: '', mrr: '', recurrence: 'mensal',
};

/**
 * Fecha a venda: coleta o que o contrato exige, cria o cliente,
 * emite o contrato em rascunho e abre a central de conexão.
 */
export function RegistrarVendaDialog({
  open, onClose, prospect,
}: {
  open: boolean;
  onClose: () => void;
  prospect?: Prospect | null;
}) {
  const { member } = useAuth();
  const navigate = useNavigate();
  const register = useRegisterSale();
  const [form, setForm] = useState(empty);

  // pré-preenche com o que já sabemos do prospect
  useEffect(() => {
    if (!open) return;
    setForm({
      ...empty,
      company_name: prospect?.company_name ?? '',
      contact_name: prospect?.contact_name ?? '',
      whatsapp: prospect?.whatsapp ?? '',
      email: prospect?.email ?? '',
      city: prospect?.city ?? '',
      state: prospect?.state ?? '',
      plan: prospect?.plan ?? '',
      mrr: prospect?.proposal_value?.toString() ?? '',
    });
  }, [open, prospect?.id]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.company_name.trim()) { toast.error('Informe o nome da empresa'); return; }
    try {
      const client = await register.mutateAsync({
        prospectId: prospect?.id ?? null,
        input: {
          company_name: form.company_name.trim(),
          legal_name: form.legal_name || null,
          cnpj: form.cnpj || null,
          address: form.address || null,
          legal_rep_name: form.legal_rep_name || null,
          legal_rep_cpf: form.legal_rep_cpf || null,
          contact_name: form.contact_name || null,
          whatsapp: form.whatsapp || null,
          email: form.email || null,
          city: form.city || null,
          state: form.state || null,
          plan: form.plan || null,
          mrr: form.mrr ? Number(form.mrr) : 0,
          recurrence: form.recurrence as 'mensal' | 'anual' | 'unico',
          owner_id: member?.id ?? null,
        },
      });
      toast.success('Venda registrada — contrato emitido em rascunho');
      onClose();
      navigate(`/clientes/${client.id}`);
    } catch {
      toast.error('Erro ao registrar venda');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Registrar venda</DialogTitle>
        </DialogHeader>
        <p className="text-[11.5px] text-foreground/40 -mt-1">
          Emite o contrato e abre a configuração do sistema do cliente.
        </p>

        <div className="space-y-4 pt-1">
          {/* Empresa */}
          <div className="space-y-2.5">
            <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30">Empresa</p>
            <input className={inputCls} placeholder="Nome da empresa *" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
            <div className="grid grid-cols-2 gap-2.5">
              <input className={inputCls} placeholder="Contato" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
              <input className={inputCls} placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
            </div>
            <input className={inputCls} placeholder="E-mail" value={form.email} onChange={(e) => set('email', e.target.value)} />
            <div className="grid grid-cols-[1fr_70px] gap-2.5">
              <input className={inputCls} placeholder="Cidade" value={form.city} onChange={(e) => set('city', e.target.value)} />
              <input className={inputCls} placeholder="UF" maxLength={2} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} />
            </div>
          </div>

          {/* Contrato */}
          <div className="space-y-2.5 pt-3 border-t border-black/[0.06] dark:border-white/[0.06]">
            <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30 flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> Dados do contrato
            </p>
            <input className={inputCls} placeholder="Razão social" value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} />
            <input className={inputCls} placeholder="CNPJ" value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} />
            <input className={inputCls} placeholder="Endereço completo" value={form.address} onChange={(e) => set('address', e.target.value)} />
            <div className="grid grid-cols-2 gap-2.5">
              <input className={inputCls} placeholder="Representante legal" value={form.legal_rep_name} onChange={(e) => set('legal_rep_name', e.target.value)} />
              <input className={inputCls} placeholder="CPF do representante" value={form.legal_rep_cpf} onChange={(e) => set('legal_rep_cpf', e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <input className={inputCls} placeholder="Plano" value={form.plan} onChange={(e) => set('plan', e.target.value)} />
              <input className={inputCls} type="number" placeholder="Valor do contrato (R$)" value={form.mrr} onChange={(e) => set('mrr', e.target.value)} />
              <select className={inputCls} value={form.recurrence} onChange={(e) => set('recurrence', e.target.value)}>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
                <option value="unico">Único</option>
              </select>
            </div>
            {form.mrr && form.recurrence !== 'mensal' && (
              <p className="text-[11px] text-foreground/40 px-1">
                {form.recurrence === 'anual'
                  ? `Contrato de ${brlFull(Number(form.mrr))} por ano — entra como ${brlFull(Math.round(Number(form.mrr) / 12))} de MRR.`
                  : 'Pagamento único não gera receita recorrente — o MRR deste cliente fica zerado.'}
              </p>
            )}
          </div>

          <button
            onClick={submit}
            disabled={register.isPending}
            className={cn(
              'w-full h-11 rounded-xl bg-emerald-500 text-white text-[13px] font-semibold',
              'hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2',
            )}
          >
            {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Registrar e emitir contrato
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
