import { useCallback, useEffect, useState } from 'react';
import { Check, Globe, Loader2, Upload } from 'lucide-react';
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

type Diagnostico = {
  passo: { codigo: string; titulo: string; dono: string | null };
  dns: { A: string[]; CNAME: string[] };
  dns_provedor?: { nome: string | null; nameservers: string[] };
  www?: { ok: boolean };
};

/* Caminho no painel do provedor de DNS. Só entra provedor cujo caminho eu
   conferi — instrução de menu errada custa mais tempo que instrução
   nenhuma, porque manda a pessoa procurar no lugar errado com confiança. */
const CAMINHOS: Record<string, { passos: string[]; cuidado?: string }> = {
  'Registro.br': {
    passos: [
      'Domínios → clique no domínio',
      'DNS → Configurar endereçamento',
      'Modo avançado → Confirmar (o domínio fica alguns minutos em "Transição")',
      'Nova entrada → escolha o tipo, DEIXE O NOME VAZIO para a raiz, cole o valor e clique em Adicionar',
    ],
    cuidado: 'Não use "Alterar servidores DNS": aquela caixa entrega o DNS inteiro para outro provedor e derruba o e-mail do domínio junto.',
  },
};

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
  const [emLaco, setEmLaco] = useState(false);
  /* Do NOSSO lado o domínio existe? Era a metade invisível desta tela: todo
     o conteúdo falava do que o cliente faz no registrador, e o botão que
     coloca o domínio na Vercel ficava embaixo de tudo, parecendo o último
     detalhe. Deu no previsível — DNS configurado, domínio nunca registrado. */
  const [registrado, setRegistrado] = useState(!!client.domain);
  /* Os valores vêm da Vercel, não de constante nossa. 76.76.21.21 é o IP
     legado: atende, mas a conta já usa alvos por projeto, e número chumbado
     no código envelhece sem avisar — o sintoma seria domínio que não sobe,
     sem erro em lugar nenhum. A constante fica só como rede de segurança
     quando a API não responde. */
  const [alvo, setAlvo] = useState<{ ipv4: string | null; cname: string | null } | null>(null);
  /* Perguntei e não obtive resposta é diferente de ainda não perguntei. Sem
     essa distinção o fallback aparece com cara de valor confirmado — que foi
     exatamente o que aconteceu quando o endpoint estava errado. */
  const [perguntei, setPerguntei] = useState(false);
  const [erroVercel, setErroVercel] = useState<string | null>(null);

  const perguntarVercel = useCallback(async (clean: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${FUNCTIONS_URL}/vercel-dominio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ dominio: clean, acao: 'config' }),
      });
      const d = await r.json();
      setPerguntei(true);
      const erro = d?.raiz?.erro ?? d?.www?.erro ?? (d?.ok ? null : (d?.error ?? 'sem resposta'));
      setErroVercel(erro ?? null);
      if (d?.ok && (d.raiz?.ipv4 || d.raiz?.cname || d.www?.cname)) {
        setAlvo({ ipv4: d.raiz?.ipv4 ?? null, cname: d.www?.cname ?? d.raiz?.cname ?? null });
      } else {
        setAlvo(null);
      }
    } catch (e) {
      setPerguntei(true);
      setErroVercel(e instanceof Error ? e.message : 'não consegui falar com a Vercel');
    }
  }, []);
  const [diag, setDiag] = useState<null | Diagnostico>(null);

  /* Conectar domínio falha de três jeitos que o cliente descreve igual —
     "não abre". Verificar antes de investigar poupa a meia hora de chute:
     ou o DNS ainda não aponta (é com ele), ou aponta e falta adicionar no
     projeto Vercel (é com você), ou já está no ar. */
  const consultar = useCallback(async (clean: string): Promise<Diagnostico | null> => {
    const r = await fetch(`${FUNCTIONS_URL}/dominio-verificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dominio: clean }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error || 'Não foi possível verificar');
    return d as Diagnostico;
  }, []);

  /* Consulta sozinho quando o domínio para de mudar. Descobrir onde ele
     está hospedado é a primeira pergunta, e ninguém devia ter de clicar
     um botão para o sistema responder o que já sabe consultar. */
  useEffect(() => {
    if (!limpo || !limpo.includes('.')) { setDiag(null); return; }
    let vivo = true;
    const id = setTimeout(async () => {
      setVerificando(true);
      try {
        const d = await consultar(limpo);
        if (vivo) setDiag(d);
        // Em paralelo: o que a Vercel quer para este domínio.
        if (vivo) await perguntarVercel(limpo);
      }
      catch { /* silêncio: é consulta de fundo, não ação do operador */ }
      finally { if (vivo) setVerificando(false); }
    }, 700);
    return () => { vivo = false; clearTimeout(id); };
  }, [limpo, consultar, perguntarVercel]);

  /* Enquanto espera a propagação, reconsulta sozinho. Sem isso o operador
     fica apertando "verificar" de dois em dois minutos. */
  useEffect(() => {
    if (!emLaco || !limpo) return;
    const id = setInterval(async () => {
      try {
        const d = await consultar(limpo);
        setDiag(d);
        if (d?.passo.codigo === 'pronto') { setEmLaco(false); toast.success('Domínio no ar'); }
        else if (d?.passo.codigo === 'zona_sem_registro') setEmLaco(false);
      } catch { /* tenta de novo no próximo tique */ }
    }, 20000);
    return () => clearInterval(id);
  }, [emLaco, limpo, consultar]);

  const verificar = async () => {
    if (!limpo) { toast.error('Informe o domínio'); return; }
    setVerificando(true);
    try { setDiag(await consultar(limpo)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setVerificando(false); }
  };

  const provedor = diag?.dns_provedor?.nome ?? null;
  const ns = diag?.dns_provedor?.nameservers ?? [];
  const caminho = provedor ? CAMINHOS[provedor] : undefined;

  /* A raiz e o www. Mostrar só a raiz dava um site que abre em
     cliente.com.br e falha em www.cliente.com.br — e o cliente descobre
     isso depois, digitando do jeito que ele digita.

     O nome da raiz não é "@" em todo lugar: o Registro.br recusa o arroba
     com "Nome do record inválido" e espera o campo vazio. Mandar um valor
     que o painel rejeita é pior do que não mandar valor nenhum, porque a
     pessoa confia e só descobre no erro. */
  const nomeRaiz = provedor === 'Registro.br' ? '' : '@';
  /* O que a Vercel respondeu; as constantes são a rede de segurança para
     quando a API não responde, e ficam marcadas como tal na tela. */
  const ipv4 = alvo?.ipv4 ?? '76.76.21.21';
  const cname = alvo?.cname ?? 'cname.vercel-dns.com';
  const registros: string[][] = ehApex
    ? [['A', nomeRaiz, ipv4], ['CNAME', 'www', cname]]
    : [['CNAME', limpo.split('.')[0], cname]];

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

      setRegistrado(true);
      toast.success(`Domínio registrado${naVercel}`);
      /* Só conclui a etapa quando o domínio está SERVINDO. Registrado não é
         no ar: falta a propagação, e marcar como feito agora esconderia o
         que ainda não funciona. Enquanto isso, a tela reconsulta sozinha. */
      const d = await consultar(limpo).catch(() => null);
      setDiag(d);
      if (d?.passo.codigo === 'pronto') onDone();
      /* Só espera quando esperar adianta. Zona no ar sem a entrada não muda
         sozinha — ficar reconsultando daria a impressão de progresso. */
      else if (d?.passo.codigo !== 'zona_sem_registro') setEmLaco(true);
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao registrar domínio');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2.5">
          <input className={inputCls} placeholder="ex: cliente.com.br" value={domain} onChange={(e) => setDomain(e.target.value)} />

          {/* Registrar vem PRIMEIRO. É o que põe o domínio na Vercel e na
              ficha do cliente — sem isso, o DNS pode estar perfeito e o
              endereço não abre, porque a Vercel não sabe que o domínio é
              nosso. Estava no rodapé da tela, depois de tudo, e por isso
              parecia opcional. */}
          {!registrado && (
            <button
              onClick={submit}
              disabled={loading || !limpo.includes('.')}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Registrar este domínio
            </button>
          )}

          {registrado && (
            <p className="flex items-center gap-1.5 px-1 text-[11.5px] text-emerald-400">
              <Check className="h-3 w-3 shrink-0" />
              Registrado no sistema e na Vercel. Falta o cliente criar os registros abaixo.
            </p>
          )}

          {/* Quem responde pelo DNS, descoberto sozinho. Era a primeira
              pergunta de toda conexão e ninguém tinha como responder sem
              abrir o painel do cliente. */}
          {limpo.includes('.') && (
            <div className="flex items-center gap-2 px-1 text-[11.5px]">
              {verificando && !diag ? (
                <><Loader2 className="h-3 w-3 animate-spin text-foreground/40" />
                  <span className="text-foreground/40">Procurando onde este domínio está…</span></>
              ) : provedor ? (
                <><Check className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span className="text-foreground/60">
                    O DNS deste domínio é do <strong className="text-foreground/85">{provedor}</strong>
                  </span></>
              ) : diag ? (
                <span className="text-foreground/40">
                  {ns.length ? `Servidores de nome: ${ns.join(', ')}` : 'Não consegui identificar o provedor de DNS.'}
                </span>
              ) : null}
            </div>
          )}

          <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.04] p-3 text-[11.5px] text-foreground/50 space-y-2">
            <p className="font-semibold text-foreground/70">
              {registros.length > 1 ? 'O cliente cria estes dois registros no DNS dele:' : 'O cliente cria este registro no DNS dele:'}
            </p>
            {registros.map(([tipo, host, valor]) => (
              <div key={`${tipo}-${host}`} className="space-y-1 pb-1.5 border-b border-black/[0.06] dark:border-white/[0.06] last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-foreground/70 w-16 shrink-0">Tipo</span>
                  <span className="font-mono text-foreground flex-1">{tipo}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-foreground/70 w-16 shrink-0">Nome</span>
                  <span className={cn('flex-1', host ? 'font-mono text-foreground' : 'text-foreground/45 italic')}>
                    {host || 'deixe o campo vazio'}
                  </span>
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
            {perguntei && !alvo && (
              <p className="text-amber-500/80 pt-0.5">
                Estes são os valores padrão — não consegui confirmar com a Vercel
                {erroVercel ? ` (${erroVercel})` : ''}. Costumam funcionar, mas se o domínio
                não subir com eles, o problema pode ser este.
              </p>
            )}
            {alvo && (
              <p className="text-emerald-400/70 pt-0.5">
                Valores confirmados com a Vercel agora.
              </p>
            )}
            <p className="text-foreground/35 pt-0.5">
              {ehApex
                ? 'A raiz usa registro A porque a maioria dos registradores não aceita CNAME na raiz. O www usa CNAME — metade das pessoas digita o endereço com ele.'
                : 'Subdomínio usa CNAME, que continua valendo se a Vercel trocar de IP.'}
            </p>
          </div>

          {/* O caminho, não só o registro. Segue o provedor detectado: no
              Registro.br as duas caixas ficam na mesma tela e a errada
              aparece primeiro. Provedor sem caminho conferido recebe a
              orientação genérica — instrução de menu inventada manda a
              pessoa procurar no lugar errado com confiança. */}
          <details open={!!caminho} className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
            <summary className="px-3 py-2.5 text-[11.5px] font-medium text-foreground/60 cursor-pointer select-none hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
              {caminho ? `Onde fica isso no ${provedor}` : 'Onde fica isso no painel do cliente'}
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-2 text-[11.5px] text-foreground/55 leading-relaxed">
              {caminho ? (
                <>
                  {caminho.cuidado && <p className="text-amber-500/90">{caminho.cuidado}</p>}
                  <ol className="space-y-1 list-decimal pl-4">
                    {caminho.passos.map((x) => <li key={x}>{x}</li>)}
                  </ol>
                </>
              ) : (
                <p>
                  Procure por <strong className="text-foreground/75">Zona DNS</strong>,{' '}
                  <strong className="text-foreground/75">Editar DNS</strong> ou{' '}
                  <strong className="text-foreground/75">Registros</strong> — nunca por
                  "servidores DNS", que troca o provedor inteiro e derruba o e-mail do domínio junto.
                </p>
              )}
            </div>
          </details>

          <button
            type="button"
            onClick={verificar}
            disabled={verificando}
            className="w-full h-9 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-[12px] font-medium text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {(verificando || emLaco) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {emLaco ? 'Aguardando a propagação — conferindo sozinho' : 'Verificar em que passo está'}
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
              {!registrado && (
                /* O diagnóstico só falava do lado do cliente. Com o domínio
                   sem registro do nosso lado, o DNS certo não basta — e a
                   tela deixava isso invisível. */
                <p className="text-amber-400/90">
                  E deste lado: o domínio ainda não foi registrado no sistema. Use o botão acima.
                </p>
              )}
              {diag.passo.dono === 'voce' && (
                <p className="text-foreground/50">
                  O DNS do cliente já está certo. Falta você abrir o projeto na Vercel e
                  adicionar <span className="font-mono">{domain.trim().toLowerCase()}</span> em Domains.
                </p>
              )}
              {diag.passo.dono === 'cliente' && (
                <p className="text-foreground/50">
                  {diag.dns.A.length || diag.dns.CNAME.length ? (
                    <>Hoje aponta para <span className="font-mono">{[...diag.dns.A, ...diag.dns.CNAME].slice(0, 2).join(', ')}</span>. Mande os valores acima para ele.</>
                  ) : diag.passo.codigo === 'zona_sem_registro' ? (
                    /* Esperar aqui não resolve, e mandar esperar é o pior
                       conselho: a zona já responde, só não tem a entrada. */
                    <>O DNS já está respondendo — <strong className="text-foreground/75">a entrada não foi salva</strong>.
                      Volte ao painel e confira se ela aparece na lista depois de adicionar. Esperar não vai mudar isso.</>
                  ) : (
                    <>Ou ainda não foi configurado, ou o DNS não propagou — costuma levar de minutos a algumas horas.</>
                  )}
                </p>
              )}
            </div>
          )}
          {registrado && (
            /* Refazer serve quando o domínio mudou ou a Vercel recusou na
               primeira vez. Não é o caminho normal, então não tem peso de
               ação principal. */
            <button
              onClick={submit}
              disabled={loading}
              className="w-full h-9 rounded-xl text-[12px] font-medium text-foreground/40 hover:text-foreground disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Registrar de novo
            </button>
          )}
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
