import { describe, expect, it } from 'vitest';
import {
  chaveDoWhatsapp, lerPedido, mascaraDoPedido, notasDoPedido, whatsappDoPedido,
} from '../../supabase/functions/_shared/lead-site-regras.ts';
import { chaveDoTelefone } from './oportunidades';

/* O formulário da página de vendas: o que entra no CRM e o que é barrado na porta. */
describe('pedido de contato pelo site', () => {
  const certo = { nome: ' Carlos ', loja: 'Minas Caminhões', whatsapp: '(33) 9 9999-0000', cidade: 'Governador Valadares', uf: 'mg', estoque: '45', cargo: 'Dono', dificuldade: 'anunciar', campanha: 'black-friday' };

  it('aceita o pedido completo e arruma o que veio torto', () => {
    const r = lerPedido(certo);
    expect(r).toEqual({ ok: true, pedido: { nome: 'Carlos', loja: 'Minas Caminhões', whatsapp: '33999990000', cidade: 'Governador Valadares', uf: 'MG', estoque: '45', cargo: 'dono', dificuldade: 'anunciar', campanha: 'black-friday' } });
  });

  it('nome, loja e WhatsApp com DDD são obrigatórios; o resto é opcional', () => {
    expect(lerPedido({ ...certo, nome: '' })).toEqual({ ok: false, erro: 'Diga o seu nome.' });
    expect(lerPedido({ ...certo, loja: '  ' })).toEqual({ ok: false, erro: 'Diga o nome da loja.' });
    expect(lerPedido({ ...certo, whatsapp: '99999-0000' })).toEqual({ ok: false, erro: 'Confira o WhatsApp: precisa do DDD.' });
    const r = lerPedido({ nome: 'Ana', loja: 'Loja', whatsapp: '5533988144005' });
    expect(r.ok === true && r.pedido).toMatchObject({ whatsapp: '33988144005', cidade: null, uf: null, cargo: null, dificuldade: null });
  });

  it('cargo e dificuldade fora da lista são ignorados, não gravados', () => {
    const r = lerPedido({ ...certo, cargo: 'presidente', dificuldade: '<script>' });
    expect(r.ok === true && r.pedido).toMatchObject({ cargo: null, dificuldade: null });
  });

  it('o campo isca preenchido é robô', () => {
    expect(lerPedido({ ...certo, site: 'http://spam' })).toEqual({ ok: 'robo' });
  });

  it('texto longo ou com quebra de linha é cortado e vira uma linha só', () => {
    const r = lerPedido({ ...certo, loja: `Loja\n${'x'.repeat(300)}` });
    expect(r.ok === true && r.pedido.loja.length).toBe(120);
    expect(r.ok === true && r.pedido.loja.includes('\n')).toBe(false);
  });

  it('o WhatsApp é guardado na máscara do CRM e casa com o da lista de prospecção', () => {
    expect(whatsappDoPedido('+55 (33) 98814-4005')).toBe('33988144005');
    expect(whatsappDoPedido('033 98814-4005')).toBe('33988144005');
    expect(mascaraDoPedido('33988144005')).toBe('(33) 98814-4005');
    expect(mascaraDoPedido('3332751111')).toBe('(33) 3275-1111');
    /* A mesma chave que a tela usa para juntar o card com a loja da lista. */
    expect(chaveDoWhatsapp('(33) 98814-4005')).toBe(chaveDoTelefone('5533988144005'));
  });

  it('as respostas viram o texto que aparece embaixo do nome no CRM', () => {
    const r = lerPedido(certo);
    if (r.ok !== true) throw new Error('era para aceitar');
    expect(notasDoPedido(r.pedido, new Date('2026-11-18T17:32:00Z'))).toBe([
      'Pediu contato pelo site em 18/11 às 14h32.', 'Estoque: 45', 'Cargo: Dono',
      'O que mais toma tempo: Anunciar em cada lugar', 'Campanha: black-friday',
    ].join('\n'));
  });
});
