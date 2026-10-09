import { describe, expect, it } from 'vitest';
import { licencaDoCliente } from './licenca';

describe('licença na ficha', () => {
  it('iTruck: implantou 14/09, pagou setembro — paga até 14/10, corta em 16/10, mensagem em 09/10', () => {
    const l = licencaDoCliente('2026-09-14', [
      { status: 'pago', due_date: '2026-09-17', amount: 10, asaas_subscription_id: 'sub' },
      { status: 'pendente', due_date: '2026-10-14', amount: 10, asaas_subscription_id: 'sub' },
      { status: 'pendente', due_date: '2026-11-14', amount: 10, asaas_subscription_id: 'sub' },
      { status: 'pendente', due_date: '2026-10-01', amount: 99, asaas_subscription_id: null }, // avulsa não conta
    ], '2026-10-09');
    expect(l).toMatchObject({
      diaDoVencimento: 14, pagaAte: '2026-10-14',
      proxima: { vence: '2026-10-14', valor: 10, atrasada: false },
      cortaEm: '2026-10-16', mensagemEm: '2026-10-09',
    });
  });
});
