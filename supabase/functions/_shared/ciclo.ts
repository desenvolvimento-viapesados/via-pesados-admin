/**
 * Alinha a assinatura do Asaas à data de implantação do cliente.
 *
 * O Asaas ancora o ciclo no vencimento da PRIMEIRA cobrança — que o
 * checkout põe em "hoje + 3 dias" para dar folga ao boleto. A iTruck
 * implantou em 14/09 e ficou com vencimento todo dia 17. A regra é contar
 * da implantação: cada mensalidade paga cobriu um período, e as em aberto
 * cobrem os seguintes, na ordem.
 *
 * Mexe em três lugares, e só em cobrança que ainda não foi paga:
 *  - o vencimento de cada mensalidade em aberto no Asaas (PUT /payments);
 *  - o próximo vencimento da assinatura (PUT /subscriptions);
 *  - a nossa tabela `payments`, para não esperar o PAYMENT_UPDATED.
 * Rodar duas vezes dá o mesmo resultado.
 */
import { vencimentosDoCiclo, hojeBRT } from './regua.ts';

const PAGAS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
const ABERTAS = ['PENDING', 'OVERDUE'];

const baseDaChave = (c: string) =>
  c.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';

async function asaas(caminho: string, metodo = 'GET', corpo?: unknown) {
  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) throw new Error('ASAAS_API_KEY não configurada');
  const r = await fetch(`${baseDaChave(chave)}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', access_token: chave, 'User-Agent': 'ViaPesados/1.0' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) {
    const det = Array.isArray(d?.errors) ? d.errors.map((e: { description?: string }) => e.description).join(' · ') : `Asaas ${r.status}`;
    throw new Error(det);
  }
  return d;
}

export type Alinhamento = {
  implantado_em: string;
  mudancas: { cobranca: string; de: string; para: string }[];
  proxima: string | null;
};

export async function alinharCiclo(
  db: { from: (t: string) => any },
  cliente: { id: string; asaas_subscription_id: string | null },
  implantadoEm: string,
): Promise<Alinhamento> {
  await db.from('clients').update({ implantado_em: implantadoEm }).eq('id', cliente.id);
  const resultado: Alinhamento = { implantado_em: implantadoEm, mudancas: [], proxima: null };
  if (!cliente.asaas_subscription_id) return resultado; // sem assinatura ainda: o checkout já nasce alinhado

  const lista = await asaas(`/subscriptions/${cliente.asaas_subscription_id}/payments?limit=100`);
  const todas: Array<Record<string, any>> = Array.isArray(lista?.data) ? lista.data : [];
  const pagas = todas.filter((p) => PAGAS.includes(String(p.status))).length;
  const abertas = todas
    .filter((p) => ABERTAS.includes(String(p.status)))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  const { vencimentos, proxima } = vencimentosDoCiclo(implantadoEm, pagas, abertas.length);

  for (let i = 0; i < abertas.length; i++) {
    const p = abertas[i];
    const novo = vencimentos[i];
    if (String(p.dueDate) === novo) continue;
    // O Asaas não aceita vencimento no passado. Mensalidade que, pela
    // implantação, já devia ter vencido fica como está — é dívida, não ciclo.
    if (novo < hojeBRT()) continue;
    await asaas(`/payments/${p.id}`, 'PUT', { billingType: p.billingType, value: p.value, dueDate: novo });
    await db.from('payments').update({ due_date: novo, status: 'pendente' }).eq('asaas_payment_id', p.id);
    resultado.mudancas.push({ cobranca: String(p.id), de: String(p.dueDate), para: novo });
  }

  const sub = await asaas(`/subscriptions/${cliente.asaas_subscription_id}`);
  if (String(sub?.nextDueDate) !== proxima) {
    await asaas(`/subscriptions/${cliente.asaas_subscription_id}`, 'PUT', { nextDueDate: proxima });
  }
  resultado.proxima = proxima;
  return resultado;
}

/** O status da cobrança no Asaas, agora — para cortar só com certeza. */
export async function statusNoAsaas(asaasPaymentId: string): Promise<string | null> {
  try {
    const p = await asaas(`/payments/${asaasPaymentId}`);
    return p?.status ? String(p.status) : null;
  } catch {
    return null;
  }
}
