import { describe, it, expect } from 'vitest';
import { conferirCascata, pedacosDe, sugerirDesdobramento } from './cascata';

const f = (inicio: string, fim: string, alvo: number) => ({ id: inicio, inicio, fim, alvo });

describe('fluxo soma, estoque não', () => {
  const meses = [
    f('2026-10-01', '2026-10-31', 4),
    f('2026-11-01', '2026-11-30', 3),
    f('2026-12-01', '2026-12-31', 3),
  ];

  it('novos clientes: as partes somam o trimestre', () => {
    const c = conferirCascata('fluxo', 10, meses);
    expect(c.prometido).toBe(10);
    expect(c.bate).toBe(true);
  });

  it('e acusa quando não fecha', () => {
    const c = conferirCascata('fluxo', 15, meses);
    expect(c.prometido).toBe(10);
    expect(c.diferenca).toBe(-5);
    expect(c.texto).toContain('faltam');
  });

  /* O erro que esta regra evita: somar MRR de três meses e achar que a
     empresa vai faturar o triplo. */
  it('MRR: vale o último mês, não a soma', () => {
    const degraus = [
      f('2026-10-01', '2026-10-31', 4000),
      f('2026-11-01', '2026-11-30', 7000),
      f('2026-12-01', '2026-12-31', 10000),
    ];
    const c = conferirCascata('estoque', 10000, degraus);
    expect(c.prometido).toBe(10000);
    expect(c.bate).toBe(true);
  });

  it('degrau que para antes do alvo é acusado', () => {
    const c = conferirCascata('estoque', 10000, [f('2026-10-01', '2026-10-31', 8000)]);
    expect(c.bate).toBe(false);
    expect(c.texto).toContain('abaixo da meta');
  });

  it('sem filhos, não finge que bate', () => {
    expect(conferirCascata('fluxo', 10, []).bate).toBe(false);
  });
});

describe('em que pedaços o período se divide', () => {
  it('trimestre vira três meses', () => {
    const p = pedacosDe('2026-10-01', '2026-12-31', 'trimestre');
    expect(p).toHaveLength(3);
    expect(p[0].inicio).toBe('2026-10-01');
    expect(p[2].fim).toBe('2026-12-31');
  });

  it('ano vira quatro trimestres', () => {
    const p = pedacosDe('2026-01-01', '2026-12-31', 'ano');
    expect(p).toHaveLength(4);
    expect(p[3].rotulo).toBe('2026 · T4');
  });

  it('período livre de 12 meses vira doze meses', () => {
    expect(pedacosDe('2026-10-01', '2027-09-30', 'livre')).toHaveLength(12);
  });
});

describe('sugestão de desdobramento', () => {
  it('fluxo divide em partes iguais e fecha a conta no fim', () => {
    const p = pedacosDe('2026-10-01', '2026-12-31', 'trimestre');
    const s = sugerirDesdobramento('fluxo', 0, 10, p);
    expect(s.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('fluxo com divisão inexata não deixa sobra', () => {
    const p = pedacosDe('2026-10-01', '2026-12-31', 'trimestre');
    const s = sugerirDesdobramento('fluxo', 0, 100, p);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });

  it('estoque faz degraus e termina no alvo', () => {
    const p = pedacosDe('2026-10-01', '2026-12-31', 'trimestre');
    const s = sugerirDesdobramento('estoque', 1000, 10000, p);
    expect(s).toHaveLength(3);
    expect(s[2]).toBe(10000);
    expect(s[0]).toBeLessThan(s[1]);
  });
});
