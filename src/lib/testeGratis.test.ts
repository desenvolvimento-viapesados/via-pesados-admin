import { describe, expect, it } from 'vitest';
import {
  fimDoTeste, diaDoCorte, diaDoTeste, diasRestantes, acabou, primeiroVencimento, ancoraDoCiclo,
  mensagemDoDia, tarefasDoTeste, diaDaReconquista,
} from '../../supabase/functions/_shared/teste';
import { somarDias } from '../../supabase/functions/_shared/regua';

/* As contas do teste grátis — regra do dono em 16/10/2026 (60 dias desde
   23/10/2026): contados da implantação, corte no dia seguinte ao fim,
   contagem só pelo WhatsApp. */

const INICIO = '2026-10-16';

describe('as datas do teste', () => {
  it('implantou dia 16/10: vai até 15/12 e corta em 16/12 — os 60 dias da oferta', () => {
    expect(fimDoTeste(INICIO)).toBe('2026-12-15');
    expect(diaDoCorte(fimDoTeste(INICIO))).toBe('2026-12-16');
  });

  it('dias a mais da equipe empurram o fim', () => {
    expect(fimDoTeste(INICIO, 7)).toBe('2026-12-22');
  });

  it('conta o dia 1 na implantação e o que resta incluindo hoje', () => {
    const fim = fimDoTeste(INICIO);
    expect(diaDoTeste(INICIO, INICIO)).toBe(1);
    expect(diasRestantes(fim, fim)).toBe(1);
    expect(diasRestantes(fim, somarDias(fim, 1))).toBe(0);
    expect(acabou(fim, fim)).toBe(false);
    expect(acabou(fim, somarDias(fim, 1))).toBe(true);
  });
});

describe('quem assina durante o teste só paga quando ele acaba', () => {
  const teste = { inicio: INICIO, fim: fimDoTeste(INICIO) };

  it('primeira mensalidade no dia do corte', () => {
    expect(primeiroVencimento(teste, '2026-10-25')).toBe('2026-12-16');
  });

  it('já acabou: a folga normal de 3 dias', () => {
    expect(primeiroVencimento(teste, '2026-12-20')).toBe('2026-12-23');
  });

  it('assinou antes da implantação: depois do teste inteiro, e a implantação realinha', () => {
    expect(primeiroVencimento({ inicio: null, fim: null }, '2026-10-10')).toBe('2026-12-10');
  });

  it('sem teste, nada muda', () => {
    expect(primeiroVencimento(null, '2026-10-10')).toBe('2026-10-13');
    expect(ancoraDoCiclo('2026-10-16', null)).toBe('2026-10-16');
  });

  it('o ciclo conta do corte: o mês grátis não vira mês cobrado', () => {
    expect(ancoraDoCiclo('2026-10-16', teste)).toBe('2026-12-16');
  });
});

describe('as mensagens saem uma vez, na ordem certa', () => {
  const fim = fimDoTeste(INICIO);
  const dias = Array.from({ length: 64 }, (_, i) => somarDias(INICIO, i));
  const doDia = dias.map((d) => [d, mensagemDoDia({ inicio: INICIO, fim }, d)?.marco ?? null] as const);

  it('começou nos primeiros dias, faltam 5 perto do fim, véspera no penúltimo', () => {
    expect(doDia.find(([d]) => d === INICIO)?.[1]).toBe('comecou');
    expect(doDia.find(([d]) => d === somarDias(fim, -5))?.[1]).toBe('faltam_5');
    expect(doDia.find(([d]) => d === somarDias(fim, -1))?.[1]).toBe('termina_amanha');
  });

  it('nunca "faltam 5" na véspera, e nada depois do fim', () => {
    expect(doDia.find(([d]) => d === somarDias(fim, -2))?.[1]).toBe(null);
    expect(doDia.find(([d]) => d === fim)?.[1]).toBe(null);
    expect(doDia.filter(([d]) => d > fim).every(([, m]) => m === null)).toBe(true);
  });

  it('o meio do teste é silencioso (quem fala é o vendedor)', () => {
    expect(doDia.find(([d]) => d === somarDias(INICIO, 10))?.[1]).toBe(null);
  });

  it('reconquista três dias depois do corte', () => {
    expect(diaDaReconquista(fim)).toBe('2026-12-19');
  });
});

describe('as tarefas do vendedor', () => {
  it('cinco pontos, em ordem, dentro do teste', () => {
    const fim = fimDoTeste(INICIO);
    const t = tarefasDoTeste(INICIO, fim);
    expect(t.map((x) => x.marco)).toEqual([
      'teste:primeiro_dia', 'teste:primeira_semana', 'teste:metade', 'teste:faltam_5', 'teste:ultimo_dia',
    ]);
    expect(t.map((x) => x.dia)).toEqual(['2026-10-17', '2026-10-23', '2026-11-15', '2026-12-10', '2026-12-14']);
    expect(t.every((x) => x.dia >= INICIO && x.dia <= fim)).toBe(true);
  });
});
