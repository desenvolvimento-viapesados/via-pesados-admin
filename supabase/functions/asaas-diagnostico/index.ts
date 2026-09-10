/**
 * O Asaas está mesmo configurado para nos chamar?
 *
 * Só leitura. Existe porque um webhook não registrado falha do pior jeito
 * possível: em silêncio. Tudo do nosso lado fica pronto, nenhum evento
 * chega, e ninguém descobre até um lojista reclamar que não recebeu a
 * cobrança.
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) return json(500, { error: 'ASAAS_API_KEY ausente' });
  const base = chave.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';

  try {
    const r = await fetch(`${base}/webhooks`, {
      headers: { access_token: chave, 'User-Agent': 'ViaPesados/1.0' },
    });
    const d = await r.json();
    if (!r.ok) return json(502, { ok: false, erro_asaas: d });

    const hooks = (d?.data ?? []) as Array<Record<string, unknown>>;

    /* O Asaas não devolve authToken na listagem. Para saber se ele
       realmente guardou o segredo — e não só aceitou o POST — é preciso
       buscar o webhook individualmente. Sem isso, um token não gravado do
       lado deles faria TODO evento real ser recusado com 401, e a falha
       apareceria só quando um lojista reclamasse. */
    const detalhes: unknown[] = [];
    for (const h of hooks) {
      const det = await (await fetch(`${base}/webhooks/${h.id}`, {
        headers: { access_token: chave, 'User-Agent': 'ViaPesados/1.0' },
      })).json().catch(() => null);
      detalhes.push({
        id: h.id,
        // O Asaas não devolve o token; devolve `hasAuthToken`, que é a
        // confirmação de que ele guardou o segredo do lado deles.
        tem_autenticacao: det?.hasAuthToken ?? null,
        interrompido: det?.interrupted ?? null,
        falhas_penalizadas: det?.penalizedRequestsCount ?? null,
      });
    }
    return json(200, {
      ok: true,
      ambiente: base.includes('sandbox') ? 'sandbox' : 'producao',
      total: hooks.length,
      detalhes,
      webhooks: hooks.map((h) => ({
        nome: h.name, url: h.url, ativo: h.enabled,
        // 'events' é o que decide se PAYMENT_CREATED e companhia chegam aqui.
        eventos: h.events, email_falha: h.email, autenticacao: !!h.authToken,
      })),
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
