import { describe, expect, it } from 'vitest';
import {
  fiscal, leadNaoEODono, pedidoComOBotao, pedidoExplicitoDeParar, dataDaRetomada, adiadaAte, motivoDoAdiamento,
  DIAS_ATE_A_RETOMADA, PERGUNTA_DA_DOR,
} from '../../supabase/functions/_shared/assistente-regras';
import { FERRAMENTAS, INSTRUCOES, NOME_DO_MODELO_RESPONDIDO } from '../../supabase/functions/_shared/assistente-roteiro';
import {
  modeloDaMensagem, ultimoModeloRespondido, ehOFilme, pediuOutroMomento, pediuParaVer, textoDoModelo, ROTULO_DO_VIDEO,
  type ModeloRespondido,
} from '../../supabase/functions/_shared/prospeccao-regras';
import { MODELOS } from '../../supabase/functions/_shared/modelos';

/* O pós-resposta (dono, 19/11/2026): o Davi reconhece qual mensagem da cadência a loja respondeu,
   trata o filme masculino igual ao prospeccao_unico, e "Outro momento" não é recusa nem interesse. */

/** O texto como a caixa grava: variáveis preenchidas e, se tem vídeo, o rótulo na frente. */
function comoGravado(nome: string): string {
  const m = MODELOS.find((x) => x.name === nome);
  if (!m) throw new Error(`modelo ${nome} não está no catálogo`);
  const corpo = m.components.find((c) => c.type === 'BODY') as { text: string; example?: { body_text: string[][] } };
  const params = corpo.example?.body_text?.[0] ?? [];
  const video = m.components.some((c) => c.type === 'HEADER' && c.format === 'VIDEO');
  const texto = textoDoModelo(corpo.text, params.map((p) => (p === 'RB Caminhões' ? 'Rodovia Pesados' : p === 'caminhão' ? 'cavalo mecânico' : p)));
  return video ? `${ROTULO_DO_VIDEO}\n\n${texto}` : texto;
}

const CADENCIA: ModeloRespondido[] = [
  'cadencia_canais', 'cadencia_vendas', 'cadencia_vendeu', 'cadencia_atendimento',
  'cadencia_relatorios', 'cadencia_definicao', 'cadencia_encerramento', 'cadencia_retomada',
];
const regras = (msgs: string[], ctx = {}) => fiscal(msgs, ctx).violacoes.map((v) => v.regra);

describe('qual mensagem a loja respondeu', () => {
  it.each(CADENCIA)('reconhece %s pelo texto gravado, com as variáveis preenchidas', (nome) => {
    expect(modeloDaMensagem(comoGravado(nome))).toBe(nome);
  });

  it('separa canais e retomada, que começam iguais', () => {
    expect(modeloDaMensagem('Oi! Aqui é o Davi, do Via Pesados. Uma pergunta rápida sobre a KX: hoje vocês anunciam o mesmo caminhão em quantos lugares?')).toBe('cadencia_canais');
    expect(modeloDaMensagem('Oi! Aqui é o Davi, do Via Pesados. Faz um tempo que te mandei o vídeo do Via Pesados.')).toBe('cadencia_retomada');
  });

  it('o filme masculino é o mesmo filme do prospeccao_unico', () => {
    expect(modeloDaMensagem(comoGravado('prospeccao_unico'))).toBe('prospeccao_unico');
    expect(modeloDaMensagem(comoGravado('prospeccao_filme'))).toBe('prospeccao_filme');
    expect(ehOFilme('prospeccao_unico')).toBe(true);
    expect(ehOFilme('prospeccao_filme')).toBe(true);
    expect(ehOFilme('cadencia_canais')).toBe(false);
    expect(INSTRUCOES).toContain('Automatize suas publicações com o Via Pesados');
    expect(NOME_DO_MODELO_RESPONDIDO.prospeccao_filme).toMatch(/^1 · Filme/);
  });

  it('o recado para a equipe da loja e as respostas do Davi não são modelo', () => {
    expect(modeloDaMensagem('Oi! Aqui é o Davi, atendente do Via Pesados. Somos o único sistema do país…')).toBeNull();
    expect(modeloDaMensagem('Show! E você é o dono ou vendedor aí?')).toBeNull();
    expect(modeloDaMensagem('')).toBeNull();
  });

  it('vale a última mensagem automática que saiu, não a primeira', () => {
    const msgs = [
      { direcao: 'saida', conteudo: comoGravado('prospeccao_filme') },
      { direcao: 'saida', conteudo: comoGravado('cadencia_canais') },
      { direcao: 'saida', conteudo: comoGravado('cadencia_vendeu') },
      { direcao: 'entrada', conteudo: comoGravado('cadencia_atendimento') }, // entrada não conta
      { direcao: 'entrada', conteudo: 'às vezes esquece' },
    ];
    expect(ultimoModeloRespondido(msgs)).toBe('cadencia_vendeu');
    expect(ultimoModeloRespondido([{ direcao: 'entrada', conteudo: 'oi' }])).toBeNull();
  });

  it('o roteiro tem a linha de cada mensagem da cadência', () => {
    for (const n of CADENCIA) expect(INSTRUCOES).toContain(`- ${NOME_DO_MODELO_RESPONDIDO[n]} (`);
    expect(INSTRUCOES).toContain('4 lugares, tudo à mão, é bastante coisa.');
    expect(INSTRUCOES).toContain('Serve sim: caminhão, carreta, implemento e máquina.');
  });
});

describe('"Outro momento": nem recusa nem interesse', () => {
  it('não é pedido de ver nem pedido de parar', () => {
    expect(pediuOutroMomento('Outro momento')).toBe(true);
    expect(pediuOutroMomento('outro momento.')).toBe(true);
    expect(pediuOutroMomento('Quero conhecer')).toBe(false);
    expect(pediuParaVer('Outro momento')).toBe(false);
    expect(pedidoExplicitoDeParar('Outro momento')).toBe(false);
    expect(pedidoComOBotao(null, [{ direcao: 'entrada', conteudo: 'Outro momento' }])).toBeNull();
  });

  it('os botões novos de ver continuam abrindo a porta', () => {
    expect(pedidoComOBotao(null, [{ direcao: 'entrada', conteudo: 'Quero ver funcionando' }])).toBe('ver');
    expect(pedidoComOBotao(null, [{ direcao: 'entrada', conteudo: 'Quero conhecer' }])).toBe('ver');
  });

  it('fica gravado: o registrar tem o adiar, e a retomada é daqui a 60 dias', () => {
    const registrar = FERRAMENTAS.find((f) => f.name === 'registrar')!;
    expect(Object.keys(registrar.input_schema.properties)).toContain('adiar');
    const agora = new Date('2026-11-19T15:00:00Z');
    const quando = dataDaRetomada(agora);
    expect(DIAS_ATE_A_RETOMADA).toBe(60);
    expect(quando.toISOString()).toBe('2027-01-18T15:00:00.000Z');
    expect(adiadaAte(quando.toISOString(), agora)?.getTime()).toBe(quando.getTime());
    expect(adiadaAte(quando.toISOString(), new Date('2027-02-01T00:00:00Z'))).toBeNull();
    expect(adiadaAte(null, agora)).toBeNull();
    expect(motivoDoAdiamento('Outro momento', quando)).toBe('Outro momento ("Outro momento"): retomada em 18/01/2027.');
  });

  it('a despedida "te procuro daqui a 2 meses" só passa com a retomada marcada', () => {
    const despedida = ['Tranquilo. Te procuro daqui a 2 meses. Se mudar antes, é só me chamar aqui.'];
    expect(regras(despedida, { retomadaMarcada: true })).toEqual([]);
    expect(regras(despedida)).toContain('prazo');
    expect(regras(['Tranquilo, te dou 60 dias grátis.'], { retomadaMarcada: true })).toContain('prazo');
  });
});

describe('o nome do dono antes de marcar', () => {
  const PERGUNTA = ['Melhor ainda, quem sente o dia a dia é você. Bora marcar 15 minutos com você e o dono junto: qual o nome dele?'];

  it('passa quando quem fala é vendedor ou vai passar pro dono', () => {
    expect(regras(PERGUNTA, { podePedirODono: true, antesDeMarcar: true })).toEqual([]);
    expect(regras(['Bora marcar com ele junto: qual o nome dele?'], { podePedirODono: true })).toEqual([]);
    expect(regras(['Sem problema. Me passa o contato de quem cuida dos anúncios?'], { podePedirODono: true })).toEqual([]);
  });

  it('continua barrado quando não há sinal de que ele não é o dono', () => {
    expect(regras(PERGUNTA, { antesDeMarcar: true })).toContain('pergunta_de_ficha');
    expect(regras(['Show! Qual o nome do seu sócio?'])).toContain('pergunta_de_ficha');
    expect(regras(['Me passa o contato de quem cuida dos anúncios?'])).toContain('pergunta_de_ficha');
    /* quem decide continua barrado mesmo para o vendedor: só o nome ou o contato */
    expect(regras(['Valeu! E quem decide aí vem junto?'], { podePedirODono: true })).toContain('pergunta_de_ficha');
  });

  it('as perguntas da qualificação seguem passando', () => {
    expect(regras(['4 lugares, tudo à mão, é bastante coisa. Quantos caminhões vocês têm hoje no pátio?'], { soPerguntar: true, lojaConhecida: true })).toEqual([]);
    expect(regras([`Boa. ${PERGUNTA_DA_DOR}`], { lojaConhecida: true })).toEqual([]);
  });

  it('a pergunta do "já tenho sistema" passa', () => {
    expect(regras(['Show. Ele publica no Mercado Livre, Insta e Face com um cadastro só, e tira de todos sozinho quando vende?'], { antesDeMarcar: true })).toEqual([]);
  });

  it('reconhece quem não é o dono', () => {
    expect(leadNaoEODono({ textos: ['vou passar pro dono'] })).toBe(true);
    expect(leadNaoEODono({ textos: ['Isso é com o dono'] })).toBe(true);
    expect(leadNaoEODono({ textos: ['sou só vendedor aqui'] })).toBe(true);
    expect(leadNaoEODono({ textos: ['não é comigo'] })).toBe(true);
    expect(leadNaoEODono({ cargo: 'vendedor' })).toBe(true);
    expect(leadNaoEODono({ cargo: 'dono', textos: ['uns 30 caminhão'] })).toBe(false);
    expect(leadNaoEODono({ cargo: 'sócio e vendedor' })).toBe(false);
    expect(leadNaoEODono({ textos: ['gostei', 'quanto custa?'] })).toBe(false);
  });
});
