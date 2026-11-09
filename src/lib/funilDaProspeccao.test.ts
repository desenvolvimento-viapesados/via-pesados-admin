import { describe, expect, it } from 'vitest';
import {
  cargoCurto, chegaramAte, estoqueCurto, maiorEtapaDoCard, posicaoNoFunil, respostas, reuniaoQueVale, taxa, vendedorDoAnuncio,
  type FatosDaLoja, type PosicaoNoFunil,
} from './funilDaProspeccao';

const agora = new Date('2026-11-09T15:00:00Z');
const ABORDOU = '2026-11-08T12:00:00Z';
const loja = (status: FatosDaLoja['loja']['status'], extra: Partial<FatosDaLoja['loja']> = {}) =>
  ({ status, nome: 'Minas Caminhões', primeiro_contato_em: ABORDOU, contatos: 1, ...extra });
const amanha = { status: 'agendada', scheduled_at: '2026-11-10T12:00:00Z' };
const hojeCedo = { status: 'agendada', scheduled_at: '2026-11-09T12:00:00Z' };

describe('o funil da prospecção anda sozinho (dono, 09/11/2026)', () => {
  it('quem não recebeu a prospecção não está no funil (nem quem escreveu antes por conta própria)', () => {
    expect(posicaoNoFunil({ loja: loja('pronta', { primeiro_contato_em: null, contatos: 0 }) }, agora).fase).toBeNull();
    expect(posicaoNoFunil({ loja: loja('conversando', { primeiro_contato_em: null, contatos: 0, respondeu_em: ABORDOU }) }, agora).fase).toBeNull();
  });

  it('recebeu as mensagens: abordada; sem resposta vai para o lado', () => {
    expect(posicaoNoFunil({ loja: loja('em_contato') }, agora)).toMatchObject({ fase: 'abordada', lado: null });
    expect(posicaoNoFunil({ loja: loja('sem_resposta') }, agora)).toMatchObject({ fase: 'abordada', lado: 'sem_resposta' });
  });

  it('respondeu: em conversa; com loja, estoque e cargo: qualificada', () => {
    const c = { etapa: 'conversa' as const, situacao: { estoque: '35' } };
    expect(posicaoNoFunil({ loja: loja('conversando', { respondeu_em: ABORDOU }), conversa: c }, agora).fase).toBe('conversando');
    const q = { etapa: 'conversa' as const, situacao: { estoque: '35', cargo: 'dono' } };
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: q }, agora).fase).toBe('qualificada');
    /* Sem o nome na lista, a loja tem de vir da conversa. */
    expect(posicaoNoFunil({ loja: loja('conversando', { nome: '' }), conversa: q }, agora).fase).toBe('conversando');
  });

  it('horários oferecidos: convite; reunião de pé na Agenda: reunião marcada', () => {
    const conv = { etapa: 'compromisso' as const, situacao: {}, horarios_oferecidos: ['2026-11-10T12:00:00Z'] };
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: conv }, agora).fase).toBe('convite');
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { ...conv, etapa: 'agendado' }, reuniao: amanha }, agora))
      .toEqual({ fase: 'reuniao', lado: null, reuniaoPassou: false, reuniaoCancelada: false });
  });

  it('a reunião passou e ninguém contou como foi: continua marcada, com o aviso', () => {
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'agendado' }, reuniao: hojeCedo }, agora))
      .toMatchObject({ fase: 'reuniao', lado: null, reuniaoPassou: true });
  });

  it('reunião cancelada na Agenda: a etapa "agendado" do Davi não segura a loja em Reunião marcada', () => {
    const conv = { etapa: 'agendado' as const, horarios_oferecidos: ['x'] };
    const r = { status: 'cancelada', scheduled_at: '2026-11-10T12:00:00Z' };
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: conv, reuniao: r, card: { stage: 'reuniao' } }, agora))
      .toEqual({ fase: 'convite', lado: null, reuniaoPassou: false, reuniaoCancelada: true });
  });

  it('sem reunião na Agenda, vale o que o Davi ou o card dizem', () => {
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'agendado' } }, agora).fase).toBe('reuniao');
    expect(posicaoNoFunil({ loja: loja('com_voce'), card: { stage: 'reuniao' } }, agora).fase).toBe('reuniao');
  });

  it('realizada na Agenda, teste e venda no card do funil principal', () => {
    const r = { status: 'realizada', scheduled_at: '2026-11-09T12:00:00Z' };
    const base = { loja: loja('conversando'), conversa: { etapa: 'agendado' as const } };
    expect(posicaoNoFunil({ ...base, reuniao: r }, agora).fase).toBe('realizada');
    expect(posicaoNoFunil({ ...base, reuniao: r, card: { stage: 'teste' } }, agora).fase).toBe('teste');
    expect(posicaoNoFunil({ ...base, reuniao: r, card: { stage: 'vendido' } }, agora).fase).toBe('cliente');
  });

  it('o quanto andou fica guardado: testou e o card foi para perdido', () => {
    const r = { status: 'realizada', scheduled_at: '2026-11-05T12:00:00Z' };
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'agendado' }, reuniao: r, card: { stage: 'perdido', maiorEtapa: 'teste' } }, agora))
      .toMatchObject({ fase: 'teste', lado: 'perdida' });
  });

  it('perdida: não quer, pediu para sair ou card perdido', () => {
    expect(posicaoNoFunil({ loja: loja('sem_interesse') }, agora)).toMatchObject({ fase: 'abordada', lado: 'perdida' });
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'saiu', horarios_oferecidos: ['x'] } }, agora))
      .toMatchObject({ fase: 'convite', lado: 'perdida' });
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'conversa' }, card: { stage: 'perdido' } }, agora).lado).toBe('perdida');
  });

  it('só reunião que ainda vai acontecer segura fora de Perdidas; a que passou sem notícia não', () => {
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'agendado' }, reuniao: amanha, card: { stage: 'perdido' } }, agora).lado).toBeNull();
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'agendado' }, reuniao: hojeCedo, card: { stage: 'perdido' } }, agora).lado).toBe('perdida');
  });

  it('esperando você: o Davi chamou o Xavier, em qualquer fase antes do teste', () => {
    expect(posicaoNoFunil({ loja: loja('com_voce') }, agora)).toMatchObject({ fase: 'conversando', lado: 'com_voce' });
    expect(posicaoNoFunil({ loja: loja('conversando'), conversa: { etapa: 'com_xavier' } }, agora).lado).toBe('com_voce');
    expect(posicaoNoFunil({ loja: loja('com_voce'), conversa: { etapa: 'com_xavier' }, reuniao: amanha }, agora))
      .toMatchObject({ fase: 'reuniao', lado: 'com_voce' });
  });

  it('voltou a escrever depois de recusar: espera você, não some em Perdidas', () => {
    expect(posicaoNoFunil({ loja: loja('com_voce'), conversa: { etapa: 'perdido' }, card: { stage: 'perdido' } }, agora).lado).toBe('com_voce');
    expect(posicaoNoFunil({ loja: loja('com_voce'), conversa: { etapa: 'saiu' } }, agora).lado).toBe('com_voce');
  });

  it('teste ou cliente hoje valem mesmo que a conversa tenha sido encerrada', () => {
    expect(posicaoNoFunil({ loja: loja('sem_interesse'), conversa: { etapa: 'saiu' }, card: { stage: 'vendido' } }, agora))
      .toMatchObject({ fase: 'cliente', lado: null });
  });
});

describe('a reunião e o card que valem', () => {
  it('a de pé mais recente; senão a feita; senão a cancelada', () => {
    const c = { id: 'c', status: 'cancelada', scheduled_at: '2026-11-12T12:00:00Z' };
    const f = { id: 'f', status: 'realizada', scheduled_at: '2026-11-05T12:00:00Z' };
    const a = { id: 'a', status: 'agendada', scheduled_at: '2026-11-11T12:00:00Z' };
    expect(reuniaoQueVale([c, f, a])?.id).toBe('a');
    expect(reuniaoQueVale([c, f])?.id).toBe('f');
    expect(reuniaoQueVale([c])?.id).toBe('c');
    expect(reuniaoQueVale([])).toBeNull();
  });

  it('a etapa mais alta do card, sem contar perdido', () => {
    expect(maiorEtapaDoCard(['contato', 'reuniao', 'perdido', 'teste'])).toBe('teste');
    expect(maiorEtapaDoCard(['perdido', null])).toBeNull();
  });
});

describe('as contas do funil', () => {
  const p = (fase: PosicaoNoFunil['fase']): PosicaoNoFunil => ({ fase, lado: null, reuniaoPassou: false, reuniaoCancelada: false });
  it('quem chegou a uma fase conta em todas as anteriores', () => {
    const n = chegaramAte([p('abordada'), p('conversando'), p('reuniao'), p(null)]);
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

  it('o que o Davi descobriu sai na ordem e só o que tem resposta; o pedido vai no fim', () => {
    expect(respostas({ cargo: 'dono', estoque: '35', segmento: 'caminhoes', canais: '  ', pedido: 'ver' })).toEqual([
      { rotulo: 'Estoque', valor: '35' },
      { rotulo: 'Quem fala', valor: 'dono' },
      { rotulo: 'Vende', valor: 'Caminhões' },
      { rotulo: 'Pedido', valor: 'Quer ver funcionando' },
    ]);
  });
});

describe('o card mostra o essencial da resposta ao pé da letra', () => {
  it('estoque com número vira "N no estoque"; sem número, nada', () => {
    expect(estoqueCurto('Hoje a gente tá com uns 35')).toBe('35 no estoque');
    expect(estoqueCurto('uns 30 caminhao no patio')).toBe('30 no estoque');
    expect(estoqueCurto('bastante')).toBeNull();
    expect(estoqueCurto(null)).toBeNull();
  });

  it('o cargo vira uma palavra', () => {
    expect(cargoCurto('Sou dono')).toBe('Dono');
    expect(cargoCurto('sou sócio do meu pai')).toBe('Sócio');
    expect(cargoCurto('vendedor')).toBe('Vendedor');
    expect(cargoCurto('cuido das redes')).toBe('Redes');
    expect(cargoCurto('Kauã')).toBeNull();
  });

  it('o vendedor do anúncio: a correção à mão ou o do portal, nunca "loja"', () => {
    expect(vendedorDoAnuncio({ vendedor_mensagem: 'Marcelo' })).toBe('Marcelo');
    expect(vendedorDoAnuncio({ vendedor_mensagem: '', contato: 'vendedor: Marcelo' })).toBeNull();
    expect(vendedorDoAnuncio({ contato: 'vendedor: Marcelo (33) 9999-0000' })).toBe('Marcelo');
    expect(vendedorDoAnuncio({ contato: 'vendedor: loja' })).toBeNull();
    expect(vendedorDoAnuncio(null)).toBeNull();
  });
});
