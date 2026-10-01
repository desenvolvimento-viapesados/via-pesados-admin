import { describe, it, expect } from 'vitest';
import { valorDaMetrica, METRICAS, CHAVES_DE_METRICA, type DadosDasMetricas } from './metricas';

const P = { inicio: '2026-10-01', fim: '2026-12-31' };

const dados = (p: Partial<DadosDasMetricas> = {}): DadosDasMetricas => ({
  clientes: [], pagamentos: [], prospects: [], reunioes: [], demos: [],
  transacoes: [], tickets: [], saude: [], ...p,
} as DadosDasMetricas);

const cliente = (p: Record<string, unknown>) => ({ id: 'c1', status: 'ativo', mrr: 100, ...p } as never);
const pg = (p: Record<string, unknown>) => ({ client_id: 'c1', status: 'pago', amount: 100, due_date: '2026-10-10', paid_at: '2026-10-10', ...p } as never);

describe('as métricas que o painel já sabe', () => {
  it('MRR conta quem pagou; o resto fica em "a ativar"', () => {
    const d = dados({
      clientes: [cliente({ id: 'a', mrr: 300 }), cliente({ id: 'b', mrr: 500 })],
      pagamentos: [pg({ client_id: 'a' })],
    });
    expect(valorDaMetrica('mrr', d, P)).toBe(300);
    expect(valorDaMetrica('mrr_a_ativar', d, P)).toBe(500);
    expect(valorDaMetrica('clientes_pagando', d, P)).toBe(1);
    expect(valorDaMetrica('clientes_na_carteira', d, P)).toBe(2);
  });

  it('estoque não olha o período; fluxo só conta o que caiu dentro', () => {
    const d = dados({
      clientes: [
        cliente({ id: 'a', activated_at: '2026-10-05' }),
        cliente({ id: 'b', activated_at: '2026-07-01' }),
      ],
    });
    expect(valorDaMetrica('novos_clientes', d, P)).toBe(1);
    expect(valorDaMetrica('clientes_na_carteira', d, P)).toBe(2);
  });

  it('inadimplência é o que venceu e não foi pago — e é para descer', () => {
    const d = dados({ pagamentos: [
      pg({ status: 'pendente', due_date: '2026-09-01', amount: 490, paid_at: null }),
      pg({ status: 'pendente', due_date: '2099-01-01', amount: 900, paid_at: null }),
    ] });
    expect(valorDaMetrica('inadimplencia', d, P)).toBe(490);
    expect(METRICAS.inadimplencia.menorEMelhor).toBe(true);
  });

  it('recebido soma pelo dia do pagamento, não pelo vencimento', () => {
    const d = dados({ pagamentos: [
      pg({ amount: 100, due_date: '2026-09-28', paid_at: '2026-10-02' }),
      pg({ amount: 700, due_date: '2026-10-05', paid_at: '2027-01-05' }),
    ] });
    expect(valorDaMetrica('recebido', d, P)).toBe(100);
  });

  it('caixa anda com o pagamento: lançado e não pago não entra', () => {
    const d = dados({ transacoes: [
      { type: 'receita', amount: 1000, payment_date: '2026-10-10' },
      { type: 'despesa', amount: 400, payment_date: '2026-10-11' },
      { type: 'despesa', amount: 9000, payment_date: null, due_date: '2026-10-20' },
    ] as never });
    expect(valorDaMetrica('caixa_liquido', d, P)).toBe(600);
  });

  /* O erro que esta regra evita: sem leitura da base, somar zero e
     anunciar "nenhum veículo anunciado" quando a verdade é "não li". */
  it('sem leitura da base, a métrica é null e não zero', () => {
    expect(valorDaMetrica('veiculos_anunciados_base', dados(), P)).toBeNull();
    expect(valorDaMetrica('vendas_base', dados(), P)).toBeNull();
  });

  it('com leitura, soma a base inteira', () => {
    const d = dados({ saude: [
      { veiculos_anunciados: 6, veiculos: 8, vendas_30d: 2, faturamento_30d: 1_180_000, ultimo_acesso_em: new Date().toISOString() },
      { veiculos_anunciados: 4, veiculos: 10, vendas_30d: 1, faturamento_30d: 320_000, ultimo_acesso_em: '2026-01-01T00:00:00Z' },
    ] as never });
    expect(valorDaMetrica('veiculos_anunciados_base', d, P)).toBe(10);
    expect(valorDaMetrica('faturamento_base', d, P)).toBe(1_500_000);
    expect(valorDaMetrica('contas_usando', d, P)).toBe(1);
  });

  it('toda métrica do catálogo sabe se responder', () => {
    for (const chave of CHAVES_DE_METRICA) {
      expect(() => valorDaMetrica(chave, dados(), P)).not.toThrow();
      expect(METRICAS[chave].rotulo.length).toBeGreaterThan(2);
      expect(METRICAS[chave].explica.endsWith('.')).toBe(true);
    }
  });
});
