/**
 * Registra (ou corrige) os webhooks do Asaas.
 *
 * São DOIS, cada um no seu endereço:
 *   • cobranças    → alimenta `payments` e a régua de avisos
 *   • notas fiscais → alimenta `notas_fiscais`
 *
 * Separados de propósito: o Asaas INTERROMPE a fila de um webhook depois de
 * falhas seguidas. Compartilhando a URL, um erro ao gravar nota derrubaria
 * a fila de pagamentos junto.
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
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const RAIZ = 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1';

/* Os eventos que cada função sabe tratar. Registrar mais do que isso só
   geraria entrega ignorada; registrar menos deixaria a tabela desatualizada. */
const FILAS = [
  {
    name: 'Via Pesados — cobranças',
    url: `${RAIZ}/asaas-webhook`,
    events: [
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
    ],
  },
  {
    name: 'Via Pesados — notas fiscais',
    url: `${RAIZ}/asaas-nota`,
    events: [
      'INVOICE_CREATED',
      'INVOICE_UPDATED',
      'INVOICE_SYNCHRONIZED',
      'INVOICE_AUTHORIZED',
      'INVOICE_PROCESSING_CANCELLATION',
      'INVOICE_CANCELED',
      'INVOICE_CANCELLATION_DENIED',
      'INVOICE_ERROR',
    ],
  },
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
    const jaExistem = (lista?.data ?? []) as Array<Record<string, unknown>>;

    const resultado: unknown[] = [];
    for (const fila of FILAS) {
      const existente = jaExistem.find((h) => h.url === fila.url);
      const corpo = {
        ...fila,
        email,
        enabled: true,
        // Reativa uma fila que o Asaas tenha interrompido por falhas
        // anteriores. Sem isto, corrigir o bug não bastaria: a fila
        // continuaria parada e nenhum evento voltaria a chegar.
        interrupted: false,
        authToken,
        // SEQUENTIALLY preserva a ordem: um PAYMENT_RECEIVED não pode chegar
        // antes do PAYMENT_CREATED da mesma cobrança, nem um INVOICE_AUTHORIZED
        // antes do INVOICE_CREATED da mesma nota.
        sendType: 'SEQUENTIALLY',
      };

      const r = await fetch(
        existente ? `${base}/webhooks/${existente.id}` : `${base}/webhooks`,
        { method: existente ? 'PUT' : 'POST', headers: cab, body: JSON.stringify(corpo) },
      );
      const d = await r.json();
      /* O Asaas NÃO devolve o token na resposta do PUT — só na do POST. Ler
         `d.authToken` aqui reportaria "sem autenticação" para todo webhook
         atualizado, que é exatamente a mentira que faria alguém sair
         caçando um problema inexistente. A verdade vem de uma releitura:
         `hasAuthToken` é o Asaas confirmando que guardou o segredo. */
      const det = d?.id
        ? await (await fetch(`${base}/webhooks/${d.id}`, { headers: cab })).json().catch(() => null)
        : null;
      resultado.push(r.ok
        ? {
            fila: fila.name,
            acao: existente ? 'atualizado' : 'criado',
            id: d?.id, url: d?.url, ativo: d?.enabled,
            autenticacao: det?.hasAuthToken ?? null,
            interrompido: det?.interrupted ?? null,
            eventos: (d?.events ?? []).length,
          }
        : { fila: fila.name, acao: 'FALHOU', erro_asaas: d });
    }

    const falhou = resultado.some((x) => (x as Record<string, unknown>).acao === 'FALHOU');
    return json(falhou ? 502 : 200, { ok: !falhou, filas: resultado });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
