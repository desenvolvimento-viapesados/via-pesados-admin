/**
 * Em que passo está a conexão de um domínio de cliente.
 *
 * Conectar domínio tem três etapas e elas falham parecido — o cliente vê
 * "não abre" nos três casos. Sem separar, some-se meia hora por cliente
 * chutando qual é. Esta função responde qual das três:
 *
 *   1. DNS ainda não aponta para a Vercel  → é com o cliente
 *   2. Aponta, mas o domínio não foi adicionado ao projeto  → é com você
 *   3. Tudo certo e já servindo  → nada a fazer
 *
 * Usa DNS-over-HTTPS porque resolução nativa não existe no runtime, e
 * consultar o 1.1.1.1 dá a resposta pública — a mesma que o navegador do
 * cliente vai ver.
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

/** IP e CNAME que a Vercel publica para domínios apontados a ela. */
const VERCEL_IP = '76.76.21.21';
const VERCEL_CNAME = 'vercel-dns.com';

async function doh(nome: string, tipo: 'A' | 'CNAME') {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(nome)}&type=${tipo}`, {
      headers: { Accept: 'application/dns-json' },
    });
    const d = await r.json();
    return (d?.Answer ?? [])
      .filter((a: { type: number }) => a.type === (tipo === 'A' ? 1 : 5))
      .map((a: { data: string }) => String(a.data).replace(/\.$/, ''));
  } catch { return []; }
}

/* Quem responde pelo DNS do domínio, a partir dos servidores de nome.
   O que importa não é onde o domínio foi comprado — é onde os registros
   são editados, e isso está nos nameservers. Um domínio comprado na
   HostGator pode usar o DNS do Registro.br, e as instruções são as do
   Registro.br. */
const PROVEDORES: Array<[RegExp, string]> = [
  [/\.dns\.br$/i,                 'Registro.br'],
  [/vercel-dns\.com$/i,           'Vercel'],
  [/cloudflare\.com$/i,           'Cloudflare'],
  [/(hostgator\.com|websitewelcome\.com)$/i, 'HostGator'],
  [/locaweb\.com\.br$/i,          'Locaweb'],
  [/uol(host)?\.com\.br$/i,       'UOL Host'],
  [/kinghost\.net$/i,             'KingHost'],
  [/hostinger\.com$/i,            'Hostinger'],
  [/domaincontrol\.com$/i,        'GoDaddy'],
  [/registrar-servers\.com$/i,    'Namecheap'],
  [/awsdns/i,                     'AWS Route 53'],
  [/azure-dns/i,                  'Azure DNS'],
  [/googledomains\.com$/i,        'Google Domains'],
  [/wixdns\.net$/i,               'Wix'],
];

/** Servidores de nome pelo RDAP. `rdap.org` roteia para o registro certo. */
async function nameservers(d: string): Promise<string[]> {
  const base = d.endsWith('.br') ? 'https://rdap.registro.br' : 'https://rdap.org';
  try {
    const r = await fetch(`${base}/domain/${encodeURIComponent(d)}`, { redirect: 'follow' });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.nameservers ?? [])
      .map((n: { ldhName?: string }) => String(n.ldhName ?? '').toLowerCase())
      .filter(Boolean);
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  try {
    const { dominio } = await req.json();
    const d = String(dominio ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!d || !d.includes('.')) return json(400, { error: 'Informe um domínio válido.' });

    /* O www é metade do trabalho e ficava de fora: quem digita o endereço
       na barra digita com www tanto quanto sem. */
    const raiz = d.replace(/^www\./, '');
    const [as, cnames, wwwA, wwwC, ns] = await Promise.all([
      doh(raiz, 'A'), doh(raiz, 'CNAME'),
      doh(`www.${raiz}`, 'A'), doh(`www.${raiz}`, 'CNAME'),
      nameservers(raiz),
    ]);
    const provedor = PROVEDORES.find(([re]) => ns.some((n) => re.test(n)))?.[1] ?? null;
    const wwwOk = wwwA.includes(VERCEL_IP) || wwwC.some((c: string) => c.includes(VERCEL_CNAME));
    const apontaVercel = as.includes(VERCEL_IP) || cnames.some((c: string) => c.includes(VERCEL_CNAME));
    const temDns = as.length > 0 || cnames.length > 0;

    /* Se já responde e é a nossa aplicação, o resto é história. O
       x-vercel-id prova que a resposta veio do nosso projeto, e não de uma
       página de estacionamento do registrador. */
    let servindo = false;
    let httpStatus: number | null = null;
    try {
      const r = await fetch(`https://${d}`, { redirect: 'follow' });
      httpStatus = r.status;
      servindo = r.ok && r.headers.has('x-vercel-id');
    } catch { /* domínio ainda sem TLS ou sem resposta */ }

    const passo = servindo
      ? { codigo: 'pronto', titulo: 'Domínio conectado e no ar', dono: null }
      : apontaVercel
        ? { codigo: 'falta_vercel', titulo: 'DNS já aponta certo — falta adicionar o domínio no projeto Vercel', dono: 'voce' }
        : temDns
          ? { codigo: 'dns_errado', titulo: 'O domínio aponta para outro lugar', dono: 'cliente' }
          : { codigo: 'sem_dns', titulo: 'Nenhum registro DNS encontrado ainda', dono: 'cliente' };

    return json(200, {
      ok: true, dominio: raiz, passo,
      dns_provedor: { nome: provedor, nameservers: ns },
      www: { A: wwwA, CNAME: wwwC, ok: wwwOk },
      dns: { A: as, CNAME: cnames, aponta_para_vercel: apontaVercel },
      http: { status: httpStatus, servindo_nosso_app: servindo },
      // O que o cliente precisa configurar, pronto para copiar.
      configurar: { tipo_A: VERCEL_IP, tipo_CNAME: `cname.${VERCEL_CNAME}` },
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
