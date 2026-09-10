/**
 * Sonda de permissões da conta Asaas.
 *
 * Só descobre O QUE A CONTA PODE — nunca cria cobrança, assinatura ou
 * autorização. Todos os POST vão com corpo incompleto de propósito: o que
 * interessa é o CÓDIGO, não a operação.
 *
 *   403 → recurso bloqueado para a conta (é com o gerente)
 *   400 → recurso liberado, só faltaram campos
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };

Deno.serve(async () => {
  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) return new Response(JSON.stringify({ error: 'sem chave' }), { status: 500, headers: cors });
  const base = chave.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
  const h = { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'ViaPesados/1.0' };

  const alvos: Array<[string, string, string, unknown?]> = [
    ['pix automático · listar',        'GET',  '/pix/automatic/authorizations?limit=1'],
    ['pix automático · criar',         'POST', '/pix/automatic/authorizations', {}],
    ['pix automático · variante v2',   'GET',  '/pix/automaticAuthorizations?limit=1'],
    ['pix recorrente · listar',        'GET',  '/pix/recurring?limit=1'],
    ['pix · chaves',                   'GET',  '/pix/addressKeys?limit=1'],
    ['assinatura · cartão direto',     'POST', '/subscriptions', { billingType: 'CREDIT_CARD', cycle: 'MONTHLY' }],
    ['assinatura · pix',               'POST', '/subscriptions', { billingType: 'PIX', cycle: 'MONTHLY' }],
    ['tokenizar cartão',               'POST', '/creditCard/tokenizeCreditCard', {}],
    ['débito automático (conta)',      'POST', '/payments', { billingType: 'DEBIT_CARD' }],
    ['conta · status',                 'GET',  '/myAccount/status'],
    ['conta · comercial',              'GET',  '/myAccount/commercialInfo'],
  ];

  const saida: unknown[] = [];
  for (const [nome, metodo, caminho, corpo] of alvos) {
    try {
      const r = await fetch(`${base}${caminho}`, {
        method: metodo, headers: h,
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
      const d = await r.json().catch(() => null);
      const msg = (d?.errors ?? [])[0]?.description ?? d?.message ?? null;
      saida.push({
        recurso: nome,
        http: r.status,
        veredito: r.status === 403 ? 'BLOQUEADO' : r.status === 404 ? 'não existe' : 'liberado',
        detalhe: msg ? String(msg).slice(0, 120) : undefined,
      });
    } catch (e) {
      saida.push({ recurso: nome, erro: e instanceof Error ? e.message : 'falha' });
    }
  }
  /* Só os campos que explicam elegibilidade. Nada de CNPJ, endereço ou
     dados bancários: isto é diagnóstico, não extrato. */
  let conta: Record<string, unknown> = {};
  try {
    const st = await (await fetch(`${base}/myAccount/status`, { headers: h })).json();
    const ci = await (await fetch(`${base}/myAccount/commercialInfo`, { headers: h })).json();
    conta = {
      geral: st?.general, documentos: st?.documentation, conta_bancaria: st?.bankAccountInfo,
      comercial: st?.commercialInfo, tipo_pessoa: ci?.personType,
      tipo_empresa: ci?.companyType, ramo: ci?.businessActivity ?? ci?.segment,
      site: ci?.site,
    };
  } catch { /* diagnóstico não pode derrubar a sonda */ }

  return new Response(JSON.stringify({ ambiente: base.includes('sandbox') ? 'sandbox' : 'producao', conta, sonda: saida }, null, 1),
    { headers: { ...cors, 'Content-Type': 'application/json' } });
});
