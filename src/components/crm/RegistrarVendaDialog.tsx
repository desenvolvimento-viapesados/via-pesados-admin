import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, FileText, Check, Link2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useRegisterSale, usePlans, useCriarAssinaturaAsaas, brlFull, type Prospect,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

/* Os mesmos canais que CanaisDoCliente edita depois. A escolha nasce aqui,
   na venda, porque é decisão comercial — e nesse momento o sistema do cliente
   ainda não existe, então ela fica guardada no cadastro até o provisionamento. */
const CANAIS_VENDA = [
  { id: 'mercadolivre', nome: 'Mercado Livre', sub: 'anúncios de veículo com preço sincronizado' },
  { id: 'facebook',     nome: 'Facebook, Instagram e WhatsApp', sub: 'um login libera Página, Instagram e catálogo' },
] as const;

const empty = {
  company_name: '', legal_name: '', cnpj: '', address: '',
  legal_rep_name: '', legal_rep_cpf: '',
  contact_name: '', whatsapp: '', email: '', city: '', state: '',
  plan_id: '', plan: '', mrr: '', recurrence: 'mensal', canais: [] as string[],
  gerar_cobranca: true,
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
  const { data: planos = [] } = usePlans();
  const gerarLink = useCriarAssinaturaAsaas();
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
  const alternarCanal = (id: string) =>
    setForm((f) => ({
      ...f,
      canais: f.canais.includes(id) ? f.canais.filter((c) => c !== id) : [...f.canais, id],
    }));

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
          plan_id: form.plan_id || null,
          mrr: form.mrr ? Number(form.mrr) : 0,
          recurrence: form.recurrence as 'mensal' | 'anual' | 'unico',
          canais: form.canais,
          owner_id: member?.id ?? null,
        },
      });
      // A cobrança sai junto com a venda: é o momento em que o valor está
      // acertado e o lojista está do outro lado esperando o link. Falhar
      // aqui não desfaz a venda — o botão continua na ficha do cliente.
      if (form.gerar_cobranca && Number(form.mrr) > 0) {
        try {
          const r = await gerarLink.mutateAsync({
            client_id: client.id,
            valor: Number(form.mrr),
          });
          await navigator.clipboard.writeText(r.url).catch(() => {});
          toast.success('Venda registrada e link de cobrança copiado — é só mandar ao cliente.');
        } catch (e) {
          toast.warning(
            `Venda registrada, mas a cobrança não foi gerada: ${(e as Error).message}. Dá para gerar na ficha do cliente.`,
          );
        }
      } else {
        toast.success('Venda registrada — contrato emitido em rascunho');
      }
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
              <select
                className={inputCls}
                value={form.plan_id}
                onChange={(e) => {
                  const p = planos.find((x) => x.id === e.target.value);
                  // O plano carrega o preço: digitar de novo abriria espaço
                  // para vender o mesmo plano por valores diferentes.
                  setForm((f) => ({
                    ...f,
                    plan_id: e.target.value,
                    plan: p?.name ?? '',
                    mrr: p && f.recurrence === 'mensal' ? String(p.monthly_value) : f.mrr,
                  }));
                }}
              >
                <option value="">Plano…</option>
                {planos.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {brlFull(p.monthly_value)}/mês</option>
                ))}
              </select>
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

            {/* Cobrança recorrente — o valor é o da venda, não o do plano */}
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, gerar_cobranca: !f.gerar_cobranca }))}
              disabled={form.recurrence !== 'mensal'}
              className={cn(
                'w-full flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors disabled:opacity-40',
                form.gerar_cobranca && form.recurrence === 'mensal'
                  ? 'border-emerald-400/30 bg-emerald-400/[0.06]'
                  : 'border-black/[0.1] dark:border-white/[0.1] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]',
              )}
            >
              <span className={cn(
                'h-4 w-4 rounded-md border flex items-center justify-center shrink-0 mt-px',
                form.gerar_cobranca && form.recurrence === 'mensal'
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-black/20 dark:border-white/25',
              )}>
                {form.gerar_cobranca && form.recurrence === 'mensal' && <Check className="h-3 w-3 text-white" />}
              </span>
              <span className="min-w-0">
                <span className="text-[12.5px] font-medium text-foreground flex items-center gap-1.5">
                  <Link2 className="h-3 w-3" /> Gerar cobrança mensal no Asaas
                </span>
                <span className="block text-[11px] text-foreground/45 mt-0.5">
                  {form.recurrence !== 'mensal'
                    ? 'Disponível só para contrato mensal.'
                    : form.mrr
                      ? `${brlFull(Number(form.mrr))} por mês, todo mês, no Pix, boleto ou cartão. O link é copiado ao salvar.`
                      : 'Informe a mensalidade acima para gerar.'}
                </span>
              </span>
            </button>

            <div className="pt-1">
              <p className="text-[11.5px] font-medium text-foreground/70 px-1 pb-1.5">Canais contratados</p>
              <div className="space-y-1.5">
                {CANAIS_VENDA.map((c) => {
                  const on = form.canais.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => alternarCanal(c.id)}
                      className={`w-full flex items-start gap-2.5 text-left px-3 py-2.5 rounded-xl border transition-colors ${
                        on
                          ? 'border-primary/50 bg-primary/[0.06]'
                          : 'border-black/[0.1] dark:border-white/[0.1] hover:border-black/20 dark:hover:border-white/20'
                      }`}
                    >
                      <span
                        className={`mt-0.5 h-4 w-4 shrink-0 rounded-[5px] border flex items-center justify-center ${
                          on ? 'bg-primary border-primary' : 'border-black/25 dark:border-white/25'
                        }`}
                      >
                        {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] text-foreground leading-tight">{c.nome}</span>
                        <span className="block text-[11px] text-foreground/40 leading-snug">{c.sub}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-foreground/40 px-1 pt-1.5">
                Define o que ele consegue conectar. Editável depois, na ficha do cliente.
              </p>
            </div>
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
