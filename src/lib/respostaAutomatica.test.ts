import { describe, expect, it } from 'vitest';
import {
  horaDoLembrete, LEMBRETE_PARA_A_EQUIPE, lerRespostasAutomaticas, MARCA_DO_RECADO, pareceRespostaAutomatica, RECADO_PARA_A_EQUIPE,
} from '../../supabase/functions/_shared/resposta-automatica';

/* Respostas reais que chegaram no número da prospecção (10–13/11/2026), com os segundos desde a nossa mensagem. */
const ROBOS: [string, number | null][] = [
  ["Olá, somos o *Branco Caminhões*, 🚛 a loja de Caminhões e Veículos Semi Novos mais *CONFIÁVEL  e COMPLETA do BRASIL!*                                                    Em que podemos lhe ajudar? 🚦 Acesse ao link para todo nosso estoque com fotos, descrições e valores👇👇\nhttps://www.brancocaminhoes.com.br/15/\nQualquer dúvida estamos a disposição, deixe sua mensagem que responderemos assim que possível! É um prazer tê-lo como cliente e amigo🤝🚛🚛", 15],
  ["Olá! Seja bem-vindo(a) à Contagem Caminhões! 🚛😊\n\nSou a Priscila, auxiliar de vendas. Trabalhamos com caminhões seminovos multimarcas e implementos rodoviários. Como podemos te ajudar?", 14],
  ["Olá! Aqui é o(a) Neuma do Grupo Divena.\nTemos total compromisso com a LGPD e com as melhores práticas de Compliance, garantindo a segurança e a privacidade dos seus dados.\nNosso atendimento é realizado com transparência e ética.\nPara conhecer seus direitos e as medidas adotadas, consulte nossa Política de Privacidade.\nEssa iniciativa reforça nossa conformidade e responsabilidade no tratamento de dados pessoais.", 19],
  ["‎E R Seminovos agradece seu contato. Como podemos ajudar?", 18],
  ["Emilio agradece seu contato. Como podemos ajudar?", 13],
  ["Olá! 👋\n\nMeu nome é Ingrid e faço parte do Departamento de Marketing da MP Caminhões e Carretas.\n\nAgradecemos o seu contato! Em breve, um de nossos consultores retornará o atendimento.\n\nPara agilizar o nosso atendimento, por gentileza informe qual produto é do seu interesse:\n\n🚛 Caminhões\n🚚 Implementos Rodoviários\n\nFicamos à disposição e será um prazer atendê-lo!\nEquipe MP Caminhões e Carretas.", 13],
  ["Oi, tudo bem? Aqui é o Luís, assistente de pré-atendimento da Siqueira Caminhões. Essa mensagem parece ser de apresentação de sistema para lojas de veículos, e eu cuido só do atendimento de compra de caminhões.", 66],
  ["Já passei a conversa para o vendedor, que continua com você por aqui.", 70],
  ["Olá! 👋\n\nAqui é a Gracielle Fernandes da Tanaka Caminhões.\nEstou à disposição para te ajudar a encontrar o caminhão ideal para o seu negócio. 🚛\n\nMe conte o que você procura e retornaremos seu contato o mais breve possível. 😉", 13],
  ["Olá! \n\n*Quer falar diretamente com um vendedor e ter seu contato priorizado?* É só me enviar aqui:\n\n- Se você já tem caminhão;\n• Qual modelo procura (e se o que você viu já te atende 100%);\n• Como prefere negociar (financiamento, carta de crédito ou à vista).\n\n*Assim que me informar isso, um consultor entrará em contato com você.*", 17],
];
const PESSOAS: [string, number | null][] = [
  ["Quero ver funcionando", 111],
  ["Hj e segunda nestes horarios nao consigo", 446],
  ["Toda decisao de compras fica na nossa Matriz em Jundiai sp", 81],
  ["Grupo Transkothe", 93],
  ["[audio]", 20],
  ["[audio]", 1],
  ["[audio]", 3],
  ["Não tenho interesse", 4602],
  ["[unsupported]", 151910],
  ["[imagem]", 151910],
  ["[imagem]", 151910],
  ["[imagem]", 151911],
  ["[imagem]", 151911],
  ["[imagem]", 151911],
  ["[imagem]", 151911],
  ["[imagem]", 151911],
  ["[imagem]", 151912],
  ["www.caminhoescerto.com.br", 74],
  ["👆", 76],
  ["50", 758],
  ["Corretor", 155],
  ["Temos loja tmv", 161],
  ["Como funciona", 420],
  ["30", 16],
  ["Dono", 18],
  ["Sexta as 9", 2575],
  ["10h30", 1124],
  ["https://meet.google.com/gmw-pvea-fxy", 48],
  ["sim", 89],
  ["Davi,  vou apresentar sua proposta para gerência e re retorno", 5182],
  ["Opa, quero adquirir o sistema via pesados", null],
  ["Opa, quero conhecer o sistema via pesados", 8082],
  ["Opa, quero conhecer o sistema via pesados", 452],
  ["Opa, quero conhecer o sistema via pesados", 520],
  ["Opa, quero conhecer o sistema via pesados", 647],
  ["Opa, quero conhecer o sistema via pesados", 19353],
  ["Eu anuncio no mercado livre, WhatsApp e Instagram", 2638],
  ["Gostei", 214],
  ["Hoje a gente tá com uns 35", 49],
  ["Sou dono", 29],
  ["[audio]", 118],
  ["[audio]", 5978],
  ["[audio]", 22],
  ["Fica em Valadares", 19],
  ["Minas Gerais", 21],
  ["Quero ver funcionando", 42206],
  ["Só posso a partir de terça", 922],
  ["As 13", 26],
  ["Ok", 1328],
  ["esse link", 6755],
  ["nao deu", 425],
  ["tentei mais ninguem aceitou", 22],
  ["nao vao entrar nao?", 319],
  ["Não tenho interesse", 3916],
  ['Bom dia, quanto custa?', 20],
  ['Quero conhecer', 5],
  ['Pode me ligar depois das 14h, estou na rua agora', 40],
];

describe('resposta automática da loja (dono, 17/11/2026)', () => {
  it('reconhece as saudações, os menus e os robôs de pré-atendimento das lojas', () => {
    for (const [t, s] of ROBOS) expect(pareceRespostaAutomatica(t, s), t.slice(0, 80)).toBe(true);
  });

  it('não confunde gente com robô: botão, número, áudio, foto e frase curta', () => {
    for (const [t, s] of PESSOAS) expect(pareceRespostaAutomatica(t, s), t.slice(0, 80)).toBe(false);
  });

  it('a mesma saudação fraca só vira robô se chegar em segundos', () => {
    const t = 'Olá, somos a Loja X Caminhões. Em que podemos lhe ajudar hoje com o seu caminhão?';
    expect(pareceRespostaAutomatica(t, 10)).toBe(true);
    expect(pareceRespostaAutomatica('Em que podemos lhe ajudar com o seu caminhão hoje, amigo?', 3600)).toBe(false);
  });

  const em = (s: number) => new Date(Date.UTC(2026, 10, 17, 12, 0, s)).toISOString();
  it('a conversa: só robô depois da nossa → recado; robô de novo depois do recado → silêncio', () => {
    const msgs = [
      { direcao: 'saida', conteudo: '[vídeo] O único sistema…', created_at: em(0) },
      { direcao: 'entrada', conteudo: '\u200eE R Seminovos agradece seu contato. Como podemos ajudar?', created_at: em(18) },
    ];
    expect(lerRespostasAutomaticas(msgs)).toMatchObject({ novasSaoRobo: true, humanoJaFalou: false, recadoJaFoi: false });
    const depois = [...msgs,
      { direcao: 'saida', conteudo: RECADO_PARA_A_EQUIPE, created_at: em(60) },
      { direcao: 'entrada', conteudo: '\u200eE R Seminovos agradece seu contato. Como podemos ajudar?', created_at: em(70) },
    ];
    expect(lerRespostasAutomaticas(depois)).toMatchObject({ novasSaoRobo: true, humanoJaFalou: false, recadoJaFoi: true });
    const gente = [...depois, { direcao: 'entrada', conteudo: 'Opa, sou o dono. Como funciona?', created_at: em(500) }];
    expect(lerRespostasAutomaticas(gente)).toMatchObject({ novasSaoRobo: false, humanoJaFalou: true, recadoJaFoi: true });
  });

  it('o recado (dono, 17/11): simples, "atendente da Via Pesados", "o único sistema do país", resposta fácil', () => {
    expect(RECADO_PARA_A_EQUIPE).toMatch(/^Oi! Aqui é o Davi, atendente da Via Pesados\. Somos o único sistema do país feito para lojas de veículos pesados\./);
    expect(RECADO_PARA_A_EQUIPE).toContain(MARCA_DO_RECADO);
    expect(RECADO_PARA_A_EQUIPE).toMatch(/é só me falar\.$/);
    expect(RECADO_PARA_A_EQUIPE).toContain('O único com conexões oficiais para *Mercado Livre, Instagram e Facebook*.');
    expect(RECADO_PARA_A_EQUIPE.length).toBeLessThan(280);
    expect(RECADO_PARA_A_EQUIPE).not.toMatch(/R\$|grátis|Black|automátic/i);
    expect(LEMBRETE_PARA_A_EQUIPE).toBe('Passando aqui de novo 🙂 Conseguiu ver a mensagem acima? É só responder essa mensagem que o Xavier te mostra em 15 minutos.');
  });

  const h = (horas: number) => new Date(Date.UTC(2026, 10, 17, 11, 0) + horas * 3_600_000).toISOString();
  const robo = '\u200eE R Seminovos agradece seu contato. Como podemos ajudar?';
  const conversa = [
    { direcao: 'saida', conteudo: '[vídeo] O único sistema…', created_at: h(0) },
    { direcao: 'entrada', conteudo: robo, created_at: h(0.005) },
    { direcao: 'saida', conteudo: RECADO_PARA_A_EQUIPE, created_at: h(0.02) },
  ];
  it('o lembrete: 4h depois do recado, sem ninguém, dentro das 24h; uma vez só', () => {
    const l = lerRespostasAutomaticas(conversa);
    expect(horaDoLembrete(l, new Date(h(3)))).toBe(false);
    expect(horaDoLembrete(l, new Date(h(4.1)))).toBe(true);
    expect(horaDoLembrete(l, new Date(h(22.9)))).toBe(true);
    expect(horaDoLembrete(l, new Date(h(23.5)))).toBe(false); // a janela do WhatsApp está fechando
    const jaFoi = lerRespostasAutomaticas([...conversa, { direcao: 'saida', conteudo: LEMBRETE_PARA_A_EQUIPE, created_at: h(5) },
      { direcao: 'entrada', conteudo: robo, created_at: h(5.001) }]);
    expect(jaFoi.lembreteJaFoi).toBe(true);
    expect(horaDoLembrete(jaFoi, new Date(h(10)))).toBe(false);
    const gente = lerRespostasAutomaticas([...conversa, { direcao: 'entrada', conteudo: 'Opa, sou o dono. Como funciona?', created_at: h(2) }]);
    expect(horaDoLembrete(gente, new Date(h(5)))).toBe(false);
  });
});
