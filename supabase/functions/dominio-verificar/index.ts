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
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  try {
    const { dominio } = await req.json();
    const d = String(dominio ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!d || !d.includes('.')) return json(400, { error: 'Informe um domínio válido.' });

    const [as, cnames] = await Promise.all([doh(d, 'A'), doh(d, 'CNAME')]);
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
      ok: true, dominio: d, passo,
      dns: { A: as, CNAME: cnames, aponta_para_vercel: apontaVercel },
      http: { status: httpStatus, servindo_nosso_app: servindo },
      // O que o cliente precisa configurar, pronto para copiar.
      configurar: { tipo_A: VERCEL_IP, tipo_CNAME: `cname.${VERCEL_CNAME}` },
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
