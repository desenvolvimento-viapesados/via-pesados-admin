import { describe, it, expect } from 'vitest';
import {
  progressoDoKr, superou, fracaoDoTempo, saudeDoKr, previsaoFinal,
  progressoDoObjetivo, resumoDoCiclo, formatarValor, cicloDaData,
} from './okr';

const kr = (p: Record<string, unknown> = {}) => ({
  partida: 0, alvo: 10, direcao: 'subir' as const, atual: 0, unidade: 'numero' as const, ...p,
});

describe('progresso conta da partida, não do zero', () => {
  it('metade do caminho é 50%', () => {
    expect(progressoDoKr(kr({ atual: 5 }))).toBe(0.5);
  });

  /* O erro clássico: 8 de 10 parece 80% feito, mas quem já estava em 8
     não andou nada. */
  it('quem começa em 8 e está em 8 não andou nada', () => {
    expect(progressoDoKr(kr({ partida: 8, alvo: 10, atual: 8 }))).toBe(0);
    expect(progressoDoKr(kr({ partida: 8, alvo: 10, atual: 9 }))).toBe(0.5);
  });

  it('meta de descer: inadimplência de 10% para 2%', () => {
    const baixar = kr({ partida: 10, alvo: 2, direcao: 'descer', unidade: 'percentual' });
    expect(progressoDoKr({ ...baixar, atual: 6 })).toBe(0.5);
    expect(progressoDoKr({ ...baixar, atual: 12 })).toBe(0);
    expect(progressoDoKr({ ...baixar, atual: 2 })).toBe(1);
  });

  it('marco é sim ou não', () => {
    expect(progressoDoKr(kr({ unidade: 'marco', alvo: 1, atual: 0 }))).toBe(0);
    expect(progressoDoKr(kr({ unidade: 'marco', alvo: 1, atual: 1 }))).toBe(1);
  });

  it('sem medida é null, e null não é zero', () => {
    expect(progressoDoKr(kr({ atual: null }))).toBeNull();
    expect(progressoDoKr(kr({ atual: 0 }))).toBe(0);
  });

  it('passar do alvo aparece como superação, e a barra não estoura', () => {
    expect(progressoDoKr(kr({ atual: 14 }))).toBe(1);
    expect(superou(kr({ atual: 14 }))).toBe(true);
    expect(superou({ alvo: 2, direcao: 'descer', atual: 1 })).toBe(true);
    expect(superou(kr({ atual: 9 }))).toBe(false);
  });
});

describe('ritmo: progresso contra o relógio', () => {
  const ciclo = { inicio: '2026-10-01', fim: '2026-12-31' };
  const meio = new Date('2026-11-15T12:00:00').getTime();

  it('meio do trimestre é metade do tempo', () => {
    expect(fracaoDoTempo(ciclo, meio)).toBeCloseTo(0.5, 1);
  });

  it('antes de começar é 0; depois do fim é 1', () => {
    expect(fracaoDoTempo(ciclo, new Date('2026-09-01').getTime())).toBe(0);
    expect(fracaoDoTempo(ciclo, new Date('2027-02-01').getTime())).toBe(1);
  });

  /* 50% com metade do tempo é ritmo; os mesmos 50% na última semana não. */
  it('a mesma metade feita muda de cor conforme o tempo', () => {
    expect(saudeDoKr(0.5, 0.5)).toBe('no_ritmo');
    expect(saudeDoKr(0.5, 0.9)).toBe('risco');
    expect(saudeDoKr(0.5, 0.68)).toBe('atencao');
    expect(saudeDoKr(0.9, 0.5)).toBe('adiantado');
  });

  it('sem medida não vira risco automático: é outra conversa', () => {
    expect(saudeDoKr(null, 0.9)).toBe('sem_medida');
  });
});

describe('previsão', () => {
  it('projeta o fim pelo ritmo até aqui', () => {
    expect(previsaoFinal({ partida: 0, atual: 5 }, 0.5)).toBe(10);
    expect(previsaoFinal({ partida: 10, atual: 20 }, 0.5)).toBe(30);
  });

  it('cedo demais não projeta — erraria feio e pareceria certeza', () => {
    expect(previsaoFinal({ partida: 0, atual: 1 }, 0.05)).toBeNull();
    expect(previsaoFinal({ partida: 0, atual: null }, 0.5)).toBeNull();
  });
});

describe('objetivo e ciclo', () => {
  it('o objetivo é a média dos KRs medidos', () => {
    expect(progressoDoObjetivo([kr({ atual: 10 }), kr({ atual: 0 })])).toBe(0.5);
  });

  it('KR sem medida não puxa a média para baixo', () => {
    expect(progressoDoObjetivo([kr({ atual: 10 }), kr({ atual: null })])).toBe(1);
    expect(progressoDoObjetivo([kr({ atual: null })])).toBeNull();
  });

  it('o resumo conta o que precisa de reunião', () => {
    const r = resumoDoCiclo([
      { krs: [kr({ atual: 10 }), kr({ atual: 1 })] },
      { krs: [kr({ atual: null })] },
    ], 0.8);
    expect(r).toMatchObject({ objetivos: 2, krs: 3, emRisco: 1, semMedida: 1 });
    expect(r.progresso).toBeCloseTo(0.55, 2);
  });
});

describe('formato e ciclos', () => {
  it('cada unidade aparece do seu jeito', () => {
    expect(formatarValor(1500, 'moeda')).toContain('1.500');
    expect(formatarValor(42, 'percentual')).toBe('42%');
    expect(formatarValor(1, 'marco')).toBe('feito');
    expect(formatarValor(null, 'numero')).toBe('—');
  });

  it('o trimestre de outubro vai de 01/10 a 31/12', () => {
    const c = cicloDaData('trimestre', new Date('2026-10-15T12:00:00'));
    expect(c).toMatchObject({ rotulo: '2026 · T4', inicio: '2026-10-01', fim: '2026-12-31' });
  });

  it('fevereiro de ano bissexto termina em 29', () => {
    expect(cicloDaData('mes', new Date('2028-02-10T12:00:00')).fim).toBe('2028-02-29');
  });

  it('cinco anos conta a partir do ano atual', () => {
    const c = cicloDaData('cinco_anos', new Date('2026-05-01T12:00:00'));
    expect(c).toMatchObject({ rotulo: '2026–2030', inicio: '2026-01-01', fim: '2030-12-31' });
  });
});
