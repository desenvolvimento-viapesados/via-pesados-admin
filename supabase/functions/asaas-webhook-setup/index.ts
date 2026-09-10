/**
 * Registra (ou corrige) o webhook do Asaas que alimenta `payments` e a
 * régua de avisos.
 *
 * Existe como função, e não como um curl à mão, por um motivo: o token de
 * autenticação do webhook mora no ambiente do Supabase e é daqui que ele
 * vai para o Asaas. Assim o segredo nunca passa por terminal, log ou
 * histórico de comando.
 *
 * Idempotente: se já houver webhook apontando para a nossa URL, atualiza
 * em vez de criar um segundo — dois webhooks para o mesmo endereço
 * dobrariam cada evento.
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const DESTINO = 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/asaas-webhook';

/* Os eventos que o asaas-webhook sabe tratar. Registrar mais do que isso só
   geraria entrega ignorada; registrar menos deixaria `payments` desatualizada. */
const EVENTOS = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_RESTORED',
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const chave = Deno.env.get('ASAAS_API_KEY');
  const authToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
  if (!chave) return json(500, { error: 'ASAAS_API_KEY ausente' });
  if (!authToken) return json(500, { error: 'ASAAS_WEBHOOK_TOKEN ausente' });

  const base = chave.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
  const cab = { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'ViaPesados/1.0' };

  try {
    // O e-mail de aviso de falha é o da própria conta Asaas — nada novo é
    // enviado para lá, só o que eles já têm.
    const conta = await (await fetch(`${base}/myAccount`, { headers: cab })).json().catch(() => ({}));
    const email = conta?.email ?? undefined;

    const lista = await (await fetch(`${base}/webhooks`, { headers: cab })).json();
    const existente = (lista?.data ?? []).find((h: Record<string, unknown>) => h.url === DESTINO);

    const corpo = {
      name: 'Via Pesados — cobranças',
      url: DESTINO,
      email,
      enabled: true,
      interrupted: false,
      authToken,
      // SEQUENTIALLY preserva a ordem: um PAYMENT_RECEIVED não pode chegar
      // antes do PAYMENT_CREATED da mesma cobrança.
      sendType: 'SEQUENTIALLY',
      events: EVENTOS,
    };

    const r = await fetch(
      existente ? `${base}/webhooks/${existente.id}` : `${base}/webhooks`,
      { method: existente ? 'PUT' : 'POST', headers: cab, body: JSON.stringify(corpo) },
    );
    const d = await r.json();
    if (!r.ok) return json(502, { ok: false, acao: existente ? 'atualizar' : 'criar', erro_asaas: d });

    return json(200, {
      ok: true,
      acao: existente ? 'atualizado' : 'criado',
      id: d?.id,
      url: d?.url,
      ativo: d?.enabled,
      autenticacao: !!d?.authToken,
      eventos: (d?.events ?? []).length,
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
