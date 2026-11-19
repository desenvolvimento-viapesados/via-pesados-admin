import { describe, expect, it } from 'vitest';
import { posicaoNoFunil } from './funilDaProspeccao';
import {
  NAO_APARECEU, chaveDoTelefone, conversasSoltas, diaFalado, diasEntre, esperamResposta, etapaDaLoja, etapaDoCard, horaFalada,
  montarOportunidades, motivoFalado, paraAcompanhar, paraResponder, porEtapa, proximoPasso, resumoDoDia,
  reunioesDoDia, telefoneFalado, type FonteCard, type FonteLoja, type Fontes, type ReuniaoDaOportunidade,
} from './oportunidades';

/* Quarta, 18/11/2026, 10h em Brasília. */
const AGORA = new Date('2026-11-18T13:00:00Z');
const dias = (n: number, hora = 13) => new Date(Date.UTC(2026, 10, 18 + n, hora)).toISOString();

const reuniao = (x: Partial<ReuniaoDaOportunidade> = {}): ReuniaoDaOportunidade =>
  ({ id: 'r1', scheduled_at: dias(1), status: 'agendada', meet_link: 'https://meet.google.com/x', outcome: null, prospect_id: null, ...x });

const loja = (x: Partial<FonteLoja> & { conversa?: Parameters<typeof posicaoNoFunil>[0]['conversa'] } = {}): FonteLoja => {
  const { conversa, ...resto } = x;
  const base = {
    lojaId: 'l1', nome: 'Loja Um', cidade: 'Uberlândia', uf: 'MG', telefone: '5534999990001', status: 'conversando',
    motivo: null, atualizadaEm: dias(-1), contatos: 1, ligacoes: 0, conversaId: 'c1', primeiroContatoEm: dias(-6),
    mexeuEm: dias(-1), reuniao: null, cardId: null, davi: null, sabe: [], teste: false, ...resto,
  } as Omit<FonteLoja, 'posicao'>;
  const posicao = x.posicao ?? posicaoNoFunil({
    loja: { status: base.status as never, nome: base.nome, respondeu_em: ['em_contato', 'sem_resposta'].includes(base.status) ? null : dias(-2), primeiro_contato_em: base.primeiroContatoEm, contatos: base.contatos, ligacoes: base.ligacoes },
    conversa: conversa ?? (base.davi ? { etapa: base.davi.etapa as never, situacao: {} } : null),
    reuniao: base.reuniao,
    card: null,
  }, AGORA);
  return { ...base, posicao };
};

const card = (x: Partial<FonteCard> = {}): FonteCard => ({
  id: 'p1', company_name: 'Loja do Site', contact_name: null, whatsapp: '(31) 98888-0002', city: 'Betim', state: 'MG',
  stage: 'contato', notes: null, lost_reason: null, created_at: dias(0, 12), updated_at: dias(0, 12), canalSlug: 'site', canalNome: 'Site / inbound', ...x,
});

const fontes = (x: Partial<Fontes> = {}): Fontes =>
  ({ lojas: [], cards: [], reunioes: [], conversas: [], atividades: [], respostasDaEquipe: {}, ...x });

describe('datas faladas', () => {
  it('conta os dias pelo calendário de Brasília', () => {
    expect(diasEntre(dias(0), AGORA)).toBe(0);
    expect(diasEntre(dias(-5), AGORA)).toBe(5);
    expect(diasEntre(dias(1), AGORA)).toBe(-1);
    /* 23h de ontem em Brasília é 02h de hoje em UTC: continua sendo ontem. */
    expect(diasEntre('2026-11-18T02:00:00Z', AGORA)).toBe(1);
  });
  it('fala o dia e a hora como gente', () => {
    expect(diaFalado(dias(0), AGORA)).toBe('hoje');
    expect(diaFalado(dias(1), AGORA)).toBe('amanhã');
    expect(diaFalado(dias(-1), AGORA)).toBe('ontem');
    expect(diaFalado('2026-11-13T13:30:00Z', AGORA)).toBe('sex, 13/11');
    expect(horaFalada('2026-11-13T13:30:00Z')).toBe('10h30');
    expect(horaFalada('2026-11-17T16:00:00Z')).toBe('13h');
  });
});

describe('telefone', () => {
  it('reconhece o mesmo número com ou sem 55, máscara e nono dígito', () => {
    expect(chaveDoTelefone('5533988144005')).toBe('3388144005');
    expect(chaveDoTelefone('(33) 98814-4005')).toBe('3388144005');
    expect(chaveDoTelefone('33 8814-4005')).toBe('3388144005');
    expect(chaveDoTelefone('8814-4005')).toBeNull();
    expect(telefoneFalado('5533988144005')).toBe('(33) 98814-4005');
  });
});

describe('a etapa', () => {
  it('loja que só recebeu a mensagem ainda não é oportunidade', () => {
    const l = loja({ status: 'em_contato' });
    expect(l.posicao.fase).toBe('abordada');
    expect(etapaDaLoja(l.posicao, false)).toBeNull();
    expect(etapaDaLoja(loja({ status: 'sem_resposta' }).posicao, false)).toBeNull();
  });
  it('respondeu = em conversa; reunião de pé = reunião marcada; feita = falta decidir', () => {
    expect(etapaDaLoja(loja().posicao, false)).toBe('conversa');
    expect(etapaDaLoja(loja({ reuniao: reuniao() }).posicao, false)).toBe('reuniao');
    expect(etapaDaLoja(loja({ reuniao: reuniao({ status: 'realizada', scheduled_at: dias(-1) }) }).posicao, false)).toBe('decisao');
  });
  it('reunião cancelada devolve a loja para Em conversa', () => {
    expect(etapaDaLoja(loja({ reuniao: reuniao({ status: 'cancelada' }) }).posicao, false)).toBe('conversa');
  });
  it('quem o Davi passou para você é oportunidade mesmo sem ter respondido de verdade', () => {
    expect(etapaDaLoja(loja({ status: 'com_voce' }).posicao, false)).toBe('conversa');
  });
  it('card do site sem conversa, contato nem reunião é Novo', () => {
    expect(etapaDoCard({ stage: 'contato', reunioes: [], temConversa: false, temContato: false }).etapa).toBe('novo');
    expect(etapaDoCard({ stage: 'contato', reunioes: [], temConversa: false, temContato: true }).etapa).toBe('conversa');
    expect(etapaDoCard({ stage: 'contato', reunioes: [], temConversa: true, temContato: false }).etapa).toBe('conversa');
    expect(etapaDoCard({ stage: 'amostra', reunioes: [], temConversa: false, temContato: false }).etapa).toBe('conversa');
  });
  it('o card segue a Agenda e a venda', () => {
    expect(etapaDoCard({ stage: 'reuniao', reunioes: [reuniao()], temConversa: true, temContato: true }).etapa).toBe('reuniao');
    expect(etapaDoCard({ stage: 'reuniao', reunioes: [reuniao({ status: 'realizada' })], temConversa: true, temContato: true }).etapa).toBe('decisao');
    expect(etapaDoCard({ stage: 'teste', reunioes: [reuniao({ status: 'realizada' })], temConversa: true, temContato: true }).etapa).toBe('teste');
    expect(etapaDoCard({ stage: 'vendido', reunioes: [], temConversa: true, temContato: true }).etapa).toBe('cliente');
    expect(etapaDoCard({ stage: 'perdido', reunioes: [], temConversa: true, temContato: true }).perdida).toBe(true);
  });
});

describe('o próximo passo', () => {
  const base = { etapa: 'conversa' as const, perdida: false, reuniao: null, naoLidas: 0, esperandoVoce: false, comODavi: false, mexeuEm: dias(0, 12) };
  it('reunião que passou sem registro vem antes de tudo', () => {
    const p = proximoPasso({ ...base, etapa: 'reuniao', reuniao: reuniao({ scheduled_at: '2026-11-17T16:00:00Z' }), naoLidas: 2, esperandoVoce: true }, AGORA);
    expect(p).toEqual({ tipo: 'registrar_reuniao', texto: 'A reunião de ontem passou: conte como foi', tom: 'agora' });
  });
  it('a reunião só "passou" vinte minutos depois da hora', () => {
    const p = proximoPasso({ ...base, etapa: 'reuniao', reuniao: reuniao({ scheduled_at: new Date(AGORA.getTime() - 10 * 60_000).toISOString() }) }, AGORA);
    expect(p.tipo).toBe('reuniao_hoje');
  });
  it('mensagem por ler pede resposta agora', () => {
    expect(proximoPasso({ ...base, naoLidas: 1, esperandoVoce: true }, AGORA)).toMatchObject({ tipo: 'responder', tom: 'agora' });
  });
  it('reunião de hoje é para agora; a de outro dia só informa', () => {
    expect(proximoPasso({ ...base, etapa: 'reuniao', reuniao: reuniao({ scheduled_at: dias(0, 18) }) }, AGORA))
      .toEqual({ tipo: 'reuniao_hoje', texto: 'Reunião hoje às 15h', tom: 'agora' });
    expect(proximoPasso({ ...base, etapa: 'reuniao', reuniao: reuniao({ scheduled_at: dias(1, 18) }) }, AGORA))
      .toEqual({ tipo: 'reuniao', texto: 'Reunião amanhã às 15h', tom: 'calmo' });
  });
  it('o Davi chamou: o motivo dele é o passo', () => {
    expect(proximoPasso({ ...base, esperandoVoce: true, motivo: 'O Davi chamou você: quer falar de preço' }, AGORA))
      .toEqual({ tipo: 'responder', texto: 'O Davi chamou você: quer falar de preço', tom: 'agora' });
  });
  it('lead novo: chamar agora; depois de tentar, tentar de novo', () => {
    expect(proximoPasso({ ...base, etapa: 'novo', esperandoVoce: true, doSite: true }, AGORA).texto).toBe('Pediu contato pelo site: chame agora');
    expect(proximoPasso({ ...base, etapa: 'novo', esperandoVoce: true, tentativas: 2 }, AGORA).texto).toBe('Você tentou 2 vezes e não atendeu: tente de novo');
  });
  it('reunião feita cobra a decisão, e aperta depois de dois dias', () => {
    const r = (n: number) => reuniao({ status: 'realizada', scheduled_at: dias(n) });
    expect(proximoPasso({ ...base, etapa: 'decisao', reuniao: r(0) }, AGORA)).toMatchObject({ tom: 'atencao', texto: 'Reunião feita hoje: combine o próximo passo' });
    expect(proximoPasso({ ...base, etapa: 'decisao', reuniao: r(-1) }, AGORA)).toMatchObject({ tom: 'atencao', texto: 'Reunião feita ontem: cobre a decisão' });
    expect(proximoPasso({ ...base, etapa: 'decisao', reuniao: r(-3) }, AGORA)).toMatchObject({ tom: 'agora', texto: 'Reunião feita há 3 dias: cobre a decisão' });
  });
  it('quem faltou à reunião pede outra', () => {
    expect(proximoPasso({ ...base, reuniao: reuniao({ status: 'cancelada', outcome: NAO_APARECEU }) }, AGORA).texto).toBe('Não apareceu na reunião: marque outra');
    expect(proximoPasso({ ...base, reuniao: reuniao({ status: 'cancelada' }) }, AGORA).texto).toBe('A reunião foi cancelada: marque outra');
  });
  it('conversa parada há dois dias pede retomada, mesmo com o Davi nela', () => {
    expect(proximoPasso({ ...base, comODavi: true }, AGORA)).toMatchObject({ tipo: 'davi', tom: 'calmo' });
    expect(proximoPasso({ ...base, comODavi: true, mexeuEm: dias(-4) }, AGORA)).toEqual({ tipo: 'retomar', texto: 'Parada há 4 dias: chame de novo', tom: 'atencao' });
    expect(proximoPasso({ ...base, pausa: true, mexeuEm: dias(-4) }, AGORA).texto).toBe('Pediu para falar depois');
  });
  it('perdida, teste e cliente não pedem nada', () => {
    expect(proximoPasso({ ...base, perdida: true, motivo: 'Pediu para não receber mais mensagens.' }, AGORA)).toMatchObject({ tipo: 'perdida', tom: 'calmo' });
    expect(proximoPasso({ ...base, etapa: 'teste', naoLidas: 3 }, AGORA).tipo).toBe('teste');
    expect(proximoPasso({ ...base, etapa: 'cliente' }, AGORA).tipo).toBe('cliente');
  });
});

describe('montar: lojas e cards numa lista só', () => {
  const conversa = (id: string, x: Record<string, unknown> = {}) =>
    ({ id, prospect_id: null, nao_lidas: 0, ultima_direcao: 'saida', ultima_mensagem: 'oi', ultima_mensagem_em: dias(-1), telefone: '5534999990001', ...x });

  it('quem só recebeu a mensagem fica de fora; quem respondeu entra', () => {
    const ops = montarOportunidades(fontes({ lojas: [loja({ lojaId: 'a', status: 'em_contato' }), loja({ lojaId: 'b' })] }), AGORA);
    expect(ops.map((o) => o.id)).toEqual(['loja:b']);
    expect(ops[0]).toMatchObject({ etapa: 'conversa', origem: 'Prospecção', lugar: 'Uberlândia/MG', telefone: '5534999990001' });
  });

  it('a mesma loja não aparece duas vezes: o card dela entra na mesma linha', () => {
    const ops = montarOportunidades(fontes({
      lojas: [loja({ cardId: 'p9', reuniao: reuniao() })],
      cards: [card({ id: 'p9', company_name: 'Loja Um', stage: 'reuniao', canalSlug: 'assistente' })],
      reunioes: [reuniao({ prospect_id: 'p9' })],
    }), AGORA);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ id: 'loja:l1', cardId: 'p9', etapa: 'reuniao' });
  });

  it('reunião marcada por ligação: o card acha a loja pelo telefone e a etapa mais adiantada vale', () => {
    const ops = montarOportunidades(fontes({
      lojas: [loja({ conversaId: null, contatos: 0, ligacoes: 1, status: 'com_voce', motivo: 'Reunião marcada na ligação.', reuniao: reuniao() })],
      cards: [card({ id: 'p7', whatsapp: '(34) 99999-0001', stage: 'teste', canalSlug: 'outbound' })],
    }), AGORA);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ cardId: 'p7', etapa: 'teste', origem: 'Ligação', esperandoVoce: false });
  });

  it('o Davi chamou você: espera você até alguém da equipe responder', () => {
    const l = loja({ status: 'com_voce', motivo: 'Assistente chamou você: Lucas tentou entrar na reunião', atualizadaEm: dias(-5), davi: { etapa: 'com_xavier', modo: 'sozinho' } });
    const antes = montarOportunidades(fontes({ lojas: [l], conversas: [conversa('c1')] }), AGORA)[0];
    expect(antes).toMatchObject({ esperandoVoce: true, comODavi: false, motivo: 'O Davi chamou você: Lucas tentou entrar na reunião' });
    expect(antes.passo).toMatchObject({ tipo: 'responder', tom: 'agora' });
    const depois = montarOportunidades(fontes({ lojas: [l], conversas: [conversa('c1')], respostasDaEquipe: { c1: dias(-1) } }), AGORA)[0];
    expect(depois.esperandoVoce).toBe(false);
    /* Resposta mais antiga que o chamado não conta. */
    const velha = montarOportunidades(fontes({ lojas: [l], conversas: [conversa('c1')], respostasDaEquipe: { c1: dias(-9) } }), AGORA)[0];
    expect(velha.esperandoVoce).toBe(true);
  });

  it('respondeu por fora do CRM e marcou "Já respondi": o contato no card tira de esperando você', () => {
    const l = loja({ cardId: 'p9', status: 'com_voce', motivo: 'Assistente chamou você: tentou entrar', atualizadaEm: dias(-2), davi: { etapa: 'com_xavier', modo: 'sozinho' } });
    const c = card({ id: 'p9', canalSlug: 'assistente', stage: 'oportunidade' });
    expect(montarOportunidades(fontes({ lojas: [l], cards: [c] }), AGORA)[0].esperandoVoce).toBe(true);
    const o = montarOportunidades(fontes({ lojas: [l], cards: [c], atividades: [{ prospect_id: 'p9', kind: 'contato', created_at: dias(-1) }] }), AGORA)[0];
    expect(o.esperandoVoce).toBe(false);
    /* Contato anotado ANTES do chamado não vale. */
    expect(montarOportunidades(fontes({ lojas: [l], cards: [c], atividades: [{ prospect_id: 'p9', kind: 'contato', created_at: dias(-6) }] }), AGORA)[0].esperandoVoce).toBe(true);
  });

  it('loja da lista que nunca respondeu e pediu contato pelo site vira lead novo, no topo', () => {
    const l = loja({ status: 'em_contato', telefone: '5531988880002' });
    const o = montarOportunidades(fontes({ lojas: [l], cards: [card()] }), AGORA);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ etapa: 'novo', esperandoVoce: true, cardId: 'p1' });
    expect(o[0].passo.texto).toBe('Pediu contato pelo site: chame agora');
  });

  it('reunião marcada na ligação não é "esperando você"', () => {
    const o = montarOportunidades(fontes({ lojas: [loja({ status: 'com_voce', motivo: 'Reunião marcada na ligação.', reuniao: reuniao() })] }), AGORA)[0];
    expect(o).toMatchObject({ etapa: 'reuniao', esperandoVoce: false });
    expect(o.passo.tipo).toBe('reuniao');
  });

  it('mensagem por ler faz esperar você e mostra o que ela escreveu', () => {
    const o = montarOportunidades(fontes({
      lojas: [loja()], conversas: [conversa('c1', { nao_lidas: 2, ultima_direcao: 'entrada', ultima_mensagem: 'Quanto custa?', ultima_mensagem_em: dias(0, 12) })],
    }), AGORA)[0];
    expect(o).toMatchObject({ esperandoVoce: true, naoLidas: 2, ultimaMensagem: 'Quanto custa?', mexeuEm: dias(0, 12) });
  });

  it('se a última palavra é nossa, ninguém está esperando (o Davi já respondeu)', () => {
    const o = montarOportunidades(fontes({ lojas: [loja()], conversas: [conversa('c1', { nao_lidas: 1, ultima_direcao: 'saida', ultima_mensagem: 'Quantos veículos vocês têm?' })] }), AGORA)[0];
    expect(o).toMatchObject({ esperandoVoce: false, naoLidas: 0 });
    expect(esperamResposta({ nao_lidas: 1, ultima_direcao: 'entrada', ultima_mensagem: '[system]' })).toBe(0);
    expect(esperamResposta({ nao_lidas: 3, ultima_direcao: 'entrada', ultima_mensagem: 'Oi' })).toBe(3);
  });

  it('lead do formulário cai em Novos, esperando você, com as respostas', () => {
    const o = montarOportunidades(fontes({ cards: [card({ notes: 'Estoque: 40\nCargo: Dono', contact_name: 'Carlos' })] }), AGORA)[0];
    expect(o).toMatchObject({ id: 'card:p1', nome: 'Loja do Site · Carlos', etapa: 'novo', origem: 'Site', esperandoVoce: true, telefone: '5531988880002', notas: 'Estoque: 40\nCargo: Dono' });
    expect(o.passo.texto).toBe('Pediu contato pelo site: chame agora');
  });

  it('ligou e não atendeu: continua em Novos; falou: vai para Em conversa', () => {
    const tentou = montarOportunidades(fontes({ cards: [card()], atividades: [{ prospect_id: 'p1', kind: 'tentativa', created_at: dias(0) }] }), AGORA)[0];
    expect(tentou).toMatchObject({ etapa: 'novo', esperandoVoce: true });
    expect(tentou.passo.texto).toContain('tentou uma vez');
    const falou = montarOportunidades(fontes({ cards: [card()], atividades: [{ prospect_id: 'p1', kind: 'contato', created_at: dias(0) }] }), AGORA)[0];
    expect(falou).toMatchObject({ etapa: 'conversa', esperandoVoce: false });
  });

  it('a loja de teste do dono não entra', () => {
    expect(montarOportunidades(fontes({ lojas: [loja({ teste: true })] }), AGORA)).toHaveLength(0);
  });

  it('perdida fica fora das colunas e de quem espera você', () => {
    const ops = montarOportunidades(fontes({
      lojas: [loja({ status: 'sem_interesse', motivo: 'Pediu para não receber mais mensagens.' })],
      conversas: [conversa('c1', { nao_lidas: 1, ultima_direcao: 'entrada' })],
    }), AGORA);
    expect(ops[0]).toMatchObject({ perdida: true, esperandoVoce: false });
    expect(Object.values(porEtapa(ops)).flat()).toHaveLength(0);
    expect(paraResponder(ops)).toHaveLength(0);
  });
});

describe('o dia', () => {
  const ops = montarOportunidades(fontes({
    lojas: [
      loja({ lojaId: 'mf', nome: 'MF', conversaId: 'c-mf', status: 'com_voce', motivo: 'Assistente chamou você: tentou entrar', atualizadaEm: dias(-5), mexeuEm: dias(-5), reuniao: reuniao({ id: 'r-mf', scheduled_at: '2026-11-17T16:00:00Z' }) }),
      loja({ lojaId: 'parada', nome: 'Parada', conversaId: 'c-p', mexeuEm: dias(-6), telefone: '5531911112222' }),
      loja({ lojaId: 'decide', nome: 'Decide', conversaId: 'c-d', telefone: '5531933334444', reuniao: reuniao({ id: 'r-d', status: 'realizada', scheduled_at: dias(-3) }) }),
      loja({ lojaId: 'amanha', nome: 'Amanhã', conversaId: 'c-a', telefone: '5531955556666', reuniao: reuniao({ id: 'r-a', scheduled_at: dias(1) }) }),
    ],
    cards: [card({ id: 'novo-velho', created_at: dias(-1), updated_at: dias(-1), whatsapp: '(31) 97777-0001' }), card({ id: 'novo-agora', whatsapp: '(31) 97777-0002' })],
    conversas: [{ id: 'solta', prospect_id: null, nao_lidas: 1, ultima_direcao: 'entrada', ultima_mensagem: 'Bom dia', ultima_mensagem_em: dias(0, 12), telefone: '5531900001111' }],
  }), AGORA);

  it('responder agora: lead novo primeiro (o mais recente em cima), depois quem espera', () => {
    expect(paraResponder(ops).map((o) => o.id)).toEqual(['card:novo-agora', 'card:novo-velho', 'loja:mf']);
  });
  it('acompanhar: cobrar a decisão antes de retomar conversa parada, e sem repetir quem espera você', () => {
    expect(paraAcompanhar(ops).map((o) => o.id)).toEqual(['loja:decide', 'loja:parada']);
  });
  it('reuniões: as que passaram sem registro, as de hoje e as de amanhã, ligadas à oportunidade', () => {
    const lista = reunioesDoDia([
      reuniao({ id: 'r-a', scheduled_at: dias(1) }),
      reuniao({ id: 'r-mf', scheduled_at: '2026-11-17T16:00:00Z' }),
      reuniao({ id: 'r-d', status: 'realizada', scheduled_at: dias(-3) }),
      reuniao({ id: 'r-hoje', scheduled_at: dias(0, 19), prospect_id: 'novo-agora' }),
      reuniao({ id: 'r-longe', scheduled_at: dias(6) }),
      reuniao({ id: 'r-canc', status: 'cancelada', scheduled_at: dias(0, 19) }),
    ], ops, AGORA);
    expect(lista.map((r) => [r.reuniao.id, r.quando, r.oportunidade?.id ?? null])).toEqual([
      ['r-mf', 'passou', 'loja:mf'], ['r-hoje', 'hoje', 'card:novo-agora'], ['r-a', 'amanha', 'loja:amanha'],
    ]);
  });
  it('conversa por ler de quem não é oportunidade aparece à parte', () => {
    expect(conversasSoltas([
      { id: 'solta', prospect_id: null, nao_lidas: 1, ultima_direcao: 'entrada', ultima_mensagem: 'Bom dia', ultima_mensagem_em: dias(0), telefone: '55' },
      { id: 'c-mf', prospect_id: null, nao_lidas: 1, ultima_direcao: 'entrada', ultima_mensagem: 'oi', ultima_mensagem_em: dias(0), telefone: '55' },
      { id: 'lida', prospect_id: null, nao_lidas: 0, ultima_direcao: 'entrada', ultima_mensagem: 'oi', ultima_mensagem_em: dias(0), telefone: '55' },
    ], ops).map((c) => c.id)).toEqual(['solta']);
  });
  it('a frase do dia diz o que espera, no singular e no plural', () => {
    expect(resumoDoDia({ responder: 1, semRegistro: 2, reunioesHoje: 0, acompanhar: 0, ligacoes: 20 }))
      .toBe('1 pessoa esperando você · 2 reuniões sem registro · 20 ligações para fazer');
    expect(resumoDoDia({ responder: 0, semRegistro: 0, reunioesHoje: 0, acompanhar: 0, ligacoes: 0 })).toBe('Nada esperando você agora.');
  });
  it('o motivo do Davi vem em português de gente', () => {
    expect(motivoFalado('Assistente chamou você: quer preço')).toBe('O Davi chamou você: quer preço');
    expect(motivoFalado('  ')).toBeNull();
  });
});
