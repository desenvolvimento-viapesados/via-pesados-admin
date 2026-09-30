import type { Client, Payment } from '@/hooks/useAdmin';

/**
 * Quanto entra por mês, de verdade.
 *
 * Havia duas contas no painel e elas discordavam: a Home somava o MRR de
 * quem tinha o rótulo `ativo` e mostrava R$ 0; a tela de Clientes somava
 * todo mundo que não estava cancelado e mostrava R$ 10. O dinheiro era o
 * mesmo — a iTruck pagou a primeira mensalidade em 14/09 e a assinatura
 * segue de pé —, mas o rótulo dela continuava `onboarding`, porque status
 * é campo que alguém muda à mão e ninguém mudou.
 *
 * Aqui MRR não pergunta o rótulo: pergunta se o dinheiro já entrou. O que
 * conta é ter pelo menos um pagamento PAGO e não estar cancelado. É a
 * definição que se sustenta numa reunião, porque cada real tem uma fatura
 * atrás dele — e é a única que não depende de alguém lembrar de clicar.
 *
 * `aguardando` fica separado de propósito: contrato assinado cuja primeira
 * fatura ainda não caiu é caixa futuro, não recorrente de hoje. Somar os
 * dois é como contar a venda antes do sinal.
 */

export type ClienteDoMRR = Pick<Client, 'id' | 'status' | 'mrr'>;
/* `client_id` nulo existe: pagamento avulso, sem cliente na carteira. */
export type PagamentoDoMRR = { client_id: string | null; status: Payment['status'] };

export function clientesQuePagaram(pagamentos: PagamentoDoMRR[]): Set<string> {
  return new Set(
    pagamentos.filter((p) => p.status === 'pago' && p.client_id).map((p) => p.client_id as string),
  );
}

export function mrrDaCarteira(clientes: ClienteDoMRR[], pagamentos: PagamentoDoMRR[]) {
  const pagaram = clientesQuePagaram(pagamentos);
  const vivos = clientes.filter((c) => c.status !== 'cancelado');
  const soma = (l: ClienteDoMRR[]) => l.reduce((s, c) => s + Number(c.mrr ?? 0), 0);
  const pagantes = vivos.filter((c) => pagaram.has(c.id));
  const esperando = vivos.filter((c) => !pagaram.has(c.id));
  return {
    /** O recorrente que já entra. */
    mrr: soma(pagantes),
    /** Assinado, ainda sem a primeira fatura paga. */
    aguardando: soma(esperando),
    contas: pagantes.length,
    contasAguardando: esperando.length,
  };
}
