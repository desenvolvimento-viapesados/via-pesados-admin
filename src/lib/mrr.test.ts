import { describe, it, expect } from 'vitest';
import { mrrDaCarteira, clientesQuePagaram } from './mrr';

const c = (id: string, status: string, mrr: number) => ({ id, status, mrr } as never);
const pg = (client_id: string | null, status: string) => ({ client_id, status } as never);

describe('mrr', () => {
  it('conta quem já pagou, mesmo com o rótulo atrasado', () => {
    /* O caso real: iTruck marcada como onboarding, primeira mensalidade
       paga em 14/09 e assinatura ativa. A Home mostrava R$ 0. */
    const r = mrrDaCarteira([c('a', 'onboarding', 10)], [pg('a', 'pago')]);
    expect(r.mrr).toBe(10);
    expect(r.aguardando).toBe(0);
  });

  it('não conta contrato cuja primeira fatura ainda não caiu', () => {
    const r = mrrDaCarteira([c('a', 'ativo', 500)], [pg('a', 'pendente')]);
    expect(r.mrr).toBe(0);
    expect(r.aguardando).toBe(500);
    expect(r.contasAguardando).toBe(1);
  });

  it('cancelado sai da conta mesmo tendo pago no passado', () => {
    const r = mrrDaCarteira([c('a', 'cancelado', 900)], [pg('a', 'pago')]);
    expect(r.mrr).toBe(0);
    expect(r.aguardando).toBe(0);
  });

  it('soma vários e ignora pagamento sem cliente', () => {
    const r = mrrDaCarteira(
      [c('a', 'ativo', 300), c('b', 'inadimplente', 200), c('d', 'onboarding', 50)],
      [pg('a', 'pago'), pg('b', 'pago'), pg(null, 'pago'), pg('d', 'pendente')],
    );
    expect(r.mrr).toBe(500);
    expect(r.contas).toBe(2);
    expect(r.aguardando).toBe(50);
  });

  it('inadimplente continua contando: ele não cancelou, está atrasado', () => {
    const r = mrrDaCarteira([c('a', 'inadimplente', 400)], [pg('a', 'pago')]);
    expect(r.mrr).toBe(400);
  });

  it('um cliente com várias faturas pagas conta uma vez', () => {
    const r = mrrDaCarteira([c('a', 'ativo', 120)], [pg('a', 'pago'), pg('a', 'pago')]);
    expect(r.mrr).toBe(120);
    expect(clientesQuePagaram([pg('a', 'pago'), pg('a', 'pago')]).size).toBe(1);
  });
});
