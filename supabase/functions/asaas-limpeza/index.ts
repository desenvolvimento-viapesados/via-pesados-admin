/**
 * Lista e remove dados de teste na Asaas.
 *
 * Existe porque uma assinatura de teste esquecida não fica parada: ela
 * gera cobrança todo mês, e agora que o webhook está ativo essas cobranças
 * entram no sistema como se fossem de um cliente real.
 *
 * Sem confirmar=true, SÓ LISTA. É a diferença entre olhar e apagar.
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) return json(500, { error: 'sem chave' });
  const base = chave.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
  const h = { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'ViaPesados/1.0' };

  const { customer, subscription, confirmar } = await req.json().catch(() => ({} as Record<string, unknown>));

  const pegar = async (c: string) => (await (await fetch(`${base}${c}`, { headers: h })).json())?.data ?? [];
  const assinaturas = customer ? await pegar(`/subscriptions?customer=${customer}`) : [];
  const cobrancas = customer ? await pegar(`/payments?customer=${customer}&limit=100`) : [];

  if (!confirmar) {
    return json(200, {
      modo: 'somente listagem',
      assinaturas: assinaturas.map((a: Record<string, string>) => ({ id: a.id, status: a.status, valor: a.value, proxima: a.nextDueDate })),
      cobrancas: cobrancas.map((p: Record<string, string>) => ({ id: p.id, status: p.status, valor: p.value, vence: p.dueDate })),
    });
  }

  const feitos: unknown[] = [];
  // Cobranças primeiro: apagar a assinatura não apaga o que ela já gerou.
  for (const p of cobrancas) {
    const r = await fetch(`${base}/payments/${p.id}`, { method: 'DELETE', headers: h });
    feitos.push({ cobranca: p.id, removida: r.ok, http: r.status });
  }
  for (const a of (subscription ? [{ id: subscription }] : assinaturas)) {
    const r = await fetch(`${base}/subscriptions/${a.id}`, { method: 'DELETE', headers: h });
    feitos.push({ assinatura: a.id, removida: r.ok, http: r.status });
  }
  if (customer) {
    const r = await fetch(`${base}/customers/${customer}`, { method: 'DELETE', headers: h });
    feitos.push({ cliente: customer, removido: r.ok, http: r.status });
  }
  return json(200, { modo: 'removido', feitos });
});
