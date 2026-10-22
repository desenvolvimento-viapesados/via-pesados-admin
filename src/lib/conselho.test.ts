import { describe, expect, it } from 'vitest';
import { andamentoDoExperimento, DIRETORIA, SEGUNDA_LEVA, TODA_A_DIRETORIA, iniciais, posicaoNaOrbita, quem } from './conselho';

describe('o conselho no painel', () => {
  it('cada diretor tem slug único', () => {
    const slugs = TODA_A_DIRETORIA.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('a diretoria do painel é a mesma da skill do conselho', () => {
    // A skill grava estes slugs em conselho_falas.diretor; um nome a mais ou
    // a menos aqui deixaria fala sem dono na tela.
    expect(DIRETORIA.map((d) => d.slug)).toEqual(['helena', 'rafael', 'marta', 'livia', 'bruno', 'camila', 'lucas', 'yara']);
    expect(SEGUNDA_LEVA.map((d) => d.slug)).toEqual(['diego', 'sergio', 'paulo', 'thiago', 'gustavo', 'juliana', 'fernanda', 'ana']);
  });

  it('quem: acha pelo slug e não quebra com slug desconhecido', () => {
    expect(quem('marta').cargo).toBe('Financeiro');
    expect(quem('ceo').nome).toBe('Claude');
    expect(quem('fulano').ativo).toBe(false);
  });

  it('iniciais', () => {
    expect(iniciais('Yara Nakamura')).toBe('YN');
    expect(iniciais('Claude')).toBe('C');
  });

  it('a órbita começa no topo', () => {
    const p = posicaoNaOrbita(0, 8, 100);
    expect(Math.round(p.x)).toBe(0);
    expect(Math.round(p.y)).toBe(-100);
  });

  it('andamento do experimento entre a partida e a meta', () => {
    expect(andamentoDoExperimento({ linha_base: 1, meta: 5, leituras: [{ data: '2026-10-28', valor: 3 }] }))
      .toEqual({ atual: 3, fracao: 0.5 });
    expect(andamentoDoExperimento({ linha_base: 1, meta: 5, leituras: [] })).toEqual({ atual: null, fracao: null });
  });
});
