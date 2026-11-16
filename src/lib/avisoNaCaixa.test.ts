import { describe, it, expect } from 'vitest';
import { textoDoModeloEnviado } from '../../supabase/functions/_shared/wa.ts';

/**
 * O aviso automático aparece na tela de WhatsApp com o texto que a pessoa recebeu
 * (16/11/2026: aviso de reunião, lembrete e cobrança saíam e não ficavam em lugar nenhum).
 */
describe('texto do aviso na conversa', () => {
  it('troca as variáveis do corpo e mostra os botões', () => {
    const t = textoDoModeloEnviado('aviso_reuniao_marcada', {
      body: ['marcou', 'MF Caminhões, Uberlândia/MG', 'terça, 17/11, 13h'], urlSuffix: 'abc',
    });
    expect(t).toContain('O Davi marcou uma reunião');
    expect(t).toContain('Loja: MF Caminhões, Uberlândia/MG');
    expect(t).toContain('Quando: terça, 17/11, 13h');
    expect(t).not.toMatch(/\{\{\d\}\}/);
  });

  it('modelo que não conheço ainda deixa rastro', () => {
    expect(textoDoModeloEnviado('nao_existe', {})).toBe('[modelo nao_existe]');
  });
});
