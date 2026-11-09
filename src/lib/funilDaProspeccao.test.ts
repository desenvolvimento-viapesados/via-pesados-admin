import { describe, expect, it } from 'vitest';
import { chegaramAte, posicaoNoFunil, respostas, taxa, type FatosDaLoja } from './funilDaProspeccao';

const agora = new Date('2026-11-09T15:00:00Z');
const loja = (status: FatosDaLoja['loja']['status'], extra: Partial<FatosDaLoja['loja']> = {}) => ({ status, nome: 'Minas Caminhões', ...extra });

describe('o funil da prospecção anda sozinho (dono, 09/11/2026)', () => {
  it('na fila ainda não está no funil', () => {
    expect(posicaoNoFunil({ loja: loja('pronta') }, agora).fase).toBeNull();
    expect(posicaoNoFunil({ loja: loja('descartada') }, agora).fase).toBeNull();
  });

  it('recebeu as mensagens: abordada; sem resposta vai para o lado', () => {
    expect(posicaoNoFunil({ loja: loja('em_contato') }, agora)).toMatchObject({ fase: 'abordada', lado: null });
    expect(posicaoNoFunil({ loja: loja('sem_resposta') }, agora)).toMatchObject({ fase: 'abordada', lado: 'sem_resposta' });
  });

  it('respondeu: em conversa; com loja, estoque e cargo: qualificada', () => {
    const c = { etapa: 'conversa' as const, situacao: { estoque: '35' } };
    expect(posicaoNoFunil({ loja: loja('conversando', { respondeu_em: '2026-11-09T12:00:00Z' }), conversa: c }, agora).fase).toBe('conversando');
    const q = { etapa: 'conversa' as const, situacao: { estoque: '35', cargo: 'dono' } };
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: q }, agora).fase).toBe('qualificada');
    /* Sem o nome na lista, a loja tem de vir da conversa. */
    expect(posicaoNoFunil({ loja: loja('conversando', { nome: '' }), conversa: q }, agora).fase).toBe('conversando');
  });

  it('horários oferecidos: convite; reunião de pé: reunião marcada', () => {
    const conv = { etapa: 'compromisso' as const, situacao: {}, horarios_oferecidos: ['2026-11-10T12:00:00Z'] };
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: conv }, agora).fase).toBe('convite');
    const r = { status: 'agendada', scheduled_at: '2026-11-10T12:00:00Z' };
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { ...conv, etapa: 'agendado' }, reuniao: r }, agora))
      .toEqual({ fase: 'reuniao', lado: null, reuniaoPassou: false });
  });

  it('a reunião passou e ninguém contou como foi: continua marcada, com o aviso', () => {
    const r = { status: 'agendada', scheduled_at: '2026-11-09T12:00:00Z' };
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'agendado' }, reuniao: r }, agora))
      .toEqual({ fase: 'reuniao', lado: null, reuniaoPassou: true });
  });

  it('realizada na Agenda, teste e venda no card do funil principal', () => {
    const r = { status: 'realizada', scheduled_at: '2026-11-09T12:00:00Z' };
    const base = { loja: loja('conversando'), conversa: { etapa: 'agendado' as const } };
    expect(posicaoNoFunil({ ...base, reuniao: r }, agora).fase).toBe('realizada');
    expect(posicaoNoFunil({ ...base, reuniao: r, card: { stage: 'teste' } }, agora).fase).toBe('teste');
    expect(posicaoNoFunil({ ...base, reuniao: r, card: { stage: 'vendido' } }, agora).fase).toBe('cliente');
  });

  it('reunião cancelada volta ao convite (o caminho é o que vale agora)', () => {
    const conv = { etapa: 'compromisso' as const, horarios_oferecidos: ['x'] };
    const r = { status: 'cancelada', scheduled_at: '2026-11-10T12:00:00Z' };
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: conv, reuniao: r }, agora).fase).toBe('convite');
  });

  it('perdida: não quer, pediu para sair ou card perdido; o quanto andou fica guardado', () => {
    expect(posicaoNoFunil({ loja: loja('sem_interesse') }, agora)).toMatchObject({ fase: 'abordada', lado: 'perdida' });
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'saiu', horarios_oferecidos: ['x'] } }, agora))
      .toMatchObject({ fase: 'convite', lado: 'perdida' });
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'conversa' }, card: { stage: 'perdido' } }, agora).lado).toBe('perdida');
  });

  it('esperando você: o Davi chamou o Xavier ou a equipe entrou; com reunião marcada, fica na reunião', () => {
    expect(posicaoNoFunil({ loja: loja('com_voce') }, agora)).toMatchObject({ fase: 'conversando', lado: 'com_voce' });
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'com_xavier' } }, agora).lado).toBe('com_voce');
    expect(posicaoNoFunil({ loja: loja('conversando', { humano_assumiu: true }), conversa: { etapa: 'conversa' } }, agora).lado).toBe('com_voce');
    const r = { status: 'agendada', scheduled_at: '2026-11-10T12:00:00Z' };
    expect(posicaoNoFunil({ loja: loja('com_voce'), conversa: { etapa: 'com_xavier' }, reuniao: r }, agora)).toMatchObject({ fase: 'reuniao', lado: null });
  });

  it('teste ou cliente valem mesmo que a conversa tenha sido encerrada', () => {
    expect(posicaoNoFunil({ loja: loja('sem_interesse'), conversa: { etapa: 'saiu' }, card: { stage: 'vendido' } }, agora))
      .toMatchObject({ fase: 'cliente', lado: null });
  });
});

describe('as contas do funil', () => {
  it('quem chegou a uma fase conta em todas as anteriores', () => {
    const n = chegaramAte([
      { fase: 'abordada', lado: null, reuniaoPassou: false },
      { fase: 'conversando', lado: null, reuniaoPassou: false },
      { fase: 'reuniao', lado: null, reuniaoPassou: false },
      { fase: null, lado: null, reuniaoPassou: false },
    ]);
    expect(n.abordada).toBe(3);
    expect(n.conversando).toBe(2);
    expect(n.qualificada).toBe(1);
    expect(n.reuniao).toBe(1);
    expect(n.cliente).toBe(0);
  });

  it('a taxa em porcentagem, sem base fica vazia', () => {
    expect(taxa(8, 100)).toBe('8,0%');
    expect(taxa(25, 100)).toBe('25%');
    expect(taxa(0, 100)).toBe('0%');
    expect(taxa(3, 0)).toBe('');
  });

  it('o que o Davi descobriu sai na ordem e só o que tem resposta', () => {
    expect(respostas({ cargo: 'dono', estoque: '35', segmento: 'caminhoes', canais: '  ' })).toEqual([
      { rotulo: 'Estoque', valor: '35' },
      { rotulo: 'Quem fala', valor: 'dono' },
      { rotulo: 'Vende', valor: 'Caminhões' },
    ]);
  });
});
