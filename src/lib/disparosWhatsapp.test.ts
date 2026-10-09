import { describe, it, expect } from 'vitest';
import { conferirParams } from '../../supabase/functions/_shared/conferirParams.ts';
import { MODELOS } from '../../supabase/functions/_shared/modelos.ts';

/**
 * Os onze modelos aprovados e o que cada gatilho manda neles.
 *
 * A Meta é literal: template de quatro variáveis com três parâmetros é
 * recusa, não é texto faltando. Este teste é o espelho dos gatilhos —
 * `asaas-webhook`, `cobranca-lembrete`, `reuniao-avisos`,
 * `cliente-avisar-acesso` e `nota-aviso` — e existe para que mudar o
 * texto de um modelo na Meta sem ajustar o gatilho (ou o contrário)
 * apareça aqui, e não no WhatsApp de um cliente.
 */

/* O que cada gatilho monta hoje, com valores de exemplo. Mexeu no
   gatilho, mexa aqui — é esta linha que prova que ele continua casando
   com o modelo aprovado. */
const GATILHOS: Record<string, Parameters<typeof conferirParams>[1]> = {
  cobranca_mensal_disponivel: {
    header: ['outubro'],
    body: ['Walker', 'outubro', 'R$ 10,00', '17/10/2026'],
    urlSuffix: 'tok123',
  },
  cobranca_em_atraso: {
    body: ['Walker', 'setembro', 'R$ 10,00', '17/09/2026'],
    urlSuffix: 'tok123',
  },
  cobranca_vence_amanha: {
    body: ['Walker', '17/10', 'R$ 10,00'],
    urlSuffix: 'tok123',
  },
  pagamento_confirmado: {
    body: ['Walker', 'setembro', 'R$ 10,00', '17/10/2026'],
  },
  cartao_recusado: {
    body: ['Walker', 'outubro'],
    urlSuffix: 'tok123',
  },
  reuniao_confirmada: {
    body: ['Walker', '02/10/2026', '14:00', 'Kauã'],
  },
  reuniao_lembrete: {
    body: ['Walker', 'Kauã', '14:00'],
  },
  acesso_equipe: {
    body: ['Walker', 'iTruck Caminhões'],
    urlSuffix: 'convite123',
  },
  cobranca_risco_suspensao: {
    body: ['Walker', 'outubro', 'R$ 10,00', '14/10/2026', '16/10'],
    urlSuffix: 'tok123',
  },
  loja_fora_do_ar: {
    body: ['Walker', 'outubro', 'iTruck Caminhões'],
    urlSuffix: 'tok123',
  },
  painel_suspenso_tempo: { body: ['Walker'], urlSuffix: 'tok123' },
  painel_suspenso_equipe: { body: ['Walker'], urlSuffix: 'tok123' },
  painel_liberado: { body: ['Walker', 'iTruck Caminhões'] },
  nota_fiscal_emitida: {
    documento: { link: 'https://exemplo/nf.pdf', filename: 'NFS-e 1 — Via Pesados.pdf' },
    body: ['Walker', 'setembro', '1', 'R$ 10,00'],
  },
};

describe('o que os gatilhos mandam bate com o modelo aprovado', () => {
  for (const [template, params] of Object.entries(GATILHOS)) {
    it(`${template} sai sem recusa`, () => {
      expect(conferirParams(template, params), template).toEqual([]);
    });
  }

  it('todo modelo com gatilho está no catálogo aprovado', () => {
    const nomes = new Set(MODELOS.map((m) => m.name));
    for (const t of Object.keys(GATILHOS)) expect(nomes.has(t), t).toBe(true);
  });
});

describe('a conferência pega o que a Meta recusaria', () => {
  it('variável a menos no corpo', () => {
    const r = conferirParams('pagamento_confirmado', { body: ['Walker', 'setembro', 'R$ 10,00'] });
    expect(r[0]).toContain('o corpo pede 4');
  });

  it('variável vazia — a Meta recusa, não imprime em branco', () => {
    const r = conferirParams('reuniao_lembrete', { body: ['Walker', '', '14:00'] });
    expect(r.join()).toContain('vazia');
  });

  /* O caso que mais ia doer: cliente sem checkout_token, sufixo vazio, e
     o botão do modelo exigindo um. */
  it('botão de URL dinâmica sem sufixo', () => {
    const r = conferirParams('cobranca_vence_amanha', { body: ['Walker', '17/10', 'R$ 10,00'] });
    expect(r.join()).toContain('sufixo veio vazio');
  });

  it('documento sem link no modelo que tem cabeçalho de PDF', () => {
    const r = conferirParams('nota_fiscal_emitida', { body: ['a', 'b', 'c', 'd'] });
    expect(r.join()).toContain('falta o link do PDF');
  });

  it('cabeçalho enviado para modelo que não tem', () => {
    const r = conferirParams('pagamento_confirmado', {
      header: ['outubro'], body: ['a', 'b', 'c', 'd'],
    });
    expect(r.join()).toContain('não tem');
  });

  it('template desconhecido não é barrado: pode ser novo na Meta', () => {
    expect(conferirParams('algo_que_nao_existe', { body: ['x'] })).toEqual([]);
  });
});
