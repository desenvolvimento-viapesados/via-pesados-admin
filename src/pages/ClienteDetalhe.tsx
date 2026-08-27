import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2, Check, FileText, CreditCard, Rocket, Globe, Upload,
  Copy, ExternalLink, Phone, Mail, MapPin, Plus, StickyNote,
  PartyPopper, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useClient, useUpdateClient, useOnboardingTasks, useToggleTask,
  useContracts, useCreateContract, usePayments, useCreatePayment,
  useActivities, useCreateActivity,
  provisionCompany, updateCompanyBranding, uploadLogo, slugify, genPassword,
  brlFull, brl, type Client, type OnboardingTask,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { LOJISTA_APP_URL } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UsoDoSistema } from '@/components/admin/UsoDoSistema';
import { SectionHeader, StatusBadge, Panel, InitialAvatar } from '@/components/admin/ui';
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
  const [email, setEmail] = useState(client.email || '');
  const [password] = useState(genPassword());
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim()) { toast.error('Informe o e-mail do administrador do cliente'); return; }
    setLoading(true);
    try {
      const slug = slugify(client.company_name);
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
        admin_password: password,
      });
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
            Criar sistema
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Dialog: conectar domínio ───────────────────────────────── */
function DomainDialog({
  client, onDone, onClose,
}: {
  client: Client;
  onDone: () => void;
  onClose: () => void;
}) {
  const update = useUpdateClient();
  const [domain, setDomain] = useState(client.domain || '');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!clean) { toast.error('Informe o domínio'); return; }
    setLoading(true);
    try {
      if (client.lojista_company_id) {
        await updateCompanyBranding({ company_id: client.lojista_company_id, domains: [clean] });
      }
      await update.mutateAsync({ id: client.id, domain: clean });
      toast.success('Domínio registrado');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao registrar domínio');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Conectar domínio</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <input className={inputCls} placeholder="ex: cliente.com.br" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.04] p-3 text-[11.5px] text-foreground/50 space-y-1">
            <p className="font-semibold text-foreground/70">Configuração DNS do cliente:</p>
            <p>• Registro <span className="font-mono text-foreground">A</span> → <span className="font-mono text-foreground">76.76.21.21</span></p>
            <p>• Ou <span className="font-mono text-foreground">CNAME</span> → <span className="font-mono text-foreground">cname.vercel-dns.com</span></p>
            <p className="text-foreground/35 pt-1">Depois, adicione o domínio no projeto Vercel do sistema.</p>
          </div>
          <button
            onClick={submit}
            disabled={loading}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar domínio
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Identidade visual do cliente ───────────────────────────── */
function BrandingDialog({
  client, onDone, onClose,
}: {
  client: Client;
  onDone: () => void;
  onClose: () => void;
}) {
  const update = useUpdateClient();
  const [files, setFiles] = useState<Record<ImgKey, File | null>>(emptyImgs<File | null>(null));
  const [previews, setPreviews] = useState<Record<ImgKey, string | null>>({
    ...emptyImgs<string | null>(null),
    logo: client.logo_url,
  });
  const [saving, setSaving] = useState(false);

  const setImage = (key: ImgKey, file: File | null) => {
    setPreviews((prev) => ({ ...prev, [key]: file ? URL.createObjectURL(file) : null }));
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const submit = async () => {
    if (!client.lojista_company_id) {
      toast.error('Crie o sistema do cliente antes de aplicar a identidade');
      return;
    }
    if (IMG_KEYS.every((k) => !files[k])) { toast.error('Envie ao menos uma imagem'); return; }

    setSaving(true);
    try {
      const base = slugify(client.company_name);
      const urls: Partial<Record<ImgKey, string>> = {};
      for (const key of IMG_KEYS) {
        const file = files[key];
        if (file) urls[key] = await uploadLogo(file, `client-${base}-${key}`);
      }

      await updateCompanyBranding({
        company_id: client.lojista_company_id,
        logo_url: urls.logo,
        site_logo_url: urls.site_logo,
        brand_icon_url: urls.brand_icon,
        banner_url: urls.banner,
        favicon_url: urls.favicon,
      });

      if (urls.logo) await update.mutateAsync({ id: client.id, logo_url: urls.logo });

      toast.success('Identidade aplicada no sistema do cliente');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao aplicar identidade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Identidade visual</DialogTitle>
        </DialogHeader>
        <p className="text-[11.5px] text-foreground/40 -mt-1">
          Aplica direto no sistema do cliente. Envie só o que tiver — o resto fica como está.
        </p>

        <div className="space-y-3 pt-1">
          {IMG_FIELDS.map(({ key, label, hint, ratio }) => (
            <ImageField
              key={key}
              label={label}
              hint={hint}
              ratio={ratio}
              preview={previews[key]}
              onPick={(f) => setImage(key, f)}
              onClear={() => setImage(key, null)}
            />
          ))}

          <button
            onClick={submit}
            disabled={saving}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Aplicar no sistema
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Etapa do checklist ─────────────────────────────────────── */
const TASK_ICONS: Record<string, typeof FileText> = {
  contrato_gerado: FileText,
  contrato_assinado: FileText,
  pagamento_configurado: CreditCard,
  sistema_criado: Rocket,
  logo_aplicada: Upload,
  dominio_conectado: Globe,
};

function TaskRow({
  task, client, onAction,
}: {
  task: OnboardingTask;
  client: Client;
  onAction: (key: string) => void;
}) {
  const { member } = useAuth();
  const toggle = useToggleTask();
  const Icon = TASK_ICONS[task.task_key];
  const hasAction = ['contrato_gerado', 'pagamento_configurado', 'sistema_criado', 'logo_aplicada', 'dominio_conectado'].includes(task.task_key);

  const handleToggle = async () => {
    if (!member) return;
    await toggle.mutateAsync({ id: task.id, done: !task.done, userId: member.id });
  };

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', task.done && 'opacity-60')}>
      <button
        onClick={handleToggle}
        className={cn(
          'h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-all',
          task.done
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-black/[0.15] dark:border-white/[0.2] hover:border-primary',
        )}
      >
        {task.done && <Check className="h-3 w-3 text-white" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] font-medium text-foreground', task.done && 'line-through')}>{task.label}</p>
        {task.done_at && (
          <p className="text-[10px] text-foreground/35">{new Date(task.done_at).toLocaleDateString('pt-BR')}</p>
        )}
      </div>

      {!task.done && hasAction && (
        <button
          onClick={() => onAction(task.task_key)}
          className="h-8 px-3 rounded-lg bg-primary/10 text-primary text-[11.5px] font-semibold hover:bg-primary/20 transition-colors flex items-center gap-1.5 shrink-0"
        >
          {Icon && <Icon className="h-3 w-3" />}
          {task.task_key === 'contrato_gerado' && 'Gerar'}
          {task.task_key === 'pagamento_configurado' && 'Configurar'}
          {task.task_key === 'sistema_criado' && 'Criar sistema'}
          {task.task_key === 'logo_aplicada' && 'Enviar imagens'}
          {task.task_key === 'dominio_conectado' && 'Conectar'}
        </button>
      )}
    </div>
  );
}

/* ── Página ─────────────────────────────────────────────────── */
export default function ClienteDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { member } = useAuth();
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

  const markTask = async (key: string) => {
    const task = tasks.find((t) => t.task_key === key);
    if (task && !task.done && member) {
      await toggle.mutateAsync({ id: task.id, done: true, userId: member.id });
    }
  };

  const activate = async () => {
    await update.mutateAsync({ id: client.id, status: 'ativo', activated_at: new Date().toISOString() });
    toast.success(`${client.company_name} está no ar! 🎉`);
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await createActivity.mutateAsync({ client_id: client.id, kind: 'nota', content: note.trim(), author_id: member?.id ?? null });
    setNote('');
  };

  const setStatus = async (status: Client['status']) => {
    await update.mutateAsync({ id: client.id, status });
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
            <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} client={client} onAction={(key) => {
                  setDialog(key);
                }} />
              ))}
            </Panel>

            {allDone && client.status === 'onboarding' && (
              <button
                onClick={activate}
                className="mt-3 w-full h-11 rounded-xl bg-emerald-500 text-white text-[13px] font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                <PartyPopper className="h-4 w-4" /> Ativar cliente — go-live concluído
              </button>
            )}
          </div>

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
                {showCreds && client.admin_email && (
                  <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.04] p-3 space-y-1.5 text-[11.5px]">
                    <button onClick={() => copyText(client.admin_email!, 'E-mail')} className="flex items-center gap-1.5 text-foreground/70 hover:text-foreground">
                      <Copy className="h-3 w-3" /> {client.admin_email}
                    </button>
                    {client.admin_password && (
                      <button onClick={() => copyText(client.admin_password!, 'Senha')} className="flex items-center gap-1.5 text-foreground/70 hover:text-foreground">
                        <Copy className="h-3 w-3" /> {client.admin_password}
                      </button>
                    )}
                  </div>
                )}
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

          {/* Contratos */}
          <div>
            <SectionHeader title="Contratos" />
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
      {dialog === 'pagamento_configurado' && (
        <PaymentDialog client={client} onDone={() => markTask('pagamento_configurado')} onClose={() => setDialog(null)} />
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
