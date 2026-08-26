import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Loader2, MonitorPlay, ExternalLink, Copy, Rocket, Upload,
  CheckCircle2, Eye, Trash2, Send, Sparkles, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useDemos, useCreateDemo, useUpdateDemo, useProspects, useAdvanceProspect,
  provisionCompany, deactivateCompany, updateCompanyBranding, uploadLogo, slugify, genPassword, type Demo,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { demoUrl } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge, EmptyState, SectionHeader, Panel } from '@/components/admin/ui';
import { ImageField, IMG_FIELDS, IMG_KEYS, emptyImgs, type ImgKey } from './BrandingFields';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const copyText = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copiado`);
};

const HERO_FIELDS: { key: 'hero_subtitle' | 'hero_title' | 'hero_description'; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: 'hero_subtitle',    label: 'Selo',      placeholder: 'Autoridade em Caminhões' },
  { key: 'hero_title',       label: 'Título',    placeholder: 'O caminhão certo, com quem entende do mercado' },
  { key: 'hero_description', label: 'Descrição', placeholder: 'Cada negociação é conduzida com transparência, agilidade e o cuidado de quem realmente entende do que está vendendo.', multiline: true },
];

const emptyForm = {
  prospect_id: '', company_name: '', contact_name: '', primary_color: '#E36C0A', notes: '',
  hero_subtitle: '', hero_title: '', hero_description: '',
};

/** Cria ou edita uma amostra. Editando, o que já estiver no ar é atualizado junto. */
function DemoDialog({
  open, onClose, defaultProspectId, demo,
}: {
  open: boolean;
  onClose: () => void;
  defaultProspectId?: string | null;
  demo?: Demo | null;
}) {
  const { member } = useAuth();
  const create = useCreateDemo();
  const update = useUpdateDemo();
  const advance = useAdvanceProspect();
  const { data: prospects = [] } = useProspects();

  const editando = !!demo;
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState<Record<ImgKey, File | null>>(emptyImgs<File | null>(null));
  const [previews, setPreviews] = useState<Record<ImgKey, string | null>>(emptyImgs<string | null>(null));
  const [saving, setSaving] = useState(false);

  // Abrir o diálogo carrega o estado: da amostra em edição, ou do prospect.
  useEffect(() => {
    if (!open) return;
    if (demo) {
      setForm({
        prospect_id: demo.prospect_id ?? '',
        company_name: demo.company_name,
        contact_name: demo.contact_name ?? '',
        primary_color: demo.primary_color ?? '#E36C0A',
        notes: demo.notes ?? '',
        hero_subtitle: demo.hero_subtitle ?? '',
        hero_title: demo.hero_title ?? '',
        hero_description: demo.hero_description ?? '',
      });
      setPreviews({
        site_logo: demo.site_logo_url,
        logo: demo.logo_url,
        brand_icon: demo.brand_icon_url,
        banner: demo.banner_url,
        favicon: demo.favicon_url,
      });
      setFiles(emptyImgs<File | null>(null));
      return;
    }
    const p = prospects.find((x) => x.id === defaultProspectId);
    setForm({
      ...emptyForm,
      prospect_id: defaultProspectId ?? '',
      company_name: p?.company_name ?? '',
      contact_name: p?.contact_name ?? '',
    });
    setPreviews(emptyImgs<string | null>(null));
    setFiles(emptyImgs<File | null>(null));
  }, [open, demo?.id, defaultProspectId, prospects.length]);

  const handleProspect = (id: string) => {
    const p = prospects.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      prospect_id: id,
      company_name: f.company_name || p?.company_name || '',
      contact_name: f.contact_name || p?.contact_name || '',
    }));
  };

  const setImage = (key: ImgKey, file: File | null) => {
    setPreviews((prev) => ({ ...prev, [key]: file ? URL.createObjectURL(file) : null }));
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const submit = async () => {
    if (!form.company_name.trim()) { toast.error('Informe o nome da empresa'); return; }
    setSaving(true);
    try {
      const slug = demo?.slug ?? slugify(form.company_name);

      // Só sobe o que mudou; o que já estava fica.
      const urls: Partial<Record<ImgKey, string>> = {};
      for (const key of IMG_KEYS) {
        const file = files[key];
        if (file) urls[key] = await uploadLogo(file, `demo-${slug}-${key}`);
      }

      const campos = {
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || null,
        primary_color: form.primary_color,
        notes: form.notes || null,
        hero_subtitle: form.hero_subtitle.trim() || null,
        hero_title: form.hero_title.trim() || null,
        hero_description: form.hero_description.trim() || null,
      };

      if (editando && demo) {
        await update.mutateAsync({
          id: demo.id,
          ...campos,
          ...(urls.site_logo  ? { site_logo_url: urls.site_logo }   : {}),
          ...(urls.logo       ? { logo_url: urls.logo }             : {}),
          ...(urls.brand_icon ? { brand_icon_url: urls.brand_icon } : {}),
          ...(urls.banner     ? { banner_url: urls.banner }         : {}),
          ...(urls.favicon    ? { favicon_url: urls.favicon }       : {}),
        });

        // Já provisionada: o sistema no ar acompanha a edição.
        if (demo.lojista_company_id) {
          await updateCompanyBranding({
            company_id: demo.lojista_company_id,
            company_name: campos.company_name,
            contact_name: campos.contact_name ?? undefined,
            hero_subtitle: campos.hero_subtitle ?? undefined,
            hero_title: campos.hero_title ?? undefined,
            hero_description: campos.hero_description ?? undefined,
            logo_url: urls.logo,
            site_logo_url: urls.site_logo,
            brand_icon_url: urls.brand_icon,
            banner_url: urls.banner,
            favicon_url: urls.favicon,
          });
        }
        toast.success(demo.lojista_company_id ? 'Amostra atualizada e aplicada no sistema' : 'Amostra atualizada');
      } else {
        await create.mutateAsync({
          prospect_id: form.prospect_id || null,
          slug,
          ...campos,
          site_logo_url: urls.site_logo ?? null,
          logo_url: urls.logo ?? null,
          brand_icon_url: urls.brand_icon ?? null,
          banner_url: urls.banner ?? null,
          favicon_url: urls.favicon ?? null,
          created_by: member?.id ?? null,
        });

        const prospect = prospects.find((x) => x.id === form.prospect_id);
        if (prospect) {
          await advance.mutateAsync({ id: prospect.id, from: prospect.stage, to: 'amostra' });
        }
        toast.success('Amostra criada — provisione para gerar o sistema');
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao salvar amostra');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">
            {editando ? 'Editar amostra' : 'Nova amostra'}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11.5px] text-foreground/40 -mt-1">
          {editando
            ? 'O que estiver provisionado é atualizado junto. Deixe em branco o que não quiser trocar.'
            : 'Um sistema de demonstração já com a identidade visual do prospect, pronto para a reunião.'}
        </p>

        <div className="space-y-2.5 pt-1">
          {!editando && (
            <select className={inputCls} value={form.prospect_id} onChange={(e) => handleProspect(e.target.value)}>
              <option value="">Vincular a um prospect (opcional)…</option>
              {prospects.filter((p) => !['ganho', 'perdido'].includes(p.stage)).map((p) => (
                <option key={p.id} value={p.id}>{p.company_name}</option>
              ))}
            </select>
          )}

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

          {/* Textos do banner */}
          <div className="pt-2 space-y-2.5 border-t border-black/[0.06] dark:border-white/[0.06]">
            <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30">
              Textos do banner
            </p>
            {HERO_FIELDS.map(({ key, label, placeholder, multiline }) => (
              <div key={key}>
                <p className="text-[11px] text-foreground/50 mb-1">{label}</p>
                {multiline ? (
                  <textarea
                    className={cn(inputCls, 'h-16 py-2 resize-none')}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                ) : (
                  <input
                    className={inputCls}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            <p className="text-[10px] text-foreground/30 leading-snug">
              Em branco, entra o texto padrão mostrado em cada campo.
            </p>
          </div>

          {/* Identidade visual */}
          <div className="pt-2 space-y-3 border-t border-black/[0.06] dark:border-white/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30">
                Identidade visual
              </p>
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <span className="text-[10.5px] text-foreground/40">Cor da marca</span>
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                  className="h-7 w-7 rounded-md border border-black/[0.1] dark:border-white/[0.1] bg-transparent cursor-pointer"
                />
              </label>
            </div>

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
            {editando ? 'Salvar alterações' : 'Criar amostra'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DemoCard({ demo, onEdit }: { demo: Demo; onEdit: (d: Demo) => void }) {
  const update = useUpdateDemo();
  const [provisioning, setProvisioning] = useState(false);

  const provision = async () => {
    setProvisioning(true);
    try {
      const slug = `demo-${demo.slug}`;
      const email = `${slug}@viapesados.com.br`;
      const password = genPassword();
      const provisioned = await provisionCompany({
        company_name: demo.company_name,
        company_slug: slug,
        admin_email: email,
        admin_password: password,
        admin_full_name: demo.contact_name || `Demo ${demo.company_name}`,
        logo_url: demo.logo_url ?? undefined,
        site_logo_url: demo.site_logo_url ?? undefined,
        brand_icon_url: demo.brand_icon_url ?? undefined,
        banner_url: demo.banner_url ?? undefined,
        favicon_url: demo.favicon_url ?? undefined,
        contact_name: demo.contact_name ?? undefined,
        hero_subtitle: demo.hero_subtitle ?? undefined,
        hero_title: demo.hero_title ?? undefined,
        hero_description: demo.hero_description ?? undefined,
      });

      // O slug pode ter mudado: repetir uma amostra da mesma empresa gera
      // "demo-x-2". A URL precisa acompanhar, senão aponta para a antiga.
      const usedSlug = provisioned.company_slug.replace(/^demo-/, '');

      await update.mutateAsync({
        id: demo.id,
        status: 'provisionada',
        slug: usedSlug,
        lojista_company_id: provisioned.company_id,
        admin_email: provisioned.admin_email,
        admin_password: password,
        demo_url: demoUrl(usedSlug),
      });
      toast.success('Sistema de demonstração criado!');
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao provisionar');
    } finally {
      setProvisioning(false);
    }
  };

  const setStatus = async (status: Demo['status']) => {
    try {
      // Descartar precisa tirar a empresa do ar: senão o link continua
      // funcionando e o slug segue ocupado.
      if (status === 'descartada' && demo.lojista_company_id) {
        await deactivateCompany(demo.lojista_company_id);
      }
      await update.mutateAsync({ id: demo.id, status });
      toast.success(status === 'descartada' ? 'Amostra descartada e tirada do ar' : 'Status atualizado');
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao atualizar');
    }
  };

  const link = demo.demo_url ?? demoUrl(demo.slug);
  const noAr = demo.status !== 'rascunho';

  return (
    <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] overflow-hidden flex flex-col">
      <div
        className="h-28 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${demo.primary_color ?? '#E36C0A'}18, transparent 70%)` }}
      >
        <span className="absolute top-3 left-3 h-2.5 w-2.5 rounded-full" style={{ background: demo.primary_color ?? '#E36C0A' }} />
        <div className="absolute top-2.5 right-2.5"><StatusBadge status={demo.status} /></div>
        {demo.logo_url || demo.site_logo_url ? (
          <img src={(demo.logo_url || demo.site_logo_url)!} alt="" className="max-h-16 max-w-[70%] object-contain" />
        ) : (
          <p className="text-[18px] font-bold tracking-tight" style={{ color: demo.primary_color ?? '#E36C0A' }}>
            {demo.company_name}
          </p>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-foreground leading-tight truncate">{demo.company_name}</p>
            <p className="text-[10.5px] text-foreground/35 mt-0.5 truncate">
              {new Date(demo.created_at).toLocaleDateString('pt-BR')}
              {demo.contact_name ? ` · ${demo.contact_name}` : ''}
            </p>
          </div>
          <button
            onClick={() => onEdit(demo)}
            title="Editar amostra"
            className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground/35 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

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

          {noAr && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => copyText(link, 'Link da amostra')}
                className="h-9 rounded-xl border border-black/[0.1] dark:border-white/[0.1] text-[11.5px] font-medium text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" /> Copiar link
              </button>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 rounded-xl bg-violet-500/15 text-violet-400 text-[11.5px] font-semibold hover:bg-violet-500/25 transition-colors flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </a>
            </div>
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
  const [editing, setEditing] = useState<Demo | null>(null);

  const active = demos.filter((d) => d.status !== 'descartada');

  /** Chegou na etapa Amostra e ainda não tem demo montada. */
  const pending = useMemo(() => {
    const withDemo = new Set(demos.map((d) => d.prospect_id).filter(Boolean) as string[]);
    return prospects.filter((p) => p.stage === 'amostra' && !withDemo.has(p.id));
  }, [prospects, demos]);

  const closeDialog = () => { setCreateFor(null); setEditing(null); onCloseNew(); };

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
            {active.map((d) => <DemoCard key={d.id} demo={d} onEdit={setEditing} />)}
          </div>
        </div>
      ) : null}

      <DemoDialog
        open={newOpen || !!createFor || !!editing}
        onClose={closeDialog}
        defaultProspectId={createFor ?? defaultProspectId}
        demo={editing}
      />
    </div>
  );
}
