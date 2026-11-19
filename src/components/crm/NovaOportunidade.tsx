import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateProspect, useChannels } from '@/hooks/useAdmin';
import { funilDoCanal } from '@/lib/funis';
import { CidadeUF } from './CidadeUF';
import { mascaraTelefone, whatsappCompleto, mascaraMoeda, valorDaMoeda } from '@/lib/mascaras';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

/* ── Nova oportunidade, cadastrada à mão (indicação, alguém que ligou) ─── */
export function NovaOportunidade({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { member } = useAuth();
  const create = useCreateProspect();
  const { data: canais = [] } = useChannels();
  const [form, setForm] = useState({
    company_name: '', contact_name: '', whatsapp: '',
    city: '', state: '', channel_id: '', source: '', proposal_value: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  /* 'Base de contatos' já vem escolhido: é de onde vem a maior parte da
     entrada hoje. Continua trocável, e continua obrigatório — o que não pode
     é ficar vazio e o relatório de aquisição virar chute. */
  useEffect(() => {
    if (form.channel_id || !canais.length) return;
    const base = canais.find((c) => c.name === 'Base de contatos');
    if (base) setForm((f) => ({ ...f, channel_id: base.id }));
  }, [canais, form.channel_id]);

  const submit = async () => {
    if (!form.company_name.trim()) { toast.error('Informe o nome da empresa'); return; }
    // Canal é obrigatório na entrada, não depois: preenchido de memória semanas
    // adiante ele deixa de ser dado e vira chute — e é a base de todo o
    // relatório de aquisição.
    if (!form.channel_id) { toast.error('Escolha por onde ela chegou'); return; }
    // WhatsApp não trava o cadastro: a amostra sai antes de ter o número.
    // Quem exige é o agendamento da reunião, que manda a confirmação por lá.
    // Se veio preenchido, porém, tem que dar para discar.
    if (form.whatsapp && !whatsappCompleto(form.whatsapp)) {
      toast.error('WhatsApp incompleto — informe com DDD ou deixe em branco');
      return;
    }
    try {
      await create.mutateAsync({
        company_name: form.company_name.trim(),
        contact_name: form.contact_name || null,
        whatsapp: form.whatsapp || null,  // guardado mascarado; quem disca usa replace(/\D/g,'')
        city: form.city || null,
        state: form.state || null,
        channel_id: form.channel_id,
        /* O funil é só o agrupamento dos relatórios: sai do canal, ninguém precisa escolher. */
        funil: funilDoCanal(canais.find((c) => c.id === form.channel_id)?.slug),
        source: form.source || null,
        proposal_value: valorDaMoeda(form.proposal_value),
        owner_id: member?.id ?? null,
      });
      toast.success('Criada. Está na etapa Conversa, esperando o primeiro contato.');
      setForm({ company_name: '', contact_name: '', whatsapp: '', city: '', state: '', channel_id: '', source: '', proposal_value: '' });
      onClose();
    } catch {
      toast.error('Não consegui criar. Tente de novo.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Nova oportunidade</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <input className={inputCls} placeholder="Nome da empresa *" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="Nome do responsável" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
            <input className={inputCls} placeholder="WhatsApp (pode ficar para a reunião)" inputMode="numeric" value={form.whatsapp} onChange={(e) => set('whatsapp', mascaraTelefone(e.target.value))} />
          </div>
          <CidadeUF
            uf={form.state}
            cidade={form.city}
            onChange={({ uf, cidade }) => setForm((f) => ({ ...f, state: uf, city: cidade }))}
          />
          <select className={inputCls} value={form.channel_id} onChange={(e) => set('channel_id', e.target.value)}>
            <option value="">Por onde chegou? *</option>
            {canais.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="Mensalidade (R$)" inputMode="numeric" value={form.proposal_value} onChange={(e) => set('proposal_value', mascaraMoeda(e.target.value))} />
            <input className={inputCls} placeholder="Detalhe: campanha, quem indicou…" value={form.source} onChange={(e) => set('source', e.target.value)} />
          </div>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
