import { describe, expect, it } from 'vitest';
import {
  estacaoDaOportunidade, estacaoDoCliente, montarEsteira, porEstacao, proximaCoisa, rotinaDoDia, telaDo,
  type ClienteDaEsteira, type ItemDaEsteira,
} from './esteira';
import { proximoPasso, type EtapaDaVenda, type Oportunidade, type ReuniaoDaOportunidade } from './oportunidades';

/* Quarta, 18/11/2026, 10h em Brasília. */
const AGORA = new Date('2026-11-18T13:00:00Z');
const daqui = (min: number) => new Date(AGORA.getTime() + min * 60_000).toISOString();

const reuniao = (scheduled_at: string, status = 'agendada'): ReuniaoDaOportunidade =>
  ({ id: `r-${scheduled_at}`, scheduled_at, status, meet_link: 'https://meet.google.com/x', outcome: null, prospect_id: null });

function op(id: string, etapa: EtapaDaVenda, x: Partial<Oportunidade> = {}): Oportunidade {
  const base = {
    id: `card:${id}`, nome: `Loja ${id}`, lugar: 'Betim/MG', telefone: '5531999990000', origem: 'Prospecção', etapa, perdida: false,
    cardId: id, lojaId: null, conversaId: `c-${id}`, reuniao: null, naoLidas: 0, ultimaMensagem: null, esperandoVoce: etapa === 'novo',
    motivo: null, comODavi: false, sabe: [], notas: null, mexeuEm: daqui(-60), entrouEm: daqui(-600), ...x,
  };
  return { ...base, passo: x.passo ?? proximoPasso({ ...base, doSite: etapa === 'novo' }, AGORA) };
}

const cliente = (id: string, x: Partial<ClienteDaEsteira> = {}): ClienteDaEsteira => ({
  id, prospectId: null, nome: `Cliente ${id}`, lugar: 'Itaúna/MG', telefone: '5531988880000', status: 'onboarding', pagou: false, emTeste: false,
  implantado: false, checkoutToken: 'tok', contratoAssinado: false, mensalidade: 437, criadoEm: daqui(-120), ...x,
});

const esteira = (ops: Oportunidade[], clientes: ClienteDaEsteira[] = [], amostras: string[] = []) => montarEsteira(ops, clientes, new Set(amostras), AGORA);
const um = (itens: ItemDaEsteira[], id: string) => itens.find((i) => i.id === id)!;

describe('em que estação a loja está', () => {
  it('antes da venda, a etapa da oportunidade manda', () => {
    expect(estacaoDaOportunidade(op('a', 'novo'))).toBe('conversa');
    expect(estacaoDaOportunidade(op('a', 'conversa'))).toBe('conversa');
    expect(estacaoDaOportunidade(op('a', 'reuniao'))).toBe('reuniao');
    expect(estacaoDaOportunidade(op('a', 'decisao'))).toBe('decisao');
  });
  it('depois da venda, o cadastro do cliente manda: fechou e não pagou, Fechamento; pagou ou testa, Implantação; no ar, Cliente', () => {
    expect(estacaoDoCliente(cliente('k'))).toBe('fechamento');
    expect(estacaoDoCliente(cliente('k', { pagou: true }))).toBe('implantacao');
    expect(estacaoDoCliente(cliente('k', { emTeste: true }))).toBe('implantacao');
    expect(estacaoDoCliente(cliente('k', { pagou: true, implantado: true }))).toBe('cliente');
    expect(estacaoDoCliente(cliente('k', { status: 'inadimplente' }))).toBe('cliente');
  });
  it('a loja que virou cliente aparece uma vez só, como cliente; cancelado e perdida saem', () => {
    const itens = esteira([op('a', 'decisao'), op('b', 'conversa', { perdida: true })], [cliente('k', { prospectId: 'a' }), cliente('z', { status: 'cancelado' })]);
    expect(itens.map((i) => [i.id, i.estacao])).toEqual([['cliente:k', 'fechamento']]);
    expect(itens[0].suaVez).toBe(true);
  });
});

describe('a tela da loja: uma coisa de cada vez', () => {
  const tela = (o: Oportunidade, amostras: string[] = []) => telaDo(esteira([o], [], amostras)[0], AGORA);
  it('sem reunião: marcar; reunião longe: preparar; a 15 minutos ou depois: a reunião', () => {
    expect(tela(op('a', 'conversa'))).toBe('marcar');
    expect(tela(op('a', 'reuniao', { reuniao: reuniao(daqui(60 * 26)) }))).toBe('preparar');
    expect(tela(op('a', 'reuniao', { reuniao: reuniao(daqui(16)) }))).toBe('preparar');
    expect(tela(op('a', 'reuniao', { reuniao: reuniao(daqui(15)) }))).toBe('reuniao');
    expect(tela(op('a', 'reuniao', { reuniao: reuniao(daqui(-300)) }))).toBe('reuniao');
  });
  it('reunião feita: o resultado; cliente sem pagar: o pagamento', () => {
    expect(tela(op('a', 'decisao', { reuniao: reuniao(daqui(-3000), 'realizada') }))).toBe('resultado');
    expect(telaDo(esteira([], [cliente('k')])[0], AGORA)).toBe('pagamento');
    expect(telaDo(esteira([], [cliente('k', { pagou: true })])[0], AGORA)).toBe('implantacao');
  });
  it('reunião marcada sem amostra pede a amostra, e é com você', () => {
    const o = op('a', 'reuniao', { reuniao: reuniao(daqui(60 * 26)) });
    expect(esteira([o])[0]).toMatchObject({ temAmostra: false, suaVez: true });
    expect(esteira([o])[0].fazer).toContain('monte a amostra antes');
    expect(esteira([o], [], ['a'])[0]).toMatchObject({ temAmostra: true, suaVez: false });
  });
});

describe('a rotina do dia e a próxima coisa', () => {
  const ops = [
    op('conv', 'conversa', { esperandoVoce: true, motivo: 'O Davi chamou você: quer preço', mexeuEm: daqui(-5000) }),
    op('parada', 'conversa'),
    op('amanha', 'reuniao', { reuniao: reuniao(daqui(60 * 26)) }),
    op('pensa', 'decisao', { reuniao: reuniao(daqui(-3000), 'realizada') }),
  ];
  const itens = esteira(ops, [cliente('k'), cliente('ativo', { pagou: true, implantado: true, status: 'ativo' })], ['amanha']);

  it('cinco linhas, do fim da esteira para o começo', () => {
    expect(rotinaDoDia(itens, { feitas: 3, meta: 20 }, 1, AGORA).map((r) => [r.estacao, r.quantos, r.resumo])).toEqual([
      ['fechamento', 1, '1 loja'], ['decisao', 1, '1 loja'], ['reuniao', 0, 'nada'], ['conversa', 2, '2 lojas'], ['prospeccao', 17, '3 de 20'],
    ]);
  });
  it('cada loja numa estação, com quem é com você em cima', () => {
    const c = porEstacao(itens);
    expect(c.conversa.map((i) => i.id)).toEqual(['card:conv', 'card:parada']);
    expect([c.reuniao.length, c.decisao.length, c.fechamento.length, c.cliente.length]).toEqual([1, 1, 1, 1]);
  });
  it('a próxima coisa: reunião na hora, depois lead novo, amostra, pagamento, quem espera, decisão', () => {
    const titulo = (x: ItemDaEsteira[]) => proximaCoisa(x, AGORA)?.titulo;
    const naHora = op('hora', 'reuniao', { reuniao: reuniao(daqui(5)) });
    const passou = op('hora', 'reuniao', { reuniao: reuniao(daqui(-300)) });
    const novo = op('site', 'novo');
    const semAmostra = op('sem', 'reuniao', { reuniao: reuniao(daqui(60 * 30)) });
    expect(titulo(esteira([...ops, naHora, novo]))).toBe('Reunião com Loja hora agora');
    expect(titulo(esteira([...ops, passou]))).toBe('Como foi a reunião com Loja hora?');
    expect(titulo(esteira([...ops, novo, semAmostra], [cliente('k')]))).toBe('Loja site pediu contato');
    expect(titulo(esteira([...ops, semAmostra], [cliente('k')], ['amanha']))).toBe('Monte a amostra da Loja sem');
    expect(titulo(itens)).toBe('Cliente k fechou: falta pagar');
    expect(titulo(esteira(ops, [], ['amanha']))).toBe('Loja conv está esperando você');
    expect(titulo(esteira([ops[1], ops[3]]))).toBe('Cobre a decisão da Loja pensa');
    expect(proximaCoisa(esteira([ops[1]]), AGORA)).toBeNull();
    expect(um(itens, 'cliente:k').fazer).toContain('link de pagamento');
  });
});
