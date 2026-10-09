import { describe, expect, it } from 'vitest';
import { funilDoCanal, rotuloDoFunil, ehFunil } from './funis';

describe('funis', () => {
  it('o canal sugere o funil', () => {
    expect(funilDoCanal('indicacao')).toBe('indicacao');
    expect(funilDoCanal('instagram')).toBe('anuncios');
    expect(funilDoCanal('google')).toBe('anuncios');
    expect(funilDoCanal('base-de-contatos')).toBe('fria');
    expect(funilDoCanal(null)).toBe('fria');
  });
  it('rótulos e validação', () => {
    expect(rotuloDoFunil('anuncios')).toBe('Anúncios');
    expect(ehFunil('todos')).toBe(false);
    expect(ehFunil('fria')).toBe(true);
  });
});
