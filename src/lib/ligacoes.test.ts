import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { placar, atendeu, faltaParaSalvar, inicioDoDia, DORES, ROTULO_DO_RESULTADO, type LigacaoFeita } from './ligacoes';

const l = (resultado: LigacaoFeita['resultado'], quem: LigacaoFeita['quem_atendeu'] = null): LigacaoFeita =>
  ({ resultado, quem_atendeu: quem, feita_em: '2026-11-18T13:00:00Z' });

describe('ligações: placar', () => {
  it('conta atendidas, reuniões e taxas', () => {
    const p = placar([
      l('nao_atendeu'), l('nao_atendeu'), l('numero_errado'),
      l('reuniao', 'dono'), l('retornar', 'vendedor'), l('mandar_video', 'vendedor'), l('sem_interesse', 'socio'),
    ]);
    expect(p.ligacoes).toBe(7);
    expect(p.atendidas).toBe(4);
    expect(p.reunioes).toBe(1);
    expect(p.taxaAtendimento).toBe(57);
    expect(p.taxaReuniao).toBe(25);
    expect(p.taxaDono).toBe(50);
  });
  it('sem ligação, taxa vazia (não 0%)', () => {
    expect(placar([]).taxaAtendimento).toBeNull();
    expect(placar([l('nao_atendeu')]).taxaReuniao).toBeNull();
  });
  it('não atendeu e número errado não contam como atendida', () => {
    expect(atendeu('nao_atendeu')).toBe(false);
    expect(atendeu('numero_errado')).toBe(false);
    expect(atendeu('sem_interesse')).toBe(true);
  });
});

describe('ligações: o que falta para salvar', () => {
  it('reunião pede data; retorno pede data', () => {
    expect(faltaParaSalvar({ resultado: null })).toMatch(/Escolha/);
    expect(faltaParaSalvar({ resultado: 'reuniao' })).toMatch(/reunião/);
    expect(faltaParaSalvar({ resultado: 'reuniao', reuniaoEm: '2026-11-19T10:00' })).toBeNull();
    expect(faltaParaSalvar({ resultado: 'retornar' })).toMatch(/ligar de novo/);
    expect(faltaParaSalvar({ resultado: 'nao_atendeu' })).toBeNull();
  });
});

describe('ligações: dia de Brasília', () => {
  it('23h30 em Brasília (02h30 UTC do dia seguinte) ainda é o mesmo dia', () => {
    const ini = inicioDoDia(new Date('2026-11-19T02:30:00Z'));
    expect(ini.toISOString()).toBe('2026-11-18T03:00:00.000Z');
  });
});

describe('ligações: banco e rótulos andam juntos', () => {
  const sql = readFileSync('supabase/migrations/20261118120000_prospeccao_ligacoes.sql', 'utf8');
  it('todo resultado e toda dor da tela existem na regra do banco', () => {
    for (const r of Object.keys(ROTULO_DO_RESULTADO)) expect(sql).toContain(`'${r}'`);
    for (const d of DORES) expect(sql).toContain(`'${d.chave}'`);
  });
  it('a lista do dia deixa de fora quem está com o Davi ou com você', () => {
    const lista = sql.slice(sql.indexOf('function public.ligacoes_do_dia'), sql.indexOf('function public.registrar_ligacao'));
    expect(lista).toMatch(/status in \('pronta', 'sem_whatsapp', 'em_contato', 'sem_resposta'\)/);
    expect(lista).not.toMatch(/'conversando'|'com_voce'/);
  });
});
