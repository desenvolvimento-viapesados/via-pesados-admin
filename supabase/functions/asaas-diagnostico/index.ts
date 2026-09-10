/**
 * O Asaas está mesmo configurado para nos chamar?
 *
 * Só leitura. Existe porque um webhook não registrado falha do pior jeito
 * possível: em silêncio. Tudo do nosso lado fica pronto, nenhum evento
 * chega, e ninguém descobre até um lojista reclamar que não recebeu a
 * cobrança.
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', };
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
    /* Pix Automático é liberado por conta, igual à tokenização de cartão.
       Uma listagem (leitura pura) já diz se está disponível: conta sem
       elegibilidade responde erro em vez de lista vazia. */
    const pixAut = await fetch(`${base}/pix/automatic/authorizations?limit=1`, {
      headers: { access_token: chave, 'User-Agent': 'ViaPesados/1.0' },
    });
    const pixBody = await pixAut.json().catch(() => null);

    /* Tokenização: sonda com corpo VAZIO de propósito — nenhum cartão real
       envolvido. O que interessa é o tipo do erro:
         403 = conta sem permissão (travado no gerente)
         400 = endpoint funciona e só reclamou dos campos que faltam */
    const tok = await fetch(`${base}/creditCard/tokenizeCreditCard`, {
      method: 'POST',
      headers: { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'ViaPesados/1.0' },
      body: JSON.stringify({}),
    });
    const tokBody = await tok.json().catch(() => null);

    /* Existe um segundo caminho para recorrência no cartão: mandar o cartão
       direto na criação da ASSINATURA, deixando a Asaas guardar por dentro,
       sem passar pelo /creditCard/tokenizeCreditCard. Se este não for 403,
       dá para ter débito automático hoje, sem esperar o gerente.
       Corpo proposital incompleto: nenhum cartão real envolvido. */
    const assin = await fetch(`${base}/subscriptions`, {
      method: 'POST',
      headers: { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'ViaPesados/1.0' },
      body: JSON.stringify({ billingType: 'CREDIT_CARD', cycle: 'MONTHLY' }),
    });
    const assinBody = await assin.json().catch(() => null);

    return json(200, {
      ok: true,
      ambiente: base.includes('sandbox') ? 'sandbox' : 'producao',
      assinatura_cartao_direto: {
        http: assin.status,
        bloqueado_por_permissao: assin.status === 403,
        detalhe: (assinBody?.errors ?? []).map((e: { description?: string }) => e.description) ?? assinBody,
      },
      tokenizacao_cartao: {
        http: tok.status,
        liberada: tok.status !== 403,
        detalhe: (tokBody?.errors ?? [{}])[0]?.description ?? tokBody?.message ?? tokBody,
      },
      pix_automatico: {
        http: pixAut.status,
        disponivel: pixAut.ok,
        detalhe: pixAut.ok ? `${(pixBody?.data ?? []).length} autorizações` : pixBody?.errors ?? pixBody,
      },
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
