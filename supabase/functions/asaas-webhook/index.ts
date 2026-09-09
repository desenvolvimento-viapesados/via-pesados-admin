import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Recebe os eventos de cobrança do Asaas e mantém `payments` em dia.
 *
 * Sem isto, alguém marca pagamento na mão no painel — e a régua de
 * inadimplência passa a depender de memória.
 *
 * DUAS COISAS QUE A DOC DO ASAAS AVISA E QUE MOLDAM ESTE ARQUIVO:
 *
 *  1. A entrega é "pelo menos uma vez". O mesmo evento chega repetido, e o
 *     tratamento tem de ser idempotente. Aqui o upsert usa asaas_payment_id
 *     como chave: reprocessar não duplica linha.
 *
 *  2. O token do webhook vem no header `asaas-access-token`, e NÃO deve ser
 *     a API Key. É um segredo próprio, definido ao criar o webhook.
 *
 * Responder fora da faixa 2xx faz o Asaas reenviar e, depois de muitas
 * falhas, INTERROMPER a fila da conta inteira. Por isso um evento que não
 * sabemos tratar é respondido com 200 e ignorado, em vez de dar erro.
 */

const cors = { 'Access-Control-Allow-Origin': '*' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Comparação de tempo constante — comparar com === vaza o prefixo correto. */
function segredoConfere(recebido: string, esperado: string) {
  const a = new TextEncoder().encode(recebido);
  const b = new TextEncoder().encode(esperado);
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

/** Como cada evento do Asaas se traduz no nosso status. */
const STATUS_POR_EVENTO: Record<string, 'pago' | 'pendente' | 'atrasado' | 'cancelado'> = {
  PAYMENT_CREATED: 'pendente',
  PAYMENT_UPDATED: 'pendente',
  PAYMENT_CONFIRMED: 'pago',      // pago, saldo ainda não liberado
  PAYMENT_RECEIVED: 'pago',
  PAYMENT_OVERDUE: 'atrasado',
  PAYMENT_DELETED: 'cancelado',
  PAYMENT_REFUNDED: 'cancelado',
  PAYMENT_CHARGEBACK_REQUESTED: 'atrasado',
  PAYMENT_RESTORED: 'pendente',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const segredo = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
  if (segredo) {
    const recebido = req.headers.get('asaas-access-token') ?? '';
    if (!segredoConfere(recebido, segredo)) {
      return json(401, { error: 'Token do webhook inválido' });
    }
  }
  // Sem ASAAS_WEBHOOK_TOKEN definido a função aceita tudo. É proposital
  // para não travar a configuração inicial, mas o token deve ser definido
  // dos dois lados assim que o webhook for criado no painel do Asaas.

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const corpo = await req.json();
    const evento: string = corpo?.event ?? '';
    const p = corpo?.payment;

    if (!p?.id) return json(200, { ok: true, ignorado: 'evento sem cobrança' });

    const status = STATUS_POR_EVENTO[evento];
    if (!status) return json(200, { ok: true, ignorado: evento });

    // Acha o cliente: primeiro pelo externalReference (que gravamos como o
    // nosso id), depois pelo id do cadastro no Asaas.
    let clientId: string | null = null;
    const ref = String(p.externalReference ?? '').trim();
    if (/^[0-9a-f-]{36}$/i.test(ref)) {
      const { data } = await db.from('clients').select('id').eq('id', ref).maybeSingle();
      clientId = data?.id ?? null;
    }
    if (!clientId && p.customer) {
      const { data } = await db.from('clients').select('id').eq('asaas_customer_id', p.customer).maybeSingle();
      clientId = data?.id ?? null;
    }
    if (!clientId) {
      // 200 de propósito: cobrança de fora do sistema não é erro nosso, e
      // devolver 4xx faria o Asaas reenviar para sempre.
      return json(200, { ok: true, ignorado: 'cobrança sem cliente correspondente', asaas_payment_id: p.id });
    }

    const linha = {
      client_id: clientId,
      description: p.description || 'Mensalidade Via Pesados',
      amount: Number(p.value) || 0,
      due_date: p.dueDate ?? null,
      paid_at: status === 'pago' ? (p.paymentDate ?? p.confirmedDate ?? new Date().toISOString()) : null,
      status,
      method: p.billingType ?? null,
      invoice_url: p.invoiceUrl ?? null,
      asaas_payment_id: p.id,
      asaas_subscription_id: p.subscription ?? null,
    };

    // Chave asaas_payment_id: o mesmo evento chegando de novo atualiza a
    // linha em vez de criar outra.
    const { error } = await db.from('payments').upsert(linha, { onConflict: 'asaas_payment_id' });
    if (error) throw error;

    return json(200, { ok: true, evento, status, client_id: clientId });
  } catch (err) {
    console.error('asaas-webhook:', err);
    // Erro nosso: 500 para o Asaas reenviar e a cobrança não se perder.
    return json(500, { error: err instanceof Error ? err.message : 'Erro' });
  }
});
