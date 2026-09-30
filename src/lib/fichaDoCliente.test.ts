import { describe, it, expect } from 'vitest';
import { situacaoFinanceira, pendenciasDoCliente } from './fichaDoCliente';

const HOJE = new Date('2026-09-30T15:00:00Z').getTime();
const pg = (due: string, status: string, amount = 500, paid_at: string | null = null) =>
  ({ due_date: due, status, amount, paid_at } as never);

describe('situação financeira, sem ninguém marcar nada', () => {
  it('sem cobrança nenhuma', () => {
    expect(situacaoFinanceira([], HOJE).estado).toBe('sem_cobranca');
  });

  it('cobrança criada e ainda não paga', () => {
    const f = situacaoFinanceira([pg('2026-10-17', 'pendente')], HOJE);
    expect(f.estado).toBe('aguardando_primeira');
    expect(f.proximoVencimento).toBe('2026-10-17');
  });

  /* O caso da iTruck: pagou em setembro, próxima em outubro. Ninguém
     precisa marcar "ativo" nem "inadimplente". */
  it('pagou e tem a próxima em aberto: em dia', () => {
    const f = situacaoFinanceira(
      [pg('2026-09-17', 'pago', 10, '2026-09-14'), pg('2026-10-17', 'pendente', 10)], HOJE,
    );
    expect(f.estado).toBe('em_dia');
    expect(f.texto).toContain('17/10');
    expect(f.ultimoPagamentoEm).toBe('2026-09-14');
  });

  it('fatura vencida vira atraso com dias e valor, sem depender do rótulo do Asaas', () => {
    const f = situacaoFinanceira([pg('2026-09-20', 'pendente', 490)], HOJE);
    expect(f.estado).toBe('atrasado');
    expect(f.diasAtraso).toBe(10);
    expect(f.valorEmAberto).toBe(490);
  });

  it('duas vencidas: conta pela mais antiga e soma o aberto', () => {
    const f = situacaoFinanceira([pg('2026-08-17', 'atrasado', 300), pg('2026-09-17', 'pendente', 300)], HOJE);
    expect(f.estado).toBe('atrasado');
    expect(f.valorEmAberto).toBe(600);
    expect(f.texto).toContain('2 faturas');
  });

  it('cobrança cancelada não conta como atraso', () => {
    expect(situacaoFinanceira([pg('2026-08-01', 'cancelado')], HOJE).estado).toBe('sem_cobranca');
  });

  it('vence hoje ainda não está atrasada', () => {
    expect(situacaoFinanceira([pg('2026-09-30', 'pendente')], HOJE).estado).toBe('aguardando_primeira');
  });
});

const uso = (p: Record<string, unknown> = {}) => ({
  estoque: { total: 8, disponiveis: 6, vendidos: 2, valor_tabela: 3_750_000, parados_60d: 0 },
  uso: { usuarios: 3, contatos: 0, leads: 0, conversas: 0, instancias_wa: 0, pedidos: 0, pedidos_abertos: 0 },
  canais: { conexoes: [{ canal: 'mercadolivre', ativo: true, conta: null, expira: null }], anuncios: [] },
  marcos: {
    ja_acessou: true, nunca_entraram: 0, ultimo_acesso_em: '2026-09-29T19:00:00Z',
    conta_criada_em: null, primeiro_veiculo_em: null, primeira_publicacao_em: null,
    primeira_venda_em: null, tem_canal_ligado: true, tem_anuncio_no_ar: true,
  },
  ...p,
} as never);

describe('o que precisa de alguém hoje', () => {
  const emDia = situacaoFinanceira([pg('2026-09-17', 'pago', 10, '2026-09-14')], HOJE);

  it('conta saudável não gera pendência', () => {
    expect(pendenciasDoCliente({ status: 'ativo' } as never, uso(), emDia, HOJE)).toEqual([]);
  });

  it('atraso entra em primeiro e é grave', () => {
    const atrasado = situacaoFinanceira([pg('2026-09-01', 'pendente', 490)], HOJE);
    const p = pendenciasDoCliente({ status: 'ativo' } as never, uso(), atrasado, HOJE);
    expect(p[0].chave).toBe('atrasado');
    expect(p[0].peso).toBe('grave');
  });

  it('canal desconectado diz qual é', () => {
    const p = pendenciasDoCliente({ status: 'ativo' } as never, uso({
      canais: { conexoes: [{ canal: 'facebook', ativo: false, conta: null, expira: null }], anuncios: [] },
    }), emDia, HOJE);
    expect(p.find((x) => x.chave === 'canal_caido')?.texto).toBe('Canal facebook desconectado');
  });

  it('estoque sem anúncio é grave; sem estoque não é', () => {
    const marcos = { ...(uso() as never as { marcos: Record<string, unknown> }).marcos, tem_anuncio_no_ar: false };
    const comEstoque = pendenciasDoCliente({ status: 'ativo' } as never, uso({ marcos }), emDia, HOJE);
    expect(comEstoque.find((x) => x.chave === 'sem_anuncio')?.peso).toBe('grave');

    const vazio = pendenciasDoCliente({ status: 'ativo' } as never, uso({
      marcos, estoque: { total: 0, disponiveis: 0, vendidos: 0, valor_tabela: 0, parados_60d: 0 },
    }), emDia, HOJE);
    expect(vazio.find((x) => x.chave === 'sem_anuncio')).toBeUndefined();
  });

  it('cliente cancelado não gera pendência nenhuma', () => {
    const atrasado = situacaoFinanceira([pg('2026-09-01', 'pendente')], HOJE);
    expect(pendenciasDoCliente({ status: 'cancelado' } as never, uso(), atrasado, HOJE)).toEqual([]);
  });

  it('sem leitura do sistema, ainda diz o que sabe do dinheiro', () => {
    const atrasado = situacaoFinanceira([pg('2026-09-01', 'pendente')], HOJE);
    const p = pendenciasDoCliente({ status: 'ativo' } as never, null, atrasado, HOJE);
    expect(p).toHaveLength(1);
  });
});
