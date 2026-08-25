import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateClient } from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

/** Venda fechada — cria o cliente e leva direto para a central de conexão. */
export function NewClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
          <DialogTitle className="text-[15px] font-semibold">Nova venda</DialogTitle>
        </DialogHeader>
        <p className="text-[11.5px] text-foreground/40 -mt-1">
          Cria o cliente e abre a central de conexão — contrato, cobrança, sistema, logo e domínio.
        </p>
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
            Criar e conectar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
