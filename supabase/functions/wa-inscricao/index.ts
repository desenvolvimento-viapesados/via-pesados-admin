/**
 * A WABA está inscrita no nosso app?
 *
 * A Meta separa em dois passos que parecem um só, e é aqui que a maioria das
 * integrações trava: configurar o webhook no APP diz para onde mandar;
 * inscrever a CONTA no app diz de quem mandar. Sem o segundo, o webhook fica
 * verde e nenhuma mensagem chega — sem erro em lugar nenhum.
 *
 * GET lista. POST inscreve.
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' 
  // Sem Allow-Methods o navegador barra o preflight e o pedido nem sai —
  // some no console e nao aparece log nenhum no servidor.
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const GRAPH = 'https://graph.facebook.com/v21.0';
const WABA = '2088077995129091';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const token = Deno.env.get('META_WABA_TOKEN');
  if (!token) return json(500, { error: 'META_WABA_TOKEN ausente' });
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  if (req.method === 'POST') {
    const r = await fetch(`${GRAPH}/${WABA}/subscribed_apps`, { method: 'POST', headers: h });
    const d = await r.json().catch(() => null);
    if (!r.ok) return json(502, { ok: false, erro: d?.error ?? d });
    return json(200, { ok: true, inscrito: d });
  }

  const r = await fetch(`${GRAPH}/${WABA}/subscribed_apps`, { headers: h });
  const d = await r.json().catch(() => null);
  return json(200, {
    http: r.status,
    apps_inscritos: (d?.data ?? []).map((a: Record<string, any>) => ({
      id: a.whatsapp_business_api_data?.id,
      nome: a.whatsapp_business_api_data?.name,
    })),
    erro: d?.error?.message,
  });
});
