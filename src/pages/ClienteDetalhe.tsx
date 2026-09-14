import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2, Check, FileText, CreditCard, Rocket, Globe, Upload,
  Copy, ExternalLink, Phone, Mail, MapPin, Plus, StickyNote,
  PartyPopper, KeyRound, Repeat, Send, ChevronRight, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useClient, useUpdateClient, useOnboardingTasks, useToggleTask,
  useContracts, useCreateContract, usePayments, useCreatePayment,
  useActivities, useCreateActivity,
  provisionCompany, adotarAmostra, useDemos, useUpdateDemo, updateCompanyBranding, uploadLogo, slugify, genPassword,
  setCompanyChannels,
  brlFull, brl, type Client, type OnboardingTask,
  usePlans, useCriarAssinaturaAsaas,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { LOJISTA_APP_URL, supabase, FUNCTIONS_URL } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CanaisDoCliente } from '@/components/CanaisDoCliente';
import { UsoDoSistema } from '@/components/admin/UsoDoSistema';
import { NotasFiscais } from '@/components/admin/NotasFiscais';
import { useSystemCredential, saveSystemCredential } from '@/hooks/useAdmin';
import { SectionHeader, StatusBadge, Panel, InitialAvatar } from '@/components/admin/ui';
import { DomainDialog, BrandingDialog, proximaEtapaAberta } from '@/components/admin/EtapasCliente';
import { ImageField, IMG_FIELDS, IMG_KEYS, emptyImgs, type ImgKey } from '@/components/crm/BrandingFields';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const copyText = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copiado`);
};

/* ── Dialog: gerar contrato ─────────────────────────────────── */
function ContractDialog({
  client, onDone, onClose,
}: {
  client: Client;
  onDone: () => void;
  onClose: () => void;
}) {
  const create = useCreateContract();
  const [form, setForm] = useState({
    title: `Contrato de licença de uso — ${client.company_name}`,
    value: client.mrr?.toString() ?? '',
    recurrence: 'mensal',
    file_url: '',
  });

  const submit = async () => {
    try {
      await create.mutateAsync({
        client_id: client.id,
        title: form.title,
        value: form.value ? Number(form.value) : 0,
        recurrence: form.recurrence as 'mensal' | 'anual' | 'unico',
        status: 'rascunho',
        file_url: form.file_url || null,
      });
      toast.success('Contrato registrado');
      onDone();
      onClose();
    } catch {
      toast.error('Erro ao registrar contrato');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Gerar contrato</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} type="number" placeholder="Valor (R$)" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
            <select className={inputCls} value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}>
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
              <option value="unico">Único</option>
            </select>
          </div>
          <input className={inputCls} placeholder="URL do documento (Drive, Docusign…)" value={form.file_url} onChange={(e) => setForm((f) => ({ ...f, file_url: e.target.value }))} />
          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar contrato
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Dialog: configurar cobrança ────────────────────────────── */
function PaymentDialog({
  client, onDone, onClose,
}: {
  client: Client;
  onDone?: () => void;
  onClose: () => void;
}) {
  const create = useCreatePayment();
  const [form, setForm] = useState({
    description: `Mensalidade — ${client.company_name}`,
    amount: client.mrr?.toString() ?? '',
    due_date: '',
    method: 'pix',
  });

  const submit = async () => {
    if (!form.due_date) { toast.error('Informe o vencimento'); return; }
    try {
      await create.mutateAsync({
        client_id: client.id,
        description: form.description,
        amount: form.amount ? Number(form.amount) : 0,
        due_date: form.due_date,
        method: form.method as 'pix' | 'boleto' | 'cartao' | 'transferencia' | 'outro',
      });
      toast.success('Cobrança criada');
      onDone?.();
      onClose();
    } catch {
      toast.error('Erro ao criar cobrança');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Nova cobrança</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <input className={inputCls} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} type="number" placeholder="Valor (R$)" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            <input className={inputCls} type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
          </div>
          <select className={inputCls} value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
            <option value="pix">Pix</option>
            <option value="boleto">Boleto</option>
            <option value="cartao">Cartão</option>
            <option value="transferencia">Transferência</option>
            <option value="outro">Outro</option>
          </select>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar cobrança
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Dialog: criar sistema (provisionamento) ────────────────── */
function ProvisionDialog({
  client, onDone, onClose,
}: {
  client: Client;
  onDone: () => void;
  onClose: () => void;
}) {
  const update = useUpdateClient();
  const atualizarDemo = useUpdateDemo();
  const { data: demos = [] } = useDemos();
  const [email, setEmail] = useState(client.email || '');
  const [amostraEmail, setAmostraEmail] = useState('');
  const [password] = useState(genPassword());
  const [loading, setLoading] = useState(false);

  /* Adotar a amostra deixou de ser exclusividade da venda. Quem fecha a
     venda sem vincular ficava sem caminho: "Criar sistema" nascia vazio e a
     amostra que o cliente viu virava lixo. */
  const alvo = amostraEmail.trim().toLowerCase();
  const amostra = alvo
    ? demos.find((d) => d.lojista_company_id && d.status !== 'convertida'
        && (d.admin_email ?? '').trim().toLowerCase() === alvo) ?? null
    : null;

  const submit = async () => {
    if (!email.trim()) { toast.error('Informe o e-mail do administrador do cliente'); return; }
    setLoading(true);
    try {
      const slug = slugify(client.company_name);

      if (amostra?.lojista_company_id) {
        const r = await adotarAmostra({
          company_id: amostra.lojista_company_id,
          company_name: client.company_name,
          company_slug: slug,
          admin_email: email.trim(),
          admin_password: password,
          admin_full_name: client.contact_name ?? client.company_name,
          city: client.city ?? undefined,
          state: client.state ?? undefined,
          address: client.address ?? undefined,
          /* O domínio pode ter sido registrado antes do sistema existir.
             Sem levá-lo aqui, o endereço continuaria apontando para uma
             loja que o app não acha — página de erro no ar. */
          domains: client.domain ? [client.domain] : undefined,
        });
        await update.mutateAsync({ id: client.id, lojista_company_id: r.company_id, admin_email: email.trim() });
        await saveSystemCredential({ client_id: client.id, email: email.trim(), password });
        await atualizarDemo.mutateAsync({ id: amostra.id, status: 'convertida' });
        if (client.canais?.length) {
          try { await setCompanyChannels(r.company_id, client.canais); }
          catch { toast.warning('Sistema pronto, mas os canais não foram aplicados. Ajuste em "Canais liberados".'); }
        }
        toast.success('Sistema pronto a partir da amostra');
        onDone(); onClose();
        return;
      }

      const { company_id } = await provisionCompany({
        company_name: client.company_name,
        company_slug: slug,
        admin_email: email.trim(),
        admin_password: password,
        admin_full_name: client.contact_name ?? client.company_name,
        logo_url: client.logo_url ?? undefined,
        domains: client.domain ? [client.domain] : undefined,
      });
      await update.mutateAsync({
        id: client.id,
        lojista_company_id: company_id,
        admin_email: email.trim(),
      });
      /* Os canais foram escolhidos na venda, quando ainda não havia tenant
         onde gravá-los. Agora existe. Falhar aqui não desfaz o sistema, que
         já está criado — o aviso manda o operador ajustar na ficha. */
      if (client.canais?.length) {
        try {
          await setCompanyChannels(company_id, client.canais);
        } catch {
          toast.warning('Sistema criado, mas os canais não foram aplicados. Ajuste em "Canais liberados".');
        }
      }
      // A senha vai para system_credentials, que só admin lê.
      await saveSystemCredential({ client_id: client.id, email: email.trim(), password });
      toast.success('Sistema do cliente criado!');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao criar sistema');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Criar sistema do cliente</DialogTitle>
        </DialogHeader>
        <p className="text-[11.5px] text-foreground/40 -mt-1">
          Cria a empresa no Sistema Via Pesados com o primeiro acesso de administrador.
        </p>
        <div className="space-y-2.5 pt-1">
          <input className={inputCls} type="email" placeholder="E-mail do administrador do cliente *" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className={inputCls}
            type="email"
            autoComplete="off"
            placeholder="E-mail do sistema a aproveitar (opcional)"
            value={amostraEmail}
            onChange={(e) => setAmostraEmail(e.target.value)}
          />
          {amostraEmail.trim() && (
            amostra ? (
              <p className="text-[11.5px] text-emerald-400 leading-snug">
                {amostra.company_name} — a amostra vira o sistema dele. O conteúdo de
                demonstração é apagado e a identidade, o site e o domínio ficam.
              </p>
            ) : (
              <p className="text-[11.5px] text-amber-500/90 leading-snug">
                Não achei amostra com esse e-mail. Do jeito que está, o sistema nasce vazio.
              </p>
            )
          )}
          <div className="flex items-center gap-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] px-3 py-2.5">
            <KeyRound className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
            <p className="text-[12.5px] font-mono text-foreground flex-1">{password}</p>
            <button onClick={() => copyText(password, 'Senha')} className="text-foreground/40 hover:text-foreground">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[10.5px] text-foreground/35">Senha provisória gerada — envie ao cliente com orientação de troca.</p>
          <button
            onClick={submit}
            disabled={loading}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {amostra ? 'Aproveitar a amostra' : 'Criar sistema'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Dialog: conectar domínio ───────────────────────────────── */
/** Hostname puro: sem protocolo, sem caminho, sem www e em minúsculas. */
/* ── Etapa do checklist ─────────────────────────────────────── */
/* ── Página ─────────────────────────────────────────────────── */
export default function ClienteDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { member, isAdmin } = useAuth();
  const { data: client, isLoading } = useClient(id);
  const { data: tasks = [] } = useOnboardingTasks(id);
  const { data: contracts = [] } = useContracts(id);
  const { data: payments = [] } = usePayments(id);
  const { data: activities = [] } = useActivities({ clientId: id });

  const update = useUpdateClient();
  const toggle = useToggleTask();
  const createActivity = useCreateActivity();

  const [dialog, setDialog] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [showCreds, setShowCreds] = useState(false);
  const [avisando, setAvisando] = useState(false);

  /* Aviso manual de que o sistema está no ar. Manual porque pagamento
     confirmado não é loja pronta — falta estoque, marca, canais. Quem sabe
     que chegou lá é quem montou. O servidor manda uma vez por cliente. */
  const avisarAcesso = async () => {
    setAvisando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${FUNCTIONS_URL}/cliente-avisar-acesso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ client_id: client!.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Não foi possível avisar.');
      if (d.ok) toast.success('Aviso enviado no WhatsApp do lojista');
      else if (d.repetido) toast.info('Esse aviso já foi enviado antes.');
      else toast.warning(`Não enviado: ${d.motivo}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAvisando(false);
    }
  };
  const { data: credencial } = useSystemCredential({ clientId: id, enabled: showCreds && isAdmin });

  if (isLoading || !client) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const allDone = tasks.length > 0 && doneCount === tasks.length;
  /* Mandar para o começo obrigava a reencontrar onde parou — e "continuar"
     que recomeça não é continuar. */
  const proximaEtapa = proximaEtapaAberta(tasks);

  const markTask = async (key: string) => {
    const task = tasks.find((t) => t.task_key === key);
    if (task && !task.done && member) {
      await toggle.mutateAsync({ id: task.id, done: true, userId: member.id });
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await createActivity.mutateAsync({ client_id: client.id, kind: 'nota', content: note.trim(), author_id: member?.id ?? null });
    setNote('');
  };

  /* A data do evento é gravada AQUI, no momento em que ele acontece.
     Sem isso, Relatórios lê coluna vazia e reporta zero em silêncio:
     churn some, coorte marca 100% de retenção e a série de MRR não sobe. */
  const setStatus = async (status: Client['status']) => {
    const agora = new Date().toISOString();
    await update.mutateAsync({
      id: client.id,
      status,
      // Primeira ativação carimba; reativar depois não reescreve a original.
      ...(status === 'ativo' && !client.activated_at ? { activated_at: agora } : {}),
      // Cancelar carimba; sair de cancelado limpa, senão o cliente fica
      // vivo e morto ao mesmo tempo nas séries.
      ...(status === 'cancelado'
        ? { canceled_at: client.canceled_at ?? agora }
        : client.canceled_at ? { canceled_at: null } : {}),
    });
    toast.success('Status atualizado');
  };

  return (
    <div className="flex flex-col gap-6">

      {/* ── Header do cliente ─────────────────────────────────── */}
      <div className="flex items-start gap-4 flex-wrap">
        <InitialAvatar name={client.company_name} src={client.logo_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[22px] font-bold tracking-tight text-foreground">{client.company_name}</h1>
            <StatusBadge status={client.status} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11.5px] text-foreground/45 flex-wrap">
            {client.contact_name && <span>{client.contact_name}</span>}
            {client.whatsapp && (
              <a href={`https://wa.me/55${client.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-emerald-500">
                <Phone className="h-3 w-3" /> {client.whatsapp}
              </a>
            )}
            {client.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {client.email}</span>}
            {(client.city || client.state) && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {[client.city, client.state].filter(Boolean).join('/')}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[24px] font-bold text-foreground tabular-nums leading-tight">{brl(client.mrr)}</p>
          <p className="text-[10.5px] text-foreground/35">{client.plan ? `${client.plan} · mensal` : 'mensalidade'}</p>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex gap-1.5 flex-wrap">
        {(['onboarding', 'ativo', 'inadimplente', 'pausado', 'cancelado'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'h-8 px-3 rounded-lg text-[11.5px] font-medium transition-colors capitalize',
              client.status === s
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'border border-black/[0.08] dark:border-white/[0.08] text-foreground/40 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

        {/* ── Coluna principal: conexão ───────────────────────── */}
        <div className="flex flex-col gap-6">

          {/* Checklist */}
          <div>
            <SectionHeader
              title={`Conexão · ${doneCount}/${tasks.length}`}
              right={
                <div className="w-28 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              }
            />
            {/* A lista aqui é registro, não é onde se trabalha. O trabalho
                acontece em /onboarding, uma etapa por tela — caixinha diz
                que falta, não diz o que fazer. O que fica é a leitura
                rápida de onde a conta está. */}
            <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
              {tasks.map((t) => (
                <div key={t.id} className={cn('flex items-center gap-3 px-4 py-2.5', t.done && 'opacity-50')}>
                  <span className={cn(
                    'h-4 w-4 rounded-md border flex items-center justify-center shrink-0',
                    t.done ? 'bg-emerald-500 border-emerald-500' : 'border-black/[0.15] dark:border-white/[0.2]',
                  )}>
                    {t.done && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <p className={cn('text-[12.5px] text-foreground flex-1 min-w-0 truncate', t.done && 'line-through')}>
                    {t.label}
                  </p>
                  {t.done_at && (
                    <span className="text-[10px] text-foreground/30 tabular-nums shrink-0">
                      {new Date(t.done_at).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              ))}
            </Panel>

            {client.status === 'onboarding' && (
              <button
                onClick={() => navigate(`/clientes/${client.id}/onboarding?etapa=${proximaEtapa}`)}
                className="mt-3 w-full h-11 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                {allDone ? <PartyPopper className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                {allDone ? 'Colocar no ar' : 'Continuar o onboarding'}
              </button>
            )}
          </div>

          {/* Cobrança — o link e o estado vivem na tela própria, que
              atualiza sozinha quando o pagamento entra. Aqui fica só o
              resumo e a porta de entrada: repetir o link nos dois lugares
              fazia parecer que eram duas cobranças diferentes. */}
          <div>
            <SectionHeader title="Cobrança" />
            <button
              onClick={() => navigate(`/clientes/${client.id}/cobranca`)}
              className="w-full text-left rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] p-4 hover:border-black/20 dark:hover:border-white/20 transition-colors flex items-center gap-3"
            >
              <Repeat className="h-4 w-4 text-foreground/35 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-foreground">
                  {client.mrr ? `${brlFull(client.mrr)} por mês` : 'Mensalidade não definida'}
                </p>
                <p className="text-[11px] text-foreground/40">
                  {client.asaas_payment_link_url ? 'Ver link e acompanhar o pagamento' : 'Cobrança ainda não criada'}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-foreground/30 shrink-0" />
            </button>
          </div>

          {/* Sem sistema não há acesso a liberar, e o assistente manda criar
              aqui. Antes isso vivia como etapa da lista de ações; com a lista
              virando registro, o botão precisava de um lugar próprio. */}
          {!client.lojista_company_id && (
            <div>
              <SectionHeader title="Sistema" />
              <Panel className="p-4 space-y-3">
                <p className="text-[12px] text-foreground/50 leading-snug">
                  Este cliente ainda não tem sistema. Sem ele não dá para liberar o
                  primeiro acesso nem aplicar a identidade.
                </p>
                <button
                  onClick={() => setDialog('sistema_criado')}
                  className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  <Rocket className="h-3.5 w-3.5" /> Criar sistema
                </button>
              </Panel>
            </div>
          )}

          {/* Sistema provisionado */}
          {client.lojista_company_id && (
            <div>
              <SectionHeader title="Sistema" />
              <Panel className="p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-foreground">Sistema Via Pesados</p>
                    <p className="text-[11px] text-foreground/40 truncate">
                      {client.domain || LOJISTA_APP_URL.replace('https://', '')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setShowCreds((v) => !v)}
                      className="h-8 px-2.5 rounded-lg border border-black/[0.1] dark:border-white/[0.1] text-[11.5px] font-medium text-foreground/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-1.5"
                    >
                      <KeyRound className="h-3 w-3" /> Acesso
                    </button>
                    <button
                      onClick={avisarAcesso}
                      disabled={avisando}
                      title="Manda ao lojista, no WhatsApp, que o sistema está no ar"
                      className="h-8 px-2.5 rounded-lg border border-primary/40 text-[11.5px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {avisando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Avisar que está pronto
                    </button>
                    {/* A identidade saiu do onboarding: quando o sistema vem
                        da amostra ela já chega aplicada, e virava uma tela
                        pedindo o que já estava lá. Continua alcançável aqui,
                        para quando houver o que trocar. */}
                    <button
                      onClick={() => setDialog('logo_aplicada')}
                      title="Trocar logo, ícone ou banner no sistema e no site"
                      className="h-8 px-2.5 rounded-lg border border-black/[0.1] dark:border-white/[0.1] text-[11.5px] font-medium text-foreground/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-1.5"
                    >
                      <Upload className="h-3 w-3" /> Identidade
                    </button>
                    <a
                      href={client.domain ? `https://${client.domain}` : LOJISTA_APP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 px-2.5 rounded-lg bg-primary/10 text-primary text-[11.5px] font-semibold hover:bg-primary/20 flex items-center gap-1.5"
                    >
                      <ExternalLink className="h-3 w-3" /> Abrir
                    </a>
                  </div>
                </div>
                {showCreds && (
                  <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.04] p-3 space-y-1.5 text-[11.5px]">
                    {client.admin_email && (
                      <button onClick={() => copyText(client.admin_email!, 'E-mail')} className="flex items-center gap-1.5 text-foreground/70 hover:text-foreground">
                        <Copy className="h-3 w-3" /> {client.admin_email}
                      </button>
                    )}
                    {credencial?.password ? (
                      <button onClick={() => copyText(credencial.password, 'Senha')} className="flex items-center gap-1.5 text-foreground/70 hover:text-foreground">
                        <Copy className="h-3 w-3" /> {credencial.password}
                      </button>
                    ) : (
                      <p className="text-foreground/35">
                        {isAdmin ? 'Sem senha guardada para este cliente.' : 'A senha do sistema fica restrita a administradores.'}
                      </p>
                    )}
                  </div>
                )}
              </Panel>
            </div>
          )}

          {/* Canais que o cliente trabalha */}
          {client.lojista_company_id && (
            <div>
              <SectionHeader title="Canais liberados" right={<span className="text-[11px] text-foreground/35">define o que ele conecta</span>} />
              <Panel className="p-4">
                <CanaisDoCliente companyId={client.lojista_company_id} />
              </Panel>
            </div>
          )}

          {/* Uso do sistema — agregado, com registro de acesso */}
          {client.lojista_company_id && (
            <div>
              <SectionHeader title="Uso do sistema" right={<span className="text-[11px] text-foreground/35">agregado · LGPD</span>} />
              <UsoDoSistema client={client} />
            </div>
          )}

          {/* Notas */}
          <div>
            <SectionHeader title="Notas" />
            <div className="flex gap-2 mb-2.5">
              <input
                className={inputCls}
                placeholder="Registrar nota…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNote()}
              />
              <button
                onClick={addNote}
                className="h-10 w-10 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center shrink-0"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {activities.length > 0 && (
              <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
                {activities.map((a) => (
                  <div key={a.id} className="px-4 py-2.5 flex items-start gap-2.5">
                    <StickyNote className="h-3.5 w-3.5 text-foreground/25 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-foreground/80">{a.content}</p>
                      <p className="text-[10px] text-foreground/30 mt-0.5">
                        {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </Panel>
            )}
          </div>
        </div>

        {/* ── Coluna lateral ──────────────────────────────────── */}
        <div className="flex flex-col gap-6">

          {/* Pagamentos */}
          <div>
            <SectionHeader
              title="Pagamentos"
              right={
                <button
                  onClick={() => setDialog('pagamento_extra')}
                  className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Cobrança
                </button>
              }
            />
            <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
              {payments.length === 0 ? (
                <p className="text-[11.5px] text-foreground/30 text-center py-6">Nenhuma cobrança</p>
              ) : (
                payments.slice(0, 8).map((p) => (
                  <div key={p.id} className="px-3.5 py-2.5 flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground truncate">{p.description}</p>
                      <p className="text-[10.5px] text-foreground/35">
                        Venc. {new Date(p.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <p className="text-[12px] font-bold text-foreground tabular-nums">{brlFull(p.amount)}</p>
                    <StatusBadge status={p.status} />
                  </div>
                ))
              )}
            </Panel>
          </div>

          {/* Notas fiscais — logo abaixo de Pagamentos porque é a mesma
              história: a cobrança sai, a nota sai atrás. Ver as duas juntas
              é o que denuncia a nota que não veio. */}
          <NotasFiscais clientId={id} />

          {/* Contratos */}
          <div>
            <SectionHeader
              title="Contratos"
              right={
                <button
                  onClick={() => setDialog('contrato_gerado')}
                  className="text-[11px] font-semibold text-primary hover:opacity-70 flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Contrato
                </button>
              }
            />
            <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
              {contracts.length === 0 ? (
                <p className="text-[11.5px] text-foreground/30 text-center py-6">Nenhum contrato</p>
              ) : (
                contracts.map((c) => (
                  <div key={c.id} className="px-3.5 py-2.5 flex items-center gap-2.5">
                    <FileText className="h-3.5 w-3.5 text-foreground/30 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground truncate">{c.title}</p>
                      <p className="text-[10.5px] text-foreground/35">{brlFull(c.value)} · {c.recurrence}</p>
                    </div>
                    {c.file_url && (
                      <a href={c.file_url} target="_blank" rel="noopener noreferrer" className="text-foreground/30 hover:text-primary">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <StatusBadge status={c.status} />
                  </div>
                ))
              )}
            </Panel>
          </div>
        </div>
      </div>

      {/* ── Dialogs de etapa ──────────────────────────────────── */}
      {dialog === 'contrato_gerado' && (
        <ContractDialog client={client} onDone={() => markTask('contrato_gerado')} onClose={() => setDialog(null)} />
      )}
      {dialog === 'pagamento_extra' && (
        <PaymentDialog client={client} onClose={() => setDialog(null)} />
      )}
      {dialog === 'sistema_criado' && (
        <ProvisionDialog client={client} onDone={() => markTask('sistema_criado')} onClose={() => setDialog(null)} />
      )}
      {dialog === 'logo_aplicada' && (
        <BrandingDialog client={client} onDone={() => markTask('logo_aplicada')} onClose={() => setDialog(null)} />
      )}
      {dialog === 'dominio_conectado' && (
        <DomainDialog client={client} onDone={() => markTask('dominio_conectado')} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
