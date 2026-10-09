import { describe, expect, it } from 'vitest';
import {
  hojeBRT, dentroDaJanela, proximaAbertura, somarMeses, vencimentosDoCiclo, hojeEnviaMensalidade, passouDaTolerancia,
} from '../../supabase/functions/_shared/regua';

/* As regras da cobrança, como o dono definiu em 09/10/2026. */
describe('régua da mensalidade', () => {
  it('a mensagem da 01h25 não sai: espera as 08h', () => {
    const madrugada = new Date('2026-10-09T04:25:00Z'); // 01h25 em Brasília
    expect(dentroDaJanela(madrugada)).toBe(false);
    expect(proximaAbertura(madrugada).toISOString()).toBe('2026-10-09T11:00:00.000Z'); // 08h
  });

  it('janela: 08h00 sai, 19h59 sai, 20h00 espera o dia seguinte', () => {
    expect(dentroDaJanela(new Date('2026-10-09T11:00:00Z'))).toBe(true);  // 08h00
    expect(dentroDaJanela(new Date('2026-10-09T22:59:00Z'))).toBe(true);  // 19h59
    const vinte = new Date('2026-10-09T23:00:00Z');                       // 20h00
    expect(dentroDaJanela(vinte)).toBe(false);
    expect(proximaAbertura(vinte).toISOString()).toBe('2026-10-10T11:00:00.000Z');
    // 23h30 de Brasília já é dia seguinte em UTC — e continua indo para as 08h do dia seguinte de Brasília
    expect(proximaAbertura(new Date('2026-10-10T02:30:00Z')).toISOString()).toBe('2026-10-10T11:00:00.000Z');
  });

  it('hoje em Brasília, não em UTC', () => {
    expect(hojeBRT(new Date('2026-10-10T02:00:00Z'))).toBe('2026-10-09'); // 23h do dia 9
  });

  it('ciclo da iTruck: implantou 14/09, pagou 1 — as abertas vencem 14/10 e 14/11, a próxima em 14/12', () => {
    expect(vencimentosDoCiclo('2026-09-14', 1, 2)).toEqual({
      vencimentos: ['2026-10-14', '2026-11-14'],
      proxima: '2026-12-14',
    });
  });

  it('mês curto encosta no último dia', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('mensalidade sai 5 dias antes; corte no terceiro dia depois do vencimento', () => {
    expect(hojeEnviaMensalidade('2026-10-14', '2026-10-08')).toBe(false);
    expect(hojeEnviaMensalidade('2026-10-14', '2026-10-09')).toBe(true);
    expect(hojeEnviaMensalidade('2026-10-14', '2026-10-14')).toBe(true);
    expect(hojeEnviaMensalidade('2026-10-14', '2026-10-15')).toBe(false);
    expect(passouDaTolerancia('2026-10-14', '2026-10-16')).toBe(false);
    expect(passouDaTolerancia('2026-10-14', '2026-10-17')).toBe(true);
  });
});
