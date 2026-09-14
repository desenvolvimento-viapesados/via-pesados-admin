import { useState } from 'react';
import { Globe, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useUpdateClient, updateCompanyBranding, uploadLogo, slugify, type Client,
} from '@/hooks/useAdmin';
import { supabase, FUNCTIONS_URL } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImageField, IMG_FIELDS, IMG_KEYS, emptyImgs, type ImgKey } from '@/components/crm/BrandingFields';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

/**
 * Identidade e domínio do cliente, fora da ficha.
 *
 * Saíram de ClienteDetalhe porque deixaram de ser só diálogo: são duas
 * etapas do onboarding, e etapa que abre um pop-up por cima dela não é
 * etapa. O corpo vive solto e o diálogo é uma casca em volta — a ficha
 * continua abrindo do jeito que abria.
 */

function normalizarDominio(v: string): string {
  return String(v ?? '').trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
}

export function CorpoDominio({ client, onDone }: { client: Client; onDone: () => void }) {
  const update = useUpdateClient();
  const [domain, setDomain] = useState(client.domain || '');
  const limpo = normalizarDominio(domain);
  /* Apex (cliente.com.br) exige registro A: a maioria dos registradores não
     aceita CNAME na raiz. Subdomínio (loja.cliente.com.br) aceita CNAME, que
     é melhor porque sobrevive a troca de IP da Vercel. Mostrar os dois sem
     dizer quando usar cada um é o que gera o suporte de meia hora. */
  const ehApex = limpo ? limpo.split('.').length <= 3 && !/^(www|loja|app|sistema)\./.test(limpo) : true;
  const [loading, setLoading] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [diag, setDiag] = useState<null | {
    passo: { codigo: string; titulo: string; dono: string | null };
    dns: { A: string[]; CNAME: string[] };
  }>(null);

  /* Conectar domínio falha de três jeitos que o cliente descreve igual —
     "não abre". Verificar antes de investigar poupa a meia hora de chute:
     ou o DNS ainda não aponta (é com ele), ou aponta e falta adicionar no
     projeto Vercel (é com você), ou já está no ar. */
  const verificar = async () => {
    const clean = normalizarDominio(domain);
    if (!clean) { toast.error('Informe o domínio'); return; }
    setVerificando(true);
    setDiag(null);
    try {
      const r = await fetch(`${FUNCTIONS_URL}/dominio-verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dominio: clean }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Não foi possível verificar');
      setDiag(d);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVerificando(false);
    }
  };

  const submit = async () => {
    /* www. sai aqui porque a resolução do tenant tira o www do hostname antes
       de consultar. Guardar 'www.cliente.com.br' faria a busca por
       'cliente.com.br' nunca casar — e o cliente veria o site genérico, sem
       erro em lugar nenhum. */
    const clean = normalizarDominio(domain);
    if (!clean) { toast.error('Informe o domínio'); return; }
    setLoading(true);
    try {
      if (client.lojista_company_id) {
        await updateCompanyBranding({ company_id: client.lojista_company_id, domains: [clean] });
      }
      await update.mutateAsync({ id: client.id, domain: clean });

      /* Adiciona na Vercel no mesmo clique. Era o passo manual invisível:
         ninguém lembrava, e o sintoma era igual ao de um DNS errado do
         cliente. Falhar aqui não desfaz o registro — só avisa que a parte
         da Vercel ficou para a mão. */
      let naVercel = '';
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const rv = await fetch(`${FUNCTIONS_URL}/vercel-dominio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
          body: JSON.stringify({ dominio: clean }),
        });
        const dv = await rv.json();
        if (dv?.ok) naVercel = dv.estado === 'ja_estava' ? ' (já estava na Vercel)' : ' e adicionado na Vercel';
        else if (dv?.estado === 'nao_configurado') naVercel = ' — falta adicionar na Vercel à mão';
        else naVercel = ` — Vercel: ${dv?.detalhe ?? 'não adicionado'}`;
      } catch {
        naVercel = ' — não consegui falar com a Vercel';
      }

      toast.success(`Domínio registrado${naVercel}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao registrar domínio');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2.5">
          <input className={inputCls} placeholder="ex: cliente.com.br" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.04] p-3 text-[11.5px] text-foreground/50 space-y-2">
            <p className="font-semibold text-foreground/70">
              O cliente cria este registro no DNS dele:
            </p>
            {(ehApex
              ? [['A', '@', '76.76.21.21']]
              : [['CNAME', limpo.split('.')[0], 'cname.vercel-dns.com']]
            ).map(([tipo, host, valor]) => (
              <div key={tipo} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-foreground/70 w-16 shrink-0">Tipo</span>
                  <span className="font-mono text-foreground flex-1">{tipo}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-foreground/70 w-16 shrink-0">Nome</span>
                  <span className="font-mono text-foreground flex-1">{host}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-foreground/70 w-16 shrink-0">Valor</span>
                  <span className="font-mono text-foreground flex-1 truncate">{valor}</span>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(valor); toast.success('Valor copiado'); }}
                    className="h-6 px-2 rounded-md border border-black/[0.1] dark:border-white/[0.12] text-[10.5px] text-foreground/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] shrink-0"
                  >
                    copiar
                  </button>
                </div>
              </div>
            ))}
            <p className="text-foreground/35 pt-0.5">
              {ehApex
                ? 'Domínio raiz usa registro A — a maioria dos registradores não aceita CNAME na raiz.'
                : 'Subdomínio usa CNAME, que continua valendo se a Vercel trocar de IP.'}
            </p>
          </div>

          <button
            type="button"
            onClick={verificar}
            disabled={verificando}
            className="w-full h-9 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-[12px] font-medium text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {verificando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Verificar em que passo está
          </button>

          {diag && (
            <div className={cn(
              'rounded-xl p-3 text-[11.5px] space-y-1.5 border',
              diag.passo.codigo === 'pronto'
                ? 'bg-emerald-500/[0.08] border-emerald-500/25 text-emerald-400/90'
                : diag.passo.dono === 'voce'
                  ? 'bg-primary/[0.08] border-primary/25 text-primary'
                  : 'bg-amber-500/[0.08] border-amber-500/25 text-amber-400/90',
            )}>
              <p className="font-semibold">{diag.passo.titulo}</p>
              {diag.passo.dono === 'voce' && (
                <p className="text-foreground/50">
                  O DNS do cliente já está certo. Falta você abrir o projeto na Vercel e
                  adicionar <span className="font-mono">{domain.trim().toLowerCase()}</span> em Domains.
                </p>
              )}
              {diag.passo.dono === 'cliente' && (
                <p className="text-foreground/50">
                  {diag.dns.A.length || diag.dns.CNAME.length
                    ? <>Hoje aponta para <span className="font-mono">{[...diag.dns.A, ...diag.dns.CNAME].slice(0, 2).join(', ')}</span>. Mande os valores acima para ele.</>
                    : <>Ou ainda não foi configurado, ou o DNS não propagou — costuma levar de minutos a algumas horas.</>}
                </p>
              )}
            </div>
          )}
          <button
            onClick={submit}
            disabled={loading}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar domínio
          </button>
    </div>
  );
}

export function DomainDialog({
  client, onDone, onClose,
}: { client: Client; onDone: () => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Conectar domínio</DialogTitle>
        </DialogHeader>
        <CorpoDominio client={client} onDone={() => { onDone(); onClose(); }} />
      </DialogContent>
    </Dialog>
  );
}

/* ── Identidade visual do cliente ───────────────────────────── */
export function CorpoIdentidade({ client, onDone }: { client: Client; onDone: () => void }) {
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
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao aplicar identidade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
        <p className="text-[11.5px] text-foreground/40">
          Aplica direto no sistema do cliente. Envie só o que tiver — o resto fica como está.
        </p>
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
  );
}

export function BrandingDialog({
  client, onDone, onClose,
}: { client: Client; onDone: () => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Identidade visual</DialogTitle>
        </DialogHeader>
        <CorpoIdentidade client={client} onDone={() => { onDone(); onClose(); }} />
      </DialogContent>
    </Dialog>
  );
}
