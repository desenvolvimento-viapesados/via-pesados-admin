import { describe, expect, it } from 'vitest';
import {
  ANEXOS_POR_DIA, TETO_GLOBAL_HORA, TETO_NOTAS, TETO_POR_IP_HORA, anexarNota, chaveDoWhatsapp, ipDoPedido, janelaDe, lerPedido,
  mascaraDoPedido, notasDoPedido, oQueFazerNoCard, passouDoTeto, whatsappDoPedido,
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

/* Limites da porta pública (27/11/2026): por IP, total, anexos e reaberturas. */
describe('limites do formulário do site', () => {
  const cab = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });

  it('o IP vem do cf-connecting-ip, senão do primeiro x-forwarded-for; IPv6 conta pelo /64', () => {
    expect(ipDoPedido(cab({ 'cf-connecting-ip': '200.1.2.3', 'x-forwarded-for': '9.9.9.9' }))).toBe('200.1.2.3');
    expect(ipDoPedido(cab({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1' }))).toBe('200.1.2.3');
    expect(ipDoPedido(cab({ 'cf-connecting-ip': '2804:14c:5b8:8000:aaaa:bbbb:cccc:dddd' }))).toBe('2804:14c:5b8:8000::/64');
    expect(ipDoPedido(cab({ 'cf-connecting-ip': '2804:14c:5b8:8000::1' }))).toBe('2804:14c:5b8:8000::/64');
    expect(ipDoPedido(cab({ 'cf-connecting-ip': '::ffff:200.1.2.3' }))).toBe('200.1.2.3');
    expect(ipDoPedido(cab({}))).toBe('sem-ip');
    expect(ipDoPedido(cab({ 'x-forwarded-for': '<script>' }))).toBe('sem-ip');
  });

  it('a janela é a hora cheia, ou o dia de Brasília', () => {
    expect(janelaDe(new Date('2026-11-27T14:59:59Z'), 'hora')).toBe('2026-11-27T14:00:00.000Z');
    expect(janelaDe(new Date('2026-11-27T14:00:00Z'), 'dia')).toBe('2026-11-27T03:00:00.000Z');
    /* 01h UTC ainda é dia 26 em Brasília. */
    expect(janelaDe(new Date('2026-11-27T01:00:00Z'), 'dia')).toBe('2026-11-26T03:00:00.000Z');
  });

  it('5 envios por IP por hora passam, o 6º não; o total aguenta 200', () => {
    expect(TETO_POR_IP_HORA).toBe(5);
    expect(TETO_GLOBAL_HORA).toBe(200);
    expect(passouDoTeto(5, TETO_POR_IP_HORA)).toBe(false);
    expect(passouDoTeto(6, TETO_POR_IP_HORA)).toBe(true);
    expect(passouDoTeto(200, TETO_GLOBAL_HORA)).toBe(false);
    expect(passouDoTeto(201, TETO_GLOBAL_HORA)).toBe(true);
  });

  it('o mesmo WhatsApp anexa no card até 3 vezes por dia e só enquanto as notas cabem', () => {
    const card = { notas: 'Pediu contato pelo site.', stage: 'contato', reaberturasHoje: 0 };
    expect(oQueFazerNoCard({ ...card, anexosHoje: ANEXOS_POR_DIA })).toEqual({ anexar: true, reabrir: false });
    expect(oQueFazerNoCard({ ...card, anexosHoje: ANEXOS_POR_DIA + 1 })).toEqual({ anexar: false, reabrir: false });
    expect(oQueFazerNoCard({ ...card, notas: 'x'.repeat(TETO_NOTAS), anexosHoje: 1 }).anexar).toBe(false);
    expect(oQueFazerNoCard({ ...card, notas: null, anexosHoje: 1 }).anexar).toBe(true);
  });

  it('card perdido volta para o começo uma vez por dia', () => {
    const perdido = { notas: '', stage: 'perdido', anexosHoje: 1 };
    expect(oQueFazerNoCard({ ...perdido, reaberturasHoje: 1 }).reabrir).toBe(true);
    expect(oQueFazerNoCard({ ...perdido, reaberturasHoje: 2 }).reabrir).toBe(false);
    expect(oQueFazerNoCard({ ...perdido, stage: 'contato', reaberturasHoje: 1 }).reabrir).toBe(false);
  });

  it('anexar nota respeita o teto de 4.000 letras', () => {
    expect(anexarNota('a', 'b')).toBe('a\nb');
    expect(anexarNota(null, 'b')).toBe('b');
    const cheia = 'x'.repeat(TETO_NOTAS);
    expect(anexarNota(cheia, 'b')).toBe(cheia);
  });
});
