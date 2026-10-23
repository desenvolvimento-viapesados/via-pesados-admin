import { describe, it, expect } from 'vitest';
import { whatsappCompleto } from './mascaras';

describe('whatsappCompleto', () => {
  it('aceita fixo e celular com DDD, mascarados ou não', () => {
    expect(whatsappCompleto('(33) 98814-4005')).toBe(true);
    expect(whatsappCompleto('3332714005')).toBe(true);
  });

  it('prospect sem número ou com número pela metade não marca reunião', () => {
    expect(whatsappCompleto(null)).toBe(false);
    expect(whatsappCompleto('')).toBe(false);
    expect(whatsappCompleto('(33) 9881')).toBe(false);
  });
});
