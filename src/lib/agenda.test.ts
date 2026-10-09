import { describe, expect, it } from 'vitest';
import {
  inicioDaSemana, gradeDoMes, posicaoNoDia, horarioDoClique, colunasDeSobreposicao, proximaMeiaHora, PX_POR_HORA,
} from './agenda';

describe('agenda', () => {
  it('a semana começa na segunda', () => {
    expect(inicioDaSemana(new Date(2026, 9, 9)).getDate()).toBe(5);   // sex 09/10 → seg 05/10
    expect(inicioDaSemana(new Date(2026, 9, 11)).getDate()).toBe(5);  // dom 11/10 → seg 05/10
    expect(inicioDaSemana(new Date(2026, 9, 12)).getDate()).toBe(12); // seg 12/10
  });

  it('o mês tem 42 casas e começa na segunda antes do dia 1', () => {
    const g = gradeDoMes(new Date(2026, 9, 15));
    expect(g).toHaveLength(42);
    expect(g[0].getDay()).toBe(1);
    expect(g.some((d) => d.getDate() === 1 && d.getMonth() === 9)).toBe(true);
  });

  it('posição na grade: 9h com 45 min', () => {
    const { top, altura } = posicaoNoDia(new Date(2026, 9, 9, 9, 0), 45);
    expect(top).toBe(2 * PX_POR_HORA); // grade começa às 7h
    expect(altura).toBe(0.75 * PX_POR_HORA);
  });

  it('clique cai no começo da faixa de 30 min; arrasto usa 15', () => {
    const d = horarioDoClique(new Date(2026, 9, 9), 3.4 * PX_POR_HORA); // 10h24
    expect([d.getHours(), d.getMinutes()]).toEqual([10, 0]);
    const e = horarioDoClique(new Date(2026, 9, 9), 3.4 * PX_POR_HORA, 15);
    expect([e.getHours(), e.getMinutes()]).toEqual([10, 15]);
    const f = horarioDoClique(new Date(2026, 9, 9), -20, 15); // acima da grade
    expect([f.getHours(), f.getMinutes()]).toEqual([7, 0]);
  });

  it('reuniões que se sobrepõem dividem a coluna', () => {
    const r = colunasDeSobreposicao([
      { id: 'a', inicio: 540, fim: 600 },
      { id: 'b', inicio: 570, fim: 630 },
      { id: 'c', inicio: 700, fim: 730 },
    ]);
    expect(r.get('a')).toEqual({ coluna: 0, total: 2 });
    expect(r.get('b')).toEqual({ coluna: 1, total: 2 });
    expect(r.get('c')).toEqual({ coluna: 0, total: 1 });
  });

  it('próxima meia hora', () => {
    const d = proximaMeiaHora(new Date(2026, 9, 9, 14, 7));
    expect([d.getHours(), d.getMinutes()]).toEqual([14, 30]);
    const e = proximaMeiaHora(new Date(2026, 9, 9, 14, 40));
    expect([e.getHours(), e.getMinutes()]).toEqual([15, 0]);
  });
});
