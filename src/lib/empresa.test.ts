import { describe, it, expect } from 'vitest';
import { caixaPorFrente, resumoDaFrente } from './empresa';
import type { Client, FinTransaction, Payment } from '@/hooks/useAdmin';

const cli = (id: string, frente: 'lojista' | 'transportadora', p: Partial<Client> = {}) =>
  ({ id, frente, status: 'ativo', mrr: 1000, company_name: id, ...p }) as Client;
const pag = (client_id: string, frente: 'lojista' | 'transportadora', p: Partial<Payment> = {}) =>
  ({ id: `${client_id}-${p.due_date ?? 'x'}`, client_id, frente, status: 'pago', amount: 1000, due_date: '2026-10-05', ...p }) as Payment;
const lanc = (p: Partial<FinTransaction>) =>
  ({ id: Math.random().toString(), type: 'despesa', status: 'pago', amount: 100, due_date: '2026-10-10', payment_date: '2026-10-10', competence_date: '2026-10-10', ...p }) as FinTransaction;

describe('a Empresa soma as frentes sem misturar as contas', () => {
  const clientes = [
    cli('l1', 'lojista'), cli('l2', 'lojista', { status: 'onboarding', mrr: 500 }),
    cli('t1', 'transportadora', { mrr: 2400 }), cli('t2', 'transportadora', { status: 'inadimplente', mrr: 1200 }),
  ];
  const pagamentos = [
    pag('l1', 'lojista'),
    pag('t1', 'transportadora'), pag('t2', 'transportadora'),
    pag('t2', 'transportadora', { status: 'pendente', due_date: '2026-10-01' }),
  ];

  it('MRR de cada frente pela conta única (só quem já pagou)', () => {
    const l = resumoDaFrente('lojista', clientes, pagamentos, '2026-10-29');
    const t = resumoDaFrente('transportadora', clientes, pagamentos, '2026-10-29');
    expect(l.mrr).toBe(1000);
    expect(l.aguardando).toBe(500);
    expect(l.implantando).toBe(1);
    expect(t.mrr).toBe(3600);
    expect(t.pagando).toBe(2);
    expect(t.devendo).toBe(1);
    expect(l.devendo).toBe(0);
  });

  it('pagamento de uma frente não conta na outra, mesmo com o mesmo cliente por engano', () => {
    const cruzado = [pag('l1', 'transportadora')];
    expect(resumoDaFrente('lojista', clientes, cruzado, '2026-10-29').mrr).toBe(0);
  });

  it('caixa do mês por frente, com os custos gerais à parte', () => {
    const c = caixaPorFrente([
      lanc({ frente: 'lojista', type: 'receita', amount: 1000 }),
      lanc({ frente: 'transportadora', type: 'receita', amount: 2400 }),
      lanc({ frente: 'empresa', amount: 300 }),
      lanc({ frente: 'lojista', amount: 50 }),
      // Fora do mês, pendente e cancelado não entram no caixa.
      lanc({ frente: 'lojista', type: 'receita', amount: 999, payment_date: '2026-09-30' }),
      lanc({ frente: 'empresa', amount: 999, status: 'pendente', payment_date: null }),
      lanc({ frente: 'empresa', amount: 999, status: 'cancelado' }),
    ], '2026-10');
    expect(c.lojista).toEqual({ entrou: 1000, saiu: 50, saldo: 950 });
    expect(c.transportadora).toEqual({ entrou: 2400, saiu: 0, saldo: 2400 });
    expect(c.empresa).toEqual({ entrou: 0, saiu: 300, saldo: -300 });
  });
});
