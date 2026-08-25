import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Loader2, MonitorPlay, ExternalLink, Copy, Rocket, Upload,
  CheckCircle2, Eye, Trash2, KeyRound, Send, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useDemos, useCreateDemo, useUpdateDemo, useProspects, useAdvanceProspect,
  provisionCompany, uploadLogo, slugify, genPassword, type Demo,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { demoUrl } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge, EmptyState, SectionHeader, Panel } from '@/components/admin/ui';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const copyText = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copiado`);
};

function NewDemoDialog({
  open, onClose, defaultProspectId,
}: {
  open: boolean;
  onClose: () => void;
  defaultProspectId?: string | null;
}) {
  const { member } = useAuth();
  const create = useCreateDemo();
  const advance = useAdvanceProspect();
  const { data: prospects = [] } = useProspects();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ prospect_id: defaultProspectId ?? '', company_name: '', contact_name: '', primary_color: '#E36C0A', notes: '' });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!defaultProspectId) return;
    const p = prospects.find((x) => x.id === defaultProspectId);
    setForm((f) => ({
      ...f,
      prospect_id: defaultProspectId,
      company_name: f.company_name || p?.company_name || '',
      contact_name: f.contact_name || p?.contact_name || '',
    }));
  }, [defaultProspectId, prospects]);

  const handleProspect = (id: string) => {
    const p = prospects.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      prospect_id: id,
      company_name: f.company_name || p?.company_name || '',
      contact_name: f.contact_name || p?.contact_name || '',
    }));
  };

  const handleLogo = (file: File | null) => {
    setLogoFile(file);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  };

  const submit = async () => {
    if (!form.company_name.trim()) { toast.error('Informe o nome da empresa'); return; }
    setSaving(true);
    try {
      let logo_url: string | null = null;
      const slug = slugify(form.company_name);
      if (logoFile) logo_url = await uploadLogo(logoFile, `demo-${slug}`);
      await create.mutateAsync({
        prospect_id: form.prospect_id || null,
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || null,
        slug,
        logo_url,
        primary_color: form.primary_color,
        notes: form.notes || null,
        created_by: member?.id ?? null,
      });
      const prospect = prospects.find((x) => x.id === form.prospect_id);
      if (prospect) {
        await advance.mutateAsync({ id: prospect.id, from: prospect.stage, to: 'amostra' });
      }
      toast.success('Amostra criada — provisione para gerar o sistema');
      setForm({ prospect_id: '', company_name: '', contact_name: '', primary_color: '#E36C0A', notes: '' });
      handleLogo(null);
      onClose();
    } catch {
      toast.error('Erro ao criar amostra');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Nova amostra</DialogTitle>
        </DialogHeader>
        <p className="text-[11.5px] text-foreground/40 -mt-1">
          Um sistema de demonstração com a identidade visual do prospect, pronto para a reunião de vendas.
        </p>

        <div className="space-y-2.5 pt-1">
          <select className={inputCls} value={form.prospect_id} onChange={(e) => handleProspect(e.target.value)}>
            <option value="">Vincular a um prospect (opcional)…</option>
            {prospects.filter((p) => !['ganho', 'perdido'].includes(p.stage)).map((p) => (
              <option key={p.id} value={p.id}>{p.company_name}</option>
            ))}
          </select>

          <input
            className={inputCls}
            placeholder="Nome da empresa na amostra *"
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
          />

          <div>
            <input
              className={inputCls}
              placeholder="Quem vai receber (nome da pessoa)"
              value={form.contact_name}
              onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
            />
            <p className="text-[10.5px] text-foreground/35 mt-1 px-1">
              A amostra abre com “Bem-vindo, {form.contact_name.trim().split(' ')[0] || '<nome>'}”.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="h-16 w-16 rounded-xl border border-dashed border-black/[0.15] dark:border-white/[0.15] flex items-center justify-center overflow-hidden hover:border-primary/50 transition-colors shrink-0 bg-black/[0.02] dark:bg-white/[0.03]"
            >
              {logoPreview
                ? <img src={logoPreview} alt="" className="h-full w-full object-contain p-1" />
                : <Upload className="h-4 w-4 text-foreground/30" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleLogo(e.target.files?.[0] ?? null)} />
            <div className="flex-1">
              <p className="text-[12px] text-foreground/60 font-medium">Logo do prospect</p>
              <p className="text-[10.5px] text-foreground/35">Aparece no sistema de demonstração</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer shrink-0">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                className="h-9 w-9 rounded-lg border border-black/[0.1] dark:border-white/[0.1] bg-transparent cursor-pointer"
              />
              <span className="text-[10.5px] text-foreground/40">Cor</span>
            </label>
          </div>

          <textarea
            className={cn(inputCls, 'h-16 py-2 resize-none')}
            placeholder="Observações"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />

          <button
            onClick={submit}
            disabled={saving}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar amostra
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DemoCard({ demo }: { demo: Demo }) {
  const update = useUpdateDemo();
  const [provisioning, setProvisioning] = useState(false);
  const [showCreds, setShowCreds] = useState(false);

  const provision = async () => {
    setProvisioning(true);
    try {
      const slug = `demo-${demo.slug}`;
      const email = `${slug}@viapesados.com.br`;
      const password = genPassword();
      const { company_id } = await provisionCompany({
        company_name: demo.company_name,
        company_slug: slug,
        admin_email: email,
        admin_password: password,
        admin_full_name: `Demo ${demo.company_name}`,
        logo_url: demo.logo_url ?? undefined,
        contact_name: demo.contact_name ?? undefined,
      });
      await update.mutateAsync({
        id: demo.id,
        status: 'provisionada',
        lojista_company_id: company_id,
        admin_email: email,
        admin_password: password,
        demo_url: demoUrl(demo.slug),
      });
      toast.success('Sistema de demonstração criado!');
      setShowCreds(true);
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao provisionar');
    } finally {
      setProvisioning(false);
    }
  };

  const setStatus = async (status: Demo['status']) => {
    try {
      await update.mutateAsync({ id: demo.id, status });
      toast.success('Status atualizado');
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const hasCreds = !!demo.admin_email;

  return (
    <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] overflow-hidden flex flex-col">
      <div
        className="h-28 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${demo.primary_color ?? '#E36C0A'}18, transparent 70%)` }}
      >
        <span className="absolute top-3 left-3 h-2.5 w-2.5 rounded-full" style={{ background: demo.primary_color ?? '#E36C0A' }} />
        <div className="absolute top-2.5 right-2.5"><StatusBadge status={demo.status} /></div>
        {demo.logo_url ? (
          <img src={demo.logo_url} alt="" className="max-h-16 max-w-[70%] object-contain" />
        ) : (
          <p className="text-[18px] font-bold tracking-tight" style={{ color: demo.primary_color ?? '#E36C0A' }}>
            {demo.company_name}
          </p>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <p className="text-[13.5px] font-semibold text-foreground leading-tight">{demo.company_name}</p>
          <p className="text-[10.5px] text-foreground/35 mt-0.5">
            {new Date(demo.created_at).toLocaleDateString('pt-BR')}{demo.notes ? ` · ${demo.notes}` : ''}
          </p>
        </div>

        {hasCreds && showCreds && (
          <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.04] p-3 space-y-1.5 text-[11.5px]">
            <button onClick={() => copyText(demo.admin_email!, 'E-mail')} className="flex items-center gap-1.5 text-foreground/70 hover:text-foreground w-full">
              <Copy className="h-3 w-3 shrink-0" /> <span className="truncate">{demo.admin_email}</span>
            </button>
            <button onClick={() => copyText(demo.admin_password!, 'Senha')} className="flex items-center gap-1.5 text-foreground/70 hover:text-foreground w-full">
              <Copy className="h-3 w-3 shrink-0" /> <span>{demo.admin_password}</span>
            </button>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-1.5">
          {demo.status === 'rascunho' && (
            <button
              onClick={provision}
              disabled={provisioning}
              className="h-9 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {provisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              Provisionar sistema
            </button>
          )}

          {hasCreds && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setShowCreds((v) => !v)}
                className="h-9 rounded-xl border border-black/[0.1] dark:border-white/[0.1] text-[11.5px] font-medium text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-1.5"
              >
                <KeyRound className="h-3.5 w-3.5" /> Acesso
              </button>
              <a
                href={demo.demo_url ?? demoUrl(demo.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 rounded-xl bg-violet-500/15 text-violet-400 text-[11.5px] font-semibold hover:bg-violet-500/25 transition-colors flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir sistema
              </a>
            </div>
          )}

          {hasCreds && (
            <button
              onClick={() => copyText(
                `Sistema ${demo.company_name}\n${demo.demo_url ?? demoUrl(demo.slug)}\n\nAcesso: ${demo.admin_email}\nSenha: ${demo.admin_password}`,
                'Acesso completo',
              )}
              className="h-8 rounded-xl text-[11.5px] font-medium text-foreground/50 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-1.5"
            >
              <Send className="h-3 w-3" /> Copiar link + acesso
            </button>
          )}

          {demo.status === 'provisionada' && (
            <button
              onClick={() => setStatus('apresentada')}
              className="h-8 rounded-xl text-[11.5px] font-medium text-violet-400/80 hover:bg-violet-500/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <Eye className="h-3.5 w-3.5" /> Marcar como apresentada
            </button>
          )}

          {demo.status === 'apresentada' && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setStatus('descartada')}
                className="h-8 rounded-xl text-[11.5px] font-medium text-foreground/40 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-3 w-3" /> Descartar
              </button>
              <button
                onClick={() => setStatus('convertida')}
                className="h-8 rounded-xl text-[11.5px] font-semibold text-emerald-500 hover:bg-emerald-500/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="h-3 w-3" /> Convertida
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AmostrasTab({
  newOpen, onCloseNew, defaultProspectId,
}: {
  newOpen: boolean;
  onCloseNew: () => void;
  defaultProspectId?: string | null;
}) {
  const { data: demos = [], isLoading } = useDemos();
  const { data: prospects = [] } = useProspects();
  const [createFor, setCreateFor] = useState<string | null>(null);

  const active = demos.filter((d) => d.status !== 'descartada');

  /** Chegou na etapa Amostra e ainda não tem demo montada. */
  const pending = useMemo(() => {
    const withDemo = new Set(demos.map((d) => d.prospect_id).filter(Boolean) as string[]);
    return prospects.filter((p) => p.stage === 'amostra' && !withDemo.has(p.id));
  }, [prospects, demos]);

  const closeDialog = () => { setCreateFor(null); onCloseNew(); };

  return (
    <div className="flex flex-col gap-7">
      {/* Fila: quem entrou na etapa e falta montar a amostra */}
      {pending.length > 0 && (
        <div>
          <SectionHeader title={`Aguardando amostra · ${pending.length}`} />
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden border-violet-400/25">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="h-8 w-8 rounded-full bg-violet-500/15 text-violet-400 text-[12px] font-bold flex items-center justify-center shrink-0">
                  {p.company_name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate">{p.company_name}</p>
                  <p className="text-[11px] text-foreground/40 truncate">
                    Montar o sistema com a identidade visual deste cliente
                  </p>
                </div>
                <button
                  onClick={() => setCreateFor(p.id)}
                  className="h-8 px-3 rounded-lg bg-violet-500/15 text-violet-400 text-[11.5px] font-semibold hover:bg-violet-500/25 transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Criar amostra
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
      ) : active.length === 0 && pending.length === 0 ? (
        <EmptyState
          icon={<MonitorPlay />}
          title="Nenhuma amostra criada"
          sub="Mova um prospect para a etapa Amostra no funil — ele aparece aqui"
        />
      ) : active.length > 0 ? (
        <div>
          {pending.length > 0 && <SectionHeader title="Amostras montadas" />}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map((d) => <DemoCard key={d.id} demo={d} />)}
          </div>
        </div>
      ) : null}

      <NewDemoDialog
        open={newOpen || !!createFor}
        onClose={closeDialog}
        defaultProspectId={createFor ?? defaultProspectId}
      />
    </div>
  );
}
