import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  conflitosDaAgenda, conversaDaChave, inicioDoDiaBRT, lerHorario, nomeDoEnvio, partirMensagem, quandoFalado, taxa,
} from '../../supabase/functions/_shared/gestor-regras';

describe('gestor do dono: regras', () => {
  it('meia-noite de Brasília, hoje e dias atrás', () => {
    const agora = new Date('2026-11-25T21:30:00Z'); // 18h30 em Brasília
    expect(inicioDoDiaBRT(agora).toISOString()).toBe('2026-11-25T03:00:00.000Z');
    expect(inicioDoDiaBRT(agora, 1).toISOString()).toBe('2026-11-24T03:00:00.000Z');
    /* 01h UTC ainda é o dia anterior em Brasília */
    expect(inicioDoDiaBRT(new Date('2026-11-26T01:00:00Z')).toISOString()).toBe('2026-11-25T03:00:00.000Z');
  });

  it('horário sem fuso é de Brasília; com fuso, respeita', () => {
    expect(lerHorario('2026-11-26T15:00')?.toISOString()).toBe('2026-11-26T18:00:00.000Z');
    expect(lerHorario('2026-11-26T15:00:00-03:00')?.toISOString()).toBe('2026-11-26T18:00:00.000Z');
    expect(lerHorario('amanhã às 3')).toBeNull();
  });

  it('fala o horário como gente', () => {
    expect(quandoFalado('2026-11-26T13:30:00Z')).toBe('quinta, 26/11 às 10h30');
    expect(quandoFalado('2026-11-27T16:00:00Z')).toBe('sexta, 27/11 às 13h');
  });

  it('conflito: menos de 1 hora de outra reunião; a própria e as canceladas não contam', () => {
    const agenda = [
      { id: 'a', scheduled_at: '2026-11-26T12:00:00Z', status: 'agendada' },
      { id: 'b', scheduled_at: '2026-11-26T15:00:00Z', status: 'cancelada' },
      { id: 'c', scheduled_at: '2026-11-26T13:30:00Z', status: 'agendada' },
    ];
    expect(conflitosDaAgenda(new Date('2026-11-26T12:30:00Z'), agenda, null).map((r) => r.id)).toEqual(['a']);
    expect(conflitosDaAgenda(new Date('2026-11-26T12:45:00Z'), agenda, null).map((r) => r.id)).toEqual(['a', 'c']);
    expect(conflitosDaAgenda(new Date('2026-11-26T15:00:00Z'), agenda, null)).toEqual([]);
    expect(conflitosDaAgenda(new Date('2026-11-26T13:00:00Z'), agenda, 'c')).toEqual([]);
  });

  it('acha a conversa dentro da chave do aviso', () => {
    expect(conversaDaChave('aviso_lead_crm:oportunidade:6BDC46BE-d292-4621-918e-aa139ebfd8f2:5527997246060'))
      .toBe('6bdc46be-d292-4621-918e-aa139ebfd8f2');
    expect(conversaDaChave('aviso_reuniao:abc')).toBeNull();
  });

  it('corta mensagem longa em partes que o WhatsApp aceita', () => {
    const longo = Array.from({ length: 40 }, (_, i) => `Parágrafo ${i} ${'x'.repeat(150)}`).join('\n\n');
    const partes = partirMensagem(longo, 1000);
    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every((p) => p.length <= 1000)).toBe(true);
    expect(partes.join('').replace(/\s/g, '')).toBe(longo.replace(/\s/g, ''));
    expect(partirMensagem('  ')).toEqual([]);
  });

  it('nomes da sequência e taxa', () => {
    expect(nomeDoEnvio('contato', 1)).toContain('1ª mensagem');
    expect(nomeDoEnvio('cadencia', 2)).toContain('vídeo');
    expect(taxa(3, 40)).toBe('3 de 40 (8%)');
    expect(taxa(0, 0)).toBe('0 de 0');
  });

  it('o wa-receber manda a mensagem do dono para o gestor sem carregar a IA', () => {
    const src = readFileSync('supabase/functions/wa-receber/index.ts', 'utf8');
    expect(src).toContain('gestor-responder');
    expect(src).not.toMatch(/from '\.\.\/_shared\/gestor\.ts'/);
    expect(src).not.toMatch(/from '\.\.\/_shared\/assistente\.ts'/);
  });

  it('o gestor não importa de volta o que importa dele (sem import circular)', () => {
    const assistente = readFileSync('supabase/functions/_shared/assistente.ts', 'utf8');
    expect(assistente).not.toMatch(/from '\.\/gestor\.ts'/);
  });
});
