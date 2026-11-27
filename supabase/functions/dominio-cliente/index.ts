import { ehIpCloudflare, QUALQUER_VALOR } from '../_shared/robo-regras.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * A página de conexão de domínio do lojista (23/11/2026, pedido do dono: "a
 * conexão de domínio facilitada, como a da Lovable").
 *
 * PÚBLICA: quem autentica é o token do link (clients.checkout_token, o mesmo do
 * link de pagamento). Ações:
 *   estado    → nome da loja e o domínio que já está na ficha
 *   preparar  → põe o domínio (raiz e www) no projeto da Vercel, lê o que o domínio
 *               tem hoje e devolve o plano: o que apagar, o que manter (e-mail!) e
 *               o que criar, com o caminho no painel de quem cuida do DNS
 *   verificar → confere se já está no ar; no ar, grava o domínio na loja (projeto
 *               do lojista, função dominio-gravar), na ficha e fecha a etapa
 *
 * Nunca apaga nada no DNS do cliente: só diz o que ele apaga. E nunca tira
 * domínio de outra loja.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const API = 'https://api.vercel.com';
const LOJISTA = 'https://ljjkerbczuwmxdbnxfes.supabase.co/functions/v1';
const PROPRIO = 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1';

/* Quem cuida do DNS, pelos servidores de nome (a mesma lista do dominio-verificar). */
const PROVEDORES: Array<[RegExp, string]> = [
  [/\.dns\.br$/i, 'Registro.br'],
  [/vercel-dns\.com$/i, 'Vercel'],
  [/cloudflare\.com$/i, 'Cloudflare'],
  [/(hostgator\.com|websitewelcome\.com)$/i, 'HostGator'],
  [/locaweb\.com\.br$/i, 'Locaweb'],
  [/uol(host)?\.com\.br$/i, 'UOL Host'],
  [/kinghost\.net$/i, 'KingHost'],
  [/(hostinger\.com|dns-parking\.com)$/i, 'Hostinger'],
  [/domaincontrol\.com$/i, 'GoDaddy'],
  [/registrar-servers\.com$/i, 'Namecheap'],
  [/awsdns/i, 'AWS Route 53'],
  [/wixdns\.net$/i, 'Wix'],
];

/* Onde se mexe no DNS, em cada lugar. Só entra caminho conferido; o resto cai no genérico. */
const PAINEL: Record<string, { link: string; passos: string[]; raiz: string; cuidado?: string }> = {
  'Registro.br': {
    link: 'https://registro.br/painel/',
    raiz: '(deixe o nome vazio)',
    passos: [
      'Entre na sua conta e clique no domínio.',
      'Na parte de DNS, clique em "Configurar endereçamento" (se aparecer "Modo avançado", confirme).',
      'Apague as entradas da lista "Apagar" abaixo (lixeira ao lado de cada uma).',
      'Clique em "Nova entrada" para cada item de "Criar": escolha o tipo, deixe o nome vazio para o endereço principal, cole o valor e adicione.',
      'Clique em "Salvar alterações".',
    ],
    cuidado: 'Não use "Alterar servidores DNS": isso troca o DNS inteiro e pode derrubar o seu e-mail.',
  },
  GoDaddy: {
    link: 'https://dcc.godaddy.com/control/portfolio',
    raiz: '@',
    passos: [
      'Entre na sua conta, clique no domínio e depois em "DNS".',
      'Se houver "Encaminhamento" (Forwarding) ligado, desligue.',
      'Apague os registros da lista "Apagar" abaixo.',
      'Clique em "Adicionar novo registro" para cada item de "Criar" e salve.',
    ],
  },
  Hostinger: {
    link: 'https://hpanel.hostinger.com/domains',
    raiz: '@',
    passos: [
      'Entre na sua conta, clique no domínio e em "DNS / Servidores de nomes".',
      'Apague os registros da lista "Apagar" abaixo (inclusive um ALIAS na raiz, se houver).',
      'Adicione cada item de "Criar" e salve.',
    ],
  },
  Cloudflare: {
    link: 'https://dash.cloudflare.com/',
    raiz: '@',
    passos: [
      'Entre na sua conta, clique no domínio e em "DNS" → "Records".',
      'Apague os registros da lista "Apagar" abaixo.',
      'Adicione cada item de "Criar" com a nuvem laranja DESLIGADA ("DNS only") e salve.',
    ],
  },
};
const GENERICO = {
  link: '',
  raiz: '@',
  passos: [
    'Entre no painel onde o seu domínio é administrado e abra a parte de DNS (às vezes chamada "Zona DNS" ou "Gerenciar DNS").',
    'Apague os registros da lista "Apagar" abaixo.',
    'Adicione cada item de "Criar" e salve.',
  ],
};

const limpar = (v: unknown) => String(v ?? '').trim().toLowerCase()
  .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').replace(/\.$/, '');

const CODIGO: Record<string, number> = { A: 1, AAAA: 28, CNAME: 5, MX: 15, TXT: 16, SOA: 6 };
async function doh(nome: string, tipo: keyof typeof CODIGO): Promise<string[]> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(nome)}&type=${tipo}`, {
      headers: { accept: 'application/dns-json' },
    });
    const j = await r.json();
    return (j?.Answer ?? []).filter((a: { type: number }) => a.type === CODIGO[tipo])
      .map((a: { data: string }) => String(a.data).replace(/\.$/, '').replace(/^"|"$/g, ''));
  } catch { return []; }
}

async function nameservers(d: string): Promise<string[]> {
  const base = d.endsWith('.br') ? 'https://rdap.registro.br' : 'https://rdap.org';
  try {
    const r = await fetch(`${base}/domain/${encodeURIComponent(d)}`, { redirect: 'follow' });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.nameservers ?? []).map((n: { ldhName?: string }) => String(n.ldhName ?? '').toLowerCase()).filter(Boolean);
  } catch { return []; }
}

/* ── Vercel ───────────────────────────────────────────────── */
async function vercel() {
  const token = Deno.env.get('VERCEL_TOKEN');
  if (!token) return null;
  const time = Deno.env.get('VERCEL_TEAM_ID');
  const q = time ? `?teamId=${time}` : '';
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let projeto = Deno.env.get('VERCEL_PROJECT_ID') ?? '';
  if (!projeto) {
    const lista = await (await fetch(`${API}/v9/projects${q}`, { headers: h })).json();
    projeto = (lista?.projects ?? []).find((p: { alias?: Array<{ domain: string }> }) =>
      (p.alias ?? []).some((a) => a.domain?.endsWith('viapesados.com.br')))?.id ?? '';
  }
  return projeto ? { q, h, projeto } : null;
}

async function adicionarNaVercel(v: NonNullable<Awaited<ReturnType<typeof vercel>>>, nome: string) {
  const r = await fetch(`${API}/v10/projects/${v.projeto}/domains${v.q}`, {
    method: 'POST', headers: v.h, body: JSON.stringify({ name: nome }),
  });
  const d = await r.json();
  return r.ok || r.status === 409 || d?.error?.code === 'domain_already_in_use';
}

/* A Vercel só marca `verified` quando o domínio é nosso NESTE projeto: domínio
   que já está em outra conta da Vercel pede TXT de posse e fica `false`.
   É a prova que faltava antes de gravar o domínio na loja (auditoria 27/11). */
async function verificadoNaVercel(v: NonNullable<Awaited<ReturnType<typeof vercel>>>, nome: string) {
  try {
    const r = await fetch(`${API}/v9/projects/${v.projeto}/domains/${encodeURIComponent(nome)}${v.q}`, { headers: v.h });
    if (!r.ok) return false;
    return (await r.json())?.verified === true;
  } catch { return false; }
}

async function alvoDaVercel(v: NonNullable<Awaited<ReturnType<typeof vercel>>>, nome: string) {
  const valores = (lista: unknown): string[] => {
    if (!Array.isArray(lista)) return [];
    const item = lista.find((x: { rank?: number }) => x?.rank === 1) ?? lista[0];
    const val = (item as { value?: unknown })?.value;
    return (Array.isArray(val) ? val : val == null ? [] : [val]).map((x) => String(x).trim().replace(/\.$/, '')).filter(Boolean);
  };
  try {
    const c = await (await fetch(`${API}/v6/domains/${nome}/config${v.q}`, { headers: v.h })).json();
    return { ipv4: valores(c?.recommendedIPv4), cname: valores(c?.recommendedCNAME) };
  } catch { return { ipv4: [], cname: [] }; }
}

/* ── o cliente do link ────────────────────────────────────── */
// deno-lint-ignore no-explicit-any
type Db = any;
async function clienteDoToken(db: Db, token: string) {
  if (!token || token.length < 16) return null;
  const { data } = await db.from('clients')
    .select('id, company_name, contact_name, domain, lojista_company_id, frente')
    .eq('checkout_token', token).maybeSingle();
  return data ?? null;
}

async function gravarNaLoja(companyId: string, dominio: string, checar = false) {
  const segredo = Deno.env.get('DOMINIO_SEGREDO') ?? '';
  const r = await fetch(`${LOJISTA}/dominio-gravar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dominio-segredo': segredo },
    body: JSON.stringify({ company_id: companyId, dominio, checar }),
  });
  return await r.json().catch(() => ({ ok: false }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { token, acao, dominio } = await req.json().catch(() => ({}));
    const c = await clienteDoToken(db, String(token ?? ''));
    if (!c) return json(404, { error: 'Link inválido ou vencido. Peça um novo para a equipe do Via Pesados.' });
    if (!c.lojista_company_id) return json(400, { error: 'O sistema da sua loja ainda está sendo montado. Assim que ficar pronto, este link funciona.' });

    if (acao === 'estado') {
      return json(200, { ok: true, empresa: c.company_name, contato: c.contact_name, dominio: c.domain });
    }

    const d = limpar(dominio);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return json(400, { error: 'Digite só o endereço, por exemplo: minhaloja.com.br' });

    /* O domínio que a equipe já gravou na ficha manda: o link não troca por outro. */
    const daFicha = c.domain ? limpar(String(c.domain)).replace(/^www\./, '') : '';
    if (daFicha && d.replace(/^www\./, '') !== daFicha) {
      return json(409, { error: `Este link é para o domínio ${daFicha}. Para outro endereço, fale com a equipe do Via Pesados.` });
    }

    if (acao === 'preparar') {
      const alheio = await gravarNaLoja(c.lojista_company_id, d, true);
      if (alheio?.de_outra_loja) return json(409, { error: 'Este domínio já está ligado a outra loja. Fale com a equipe do Via Pesados.' });

      const v = await vercel();
      if (!v) return json(500, { error: 'Não consegui preparar o nosso lado agora. Tente de novo em instantes.' });
      await adicionarNaVercel(v, d);
      await adicionarNaVercel(v, `www.${d}`);
      const [alvoRaiz, alvoWww] = await Promise.all([alvoDaVercel(v, d), alvoDaVercel(v, `www.${d}`)]);
      const ipv4 = alvoRaiz.ipv4.length ? alvoRaiz.ipv4 : ['76.76.21.21'];
      const cname = alvoWww.cname[0] ?? 'cname.vercel-dns.com';

      const [ns, a, aaaa, cn, mx, txt, wwwA, wwwC, soa] = await Promise.all([
        nameservers(d), doh(d, 'A'), doh(d, 'AAAA'), doh(d, 'CNAME'), doh(d, 'MX'), doh(d, 'TXT'),
        doh(`www.${d}`, 'A'), doh(`www.${d}`, 'CNAME'), doh(d, 'SOA'),
      ]);
      const provedor = PROVEDORES.find(([re]) => ns.some((n) => re.test(n)))?.[1] ?? null;
      const painel = (provedor && PAINEL[provedor]) || GENERICO;
      const raiz = painel.raiz;

      type Reg = { tipo: string; nome: string; valor: string };
      const apagar: Reg[] = [];
      const criar: Reg[] = [];
      const manter: Reg[] = [];
      /* Na raiz: tudo que não é nosso sai; o que é nosso e já está lá não se repete. */
      /* Cloudflare com proxy: o que a internet vê são os IPs da Cloudflare; o valor real só
         aparece no painel. Apaga-se pelo nome (A, AAAA e CNAME), qualquer valor. */
      const proxyRaiz = provedor === 'Cloudflare' && [...a, ...aaaa].some(ehIpCloudflare);
      const proxyWww = provedor === 'Cloudflare' && wwwA.some(ehIpCloudflare);
      if (proxyRaiz) for (const tipo of ['A', 'AAAA', 'CNAME']) apagar.push({ tipo, nome: raiz, valor: QUALQUER_VALOR });
      else {
        for (const ip of a) if (!ipv4.includes(ip)) apagar.push({ tipo: 'A', nome: raiz, valor: ip });
        for (const ip of aaaa) apagar.push({ tipo: 'AAAA', nome: raiz, valor: ip });
        for (const alvo of cn) apagar.push({ tipo: 'CNAME', nome: raiz, valor: alvo });
      }
      for (const ip of ipv4) if (proxyRaiz || !a.includes(ip)) criar.push({ tipo: 'A', nome: raiz, valor: ip });
      /* No www: um CNAME só, o nosso. */
      const wwwJaCerto = wwwC.some((x) => x === cname);
      if (!wwwJaCerto) {
        for (const alvo of wwwC) apagar.push({ tipo: 'CNAME', nome: 'www', valor: alvo });
        if (proxyWww) for (const tipo of ['A', 'AAAA', 'CNAME']) apagar.push({ tipo, nome: 'www', valor: QUALQUER_VALOR });
        else if (!wwwC.length) for (const ip of wwwA) apagar.push({ tipo: 'A', nome: 'www', valor: ip });
        criar.push({ tipo: 'CNAME', nome: 'www', valor: cname });
      }
      /* O que fica: e-mail e verificações. */
      for (const m of mx) manter.push({ tipo: 'MX', nome: raiz, valor: m });
      for (const t of txt) manter.push({ tipo: 'TXT', nome: raiz, valor: t.length > 60 ? `${t.slice(0, 57)}…` : t });

      return json(200, {
        ok: true, dominio: d, provedor, painel, apagar, criar, manter,
        dns_no_ar: soa.length > 0 || ns.length > 0,
        tem_email: mx.length > 0,
      });
    }

    if (acao === 'verificar') {
      const v = await vercel();
      const alvo = v ? await alvoDaVercel(v, d) : { ipv4: [], cname: [] };
      const r = await fetch(`${PROPRIO}/dominio-verificar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-interno': Deno.env.get('WA_INTERNAL_SECRET') ?? '' },
        body: JSON.stringify({ dominio: d, esperado: alvo }),
      });
      const diag = await r.json();
      const codigo = String(diag?.passo?.codigo ?? '');

      /* Certificado: pede à Vercel que confira agora em vez de esperar a rodada dela. */
      if (v && (codigo === 'certificado' || codigo === 'falta_vercel')) {
        for (const nome of [d, `www.${d}`]) {
          if (codigo === 'falta_vercel') await adicionarNaVercel(v, nome);
          await fetch(`${API}/v9/projects/${v.projeto}/domains/${nome}/verify${v.q}`, { method: 'POST', headers: v.h }).catch(() => null);
        }
      }

      if (codigo === 'pronto' && v && !(await verificadoNaVercel(v, d))) {
        return json(200, { ok: true, etapa: 'certificado', achado: diag?.dns?.A ?? [] });
      }
      if (codigo === 'pronto') {
        const g = await gravarNaLoja(c.lojista_company_id, d);
        if (!g?.ok) return json(200, { ok: true, etapa: 'quase', motivo: 'Seu domínio já responde. Estamos terminando a ligação com a sua loja.' });
        await db.from('clients').update({ domain: d, updated_at: new Date().toISOString() }).eq('id', c.id);
        await db.from('onboarding_tasks').update({ done: true, done_at: new Date().toISOString() })
          .eq('client_id', c.id).eq('task_key', 'dominio_conectado').eq('done', false);
        return json(200, { ok: true, etapa: 'pronto', www_ok: !!diag?.www?.ok });
      }
      const etapa = codigo === 'certificado' || codigo === 'falta_vercel' ? 'certificado'
        : codigo === 'dns_errado' ? 'aponta_outro_lugar'
        : 'esperando';
      return json(200, { ok: true, etapa, achado: diag?.dns?.A ?? [] });
    }

    return json(400, { error: 'Ação desconhecida' });
  } catch (e) {
    console.error('dominio-cliente:', e);
    return json(500, { error: 'Algo deu errado do nosso lado. Tente de novo em instantes.' });
  }
});
