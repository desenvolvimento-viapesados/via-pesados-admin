import { describe, expect, it } from 'vitest';
import {
  diaUtil, feriadoNacional, pascoa, grafiaDaConversa, podeEnviarAgora, proximoContato, limiteDoDia, intervaloSorteado, telefoneBR, ehCelular, variantes,
  pediuParaSair, nomeFalado, paramDaMeta, textoDeReserva, pareceLojaDePesados,
  canalDa, REGRAS_DO_CANAL, nomeDaLojaNaMensagem, textoDoModelo, pediuParaVer, BOTAO_VER, BOTAO_SAIR, BOTAO_BORA,
  MODELO_SIMPLES, MODELO_SIMPLES_NOME, MODELOS_DE_RESERVA, MODELOS_DA_PROSPECCAO, ROTULO_DO_VIDEO,
  primeiroNomeDoVendedor, sequenciaDaProspeccao,
  lojaDepoisDaFalha, FALHAS_QUE_DESLIGAM, motivoParaDesligar, VIDEO_DO_MODELO,
} from '../../supabase/functions/_shared/prospeccao-regras';
import { MODELOS } from '../../supabase/functions/_shared/modelos';

/* As regras do agente de prospecção, como o dono definiu em 27/10/2026. */
describe('quando o agente pode mandar', () => {
  it('só em dia útil, das 08h às 20h de Brasília', () => {
    expect(podeEnviarAgora(new Date('2026-10-27T13:00:00Z'))).toBe(true);   // terça 10h
    expect(podeEnviarAgora(new Date('2026-10-27T10:59:00Z'))).toBe(false);  // terça 07h59
    expect(podeEnviarAgora(new Date('2026-10-27T23:00:00Z'))).toBe(false);  // terça 20h
    expect(podeEnviarAgora(new Date('2026-10-31T13:00:00Z'))).toBe(false);  // sábado
    expect(diaUtil(new Date('2026-11-02T02:00:00Z'))).toBe(false);          // domingo 23h em Brasília
  });

  it('três contatos: dia 0, dia 3 e dia 8, sempre em horário útil', () => {
    const terca = new Date('2026-10-27T13:00:00Z');
    const segundo = proximoContato(1, terca, () => 0);
    expect(segundo.toISOString()).toBe('2026-10-30T12:00:00.000Z'); // sexta 09h
    const terceiro = proximoContato(2, segundo, () => 0.999);
    // sexta + 5 = quarta 04/11, 16h59
    expect(terceiro.toISOString()).toBe('2026-11-04T19:59:00.000Z');
  });

  it('o próximo contato nunca cai no fim de semana', () => {
    const quinta = new Date('2026-10-29T13:00:00Z');
    const d = proximoContato(1, quinta, () => 0); // quinta + 3 = domingo → segunda 02/11 é Finados → terça
    expect(d.toISOString()).toBe('2026-11-03T12:00:00.000Z');
    expect(diaUtil(d)).toBe(true);
  });

  it('feriado nacional não é dia útil: nada sai em 20/11, na Sexta-feira Santa nem no Natal', () => {
    expect(podeEnviarAgora(new Date('2026-11-20T14:00:00Z'))).toBe(false); // sexta 20/11 (Consciência Negra), 11h
    expect(podeEnviarAgora(new Date('2026-11-19T14:00:00Z'))).toBe(true);  // quinta 19/11, 11h
    expect(podeEnviarAgora(new Date('2026-11-23T14:00:00Z'))).toBe(true);  // segunda 23/11, 11h
    expect(diaUtil(new Date('2026-12-25T14:00:00Z'))).toBe(false);         // Natal (sexta)
    expect(diaUtil(new Date('2027-01-01T14:00:00Z'))).toBe(false);         // Confraternização (sexta)
    expect(diaUtil(new Date('2026-11-21T02:30:00Z'))).toBe(false);         // ainda 20/11, 23h30 em Brasília
    expect(diaUtil(new Date('2026-11-20T02:30:00Z'))).toBe(true);          // ainda 19/11, 23h30 em Brasília
    expect(pascoa(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(pascoa(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
    expect(pascoa(2028).toISOString().slice(0, 10)).toBe('2028-04-16');
    expect(feriadoNacional(new Date('2026-04-03T14:00:00Z'))).toBe(true);  // Sexta-feira Santa de 2026
    expect(feriadoNacional(new Date('2027-03-26T14:00:00Z'))).toBe(true);  // Sexta-feira Santa de 2027
    expect(feriadoNacional(new Date('2027-03-25T14:00:00Z'))).toBe(false);
    expect(feriadoNacional(new Date('2026-11-11T14:00:00Z'))).toBe(false);
  });

  it('o próximo contato pula o feriado', () => {
    const terca = new Date('2026-11-17T13:00:00Z');
    const d = proximoContato(1, terca, () => 0); // terça + 3 = sexta 20/11 (feriado) → segunda 23/11
    expect(d.toISOString()).toBe('2026-11-23T12:00:00.000Z');
  });

  it('o teto do dia começa em 15 e cresce 5 por semana, sem passar do definido', () => {
    const ini = new Date('2026-10-27T13:00:00Z');
    expect(limiteDoDia(40, ini, ini)).toBe(15);
    expect(limiteDoDia(40, ini, new Date('2026-11-04T13:00:00Z'))).toBe(20);
    expect(limiteDoDia(40, ini, new Date('2027-01-27T13:00:00Z'))).toBe(40);
    expect(limiteDoDia(8, ini, ini)).toBe(8);
    expect(limiteDoDia(40, null, ini)).toBe(15);
  });

  it('o intervalo entre envios é sorteado dentro da faixa', () => {
    expect(intervaloSorteado(7, 18, () => 0)).toBe(7);
    expect(intervaloSorteado(7, 18, () => 0.9999)).toBe(18);
  });
});

describe('telefone', () => {
  it('normaliza para 55 + DDD + número', () => {
    expect(telefoneBR('(33) 98814-4005')).toBe('5533988144005');
    expect(telefoneBR('+55 33 3271-1234')).toBe('553332711234');
    expect(telefoneBR('033 98814-4005')).toBe('5533988144005');
    expect(telefoneBR('0800 123 4567')).toBeNull();
    expect(telefoneBR('123')).toBeNull();
  });

  it('separa celular de fixo', () => {
    expect(ehCelular('5533988144005')).toBe(true);
    expect(ehCelular('553332711234')).toBe(false);
  });

  it('procura o número com e sem o 9, como o WhatsApp grava', () => {
    expect(variantes('5533988144005')).toEqual(['5533988144005', '553388144005']);
    expect(variantes('553388144005')).toEqual(['553388144005', '5533988144005']);
    expect(variantes('553332711234')).toEqual(['553332711234']);
  });

  it('a resposta entra na conversa que já existe na outra grafia (11/11/2026)', () => {
    // A prospecção grava com o 9; o WhatsApp devolve sem: entra na conversa de 13 dígitos.
    expect(grafiaDaConversa('553588144005', ['5535988144005'])).toBe('5535988144005');
    // O contrário: conversa antiga sem o 9, envio com o 9.
    expect(grafiaDaConversa('5535988144005', ['553588144005'])).toBe('553588144005');
    // A grafia exata existe: ela manda, mesmo com a outra também na caixa.
    expect(grafiaDaConversa('553588144005', ['553588144005', '5535988144005'])).toBe('553588144005');
    // Conversa nova: a grafia que chegou.
    expect(grafiaDaConversa('553588144005', [])).toBe('553588144005');
    // Fixo não tem variante; número de fora do Brasil fica como está.
    expect(grafiaDaConversa('553332711234', ['5533932711234'])).toBe('553332711234');
    expect(grafiaDaConversa('447911123456', ['4479911123456'])).toBe('447911123456');
    // Celular 9 + 1 a 5 não vira o fixo de mesmo final (outra pessoa).
    expect(grafiaDaConversa('5511943211234', ['551143211234'])).toBe('5511943211234');
    expect(grafiaDaConversa('5511913211234', ['551113211234'])).toBe('5511913211234');
  });
});

describe('quem pediu para sair', () => {
  it.each([
    'sair', 'PARE', 'Não tenho interesse', 'sem interesse, obrigado', 'não quero', 'Não, obrigado',
    'por favor me tira dessa lista', 'para de me mandar mensagem', 'vou bloquear', 'não me chame mais',
  ])('"%s" é pedido para sair', (t) => expect(pediuParaSair(t)).toBe(true));

  it.each([
    'Parece interessante', 'quanto custa?', 'não quero perder tempo com planilha, como funciona?',
    'pode mandar', 'já usamos um sistema, mas me conta mais', 'vou sair agora mas te chamo depois sobre isso', '',
    'me tira uma dúvida: serve pra carreta?', 'deu bloqueio no Face', 'Não preciso, já tenho site',
  ])('"%s" não é', (t) => expect(pediuParaSair(t)).toBe(false));
});

describe('o texto', () => {
  it('fala o nome da loja como gente', () => {
    expect(nomeFalado('RODOLIMA CAMINHOES LTDA')).toBe('Rodolima Caminhões');
    expect(nomeFalado('Eixo Forte Caminhões - ')).toBe('Eixo Forte Caminhões');
  });

  it('tem três jeitos de dizer cada contato, e o último não pede nada', () => {
    const loja = { nome: 'Eixo Forte', cidade: 'Cascavel' };
    const primeiros = new Set([0, 0.4, 0.8].map((s) => textoDeReserva(loja, 1, () => s)));
    expect(primeiros.size).toBe(3);
    for (const s of [0, 0.4, 0.8]) {
      expect(textoDeReserva(loja, 1, () => s)).toContain('Eixo Forte');
      expect(textoDeReserva(loja, 2, () => s)).toMatch(/não|parar|insisto|paro/i);
      expect(textoDeReserva(loja, 3, () => s)).not.toContain('?');
      expect(textoDeReserva(loja, 1, () => s)).not.toMatch(/https?:/);
    }
  });

  it('o Google devolve oficina e peças junto; a fila fica só com loja', () => {
    expect(pareceLojaDePesados('Eixo Forte Caminhões')).toBe(true);
    expect(pareceLojaDePesados('Auto Peças Diesel Forte')).toBe(false);
    expect(pareceLojaDePesados('Borracharia do Zé')).toBe(false);
    expect(pareceLojaDePesados('Transportadora Rápido')).toBe(false);
    expect(pareceLojaDePesados('Comércio de Caminhões e Peças Silva')).toBe(true);
    expect(pareceLojaDePesados('JR Multimarcas')).toBe(true);
  });
});

/* O {{1}} do modelo: "foto, ficha e preço dos veículos da {{1}} pros seus clientes" (06/11/2026).
   Os exemplos são nomes reais da lista do portal Caminhões e Carretas. */
describe('o nome da loja na mensagem', () => {
  it('fica o primeiro trecho antes de " - ", " – ", " | " ou " / " (marca, cidade, UF, Matriz, descrição)', () => {
    expect(nomeFalado('Hohl Máquinas Agrícolas - John Deere')).toBe('Hohl Máquinas Agrícolas');
    expect(nomeFalado('Garra Caminhões - Goiânia')).toBe('Garra Caminhões');
    expect(nomeFalado('SM Tratores - Massey - Matriz')).toBe('SM Tratores');
    expect(nomeFalado('LM Caminhões - Compra, venda e troca de caminhões')).toBe('LM Caminhões');
    expect(nomeFalado('P. B. Lopes - Scania - Campo Grande MS')).toBe('P. B. Lopes');
    expect(nomeFalado('Betânia Veículos - Matriz')).toBe('Betânia Veículos');
    expect(nomeFalado('Dimaq - GO')).toBe('Dimaq');
    expect(nomeFalado('Via Trucks - DAF - Guarulhos-SP')).toBe('Via Trucks');
    expect(nomeFalado('M.A. Máquinas Agrícolas - Cascavel')).toBe('M.A. Máquinas Agrícolas');
    expect(nomeFalado('GOTEMBURGO / SEMINOVOS')).toBe('Gotemburgo');
    expect(nomeFalado('Cotrama Máquinas Agrícolas / Seminovos')).toBe('Cotrama Máquinas Agrícolas');
    expect(nomeFalado('Fulano Caminhões | Goiânia')).toBe('Fulano Caminhões');
    expect(nomeFalado('Fulano Caminhões – Goiânia')).toBe('Fulano Caminhões');
    expect(nomeFalado('DAF Nova Caminhões - Recife/PE')).toBe('DAF Nova Caminhões');
  });

  it('hífen sem espaço é parte do nome, não separador', () => {
    expect(nomeFalado('E-Machine Comercial S.A.')).toBe('E-Machine Comercial');
    expect(nomeFalado('Rodo.Via Caminhões e Implementos')).toBe('Rodo.Via Caminhões e Implementos');
  });

  it('primeiro trecho que sozinho não é nome: só marca pula, só palavra genérica junta com o próximo', () => {
    expect(nomeFalado('Volks / Confia - Volkswagen')).toBe('Confia');
    expect(nomeFalado('Seminovos - Tracbel')).toBe('Seminovos Tracbel');
    expect(nomeFalado('A - Fulano Caminhões')).toBe('Fulano Caminhões');
    /* Tudo genérico: fica o primeiro, que é o nome da loja. */
    expect(nomeFalado('Agro Caminhão - Caminhões e Máquinas Agrícolas')).toBe('Agro Caminhão');
    /* Sigla é nome. */
    expect(nomeFalado('PDM - Ponto das Máquinas')).toBe('PDM');
  });

  it('palavra inteira em maiúsculas com 5+ letras vira Primeira Maiúscula; sigla de até 4 fica', () => {
    expect(nomeFalado('RODOCAPITAL - TRUCKVAN')).toBe('Rodocapital');
    expect(nomeFalado('ZEROBALA Caminhões')).toBe('Zerobala Caminhões');
    expect(nomeFalado('DATERRA Implementos Agrícolas')).toBe('Daterra Implementos Agrícolas');
    expect(nomeFalado('TRUCKCISO')).toBe('Truckciso');
    for (const n of ['BC Caminhões Seminovos', 'JDM Caminhões', 'NG Caminhões', '4R Caminhões', '2F Caminhões', '63 Caminhões', 'TSG',
      'Ello MS TruckVan', 'SelecTrucks', 'K LOG Caminhões', 'GANA Equipamentos Agrícolas', 'Nery Caminhões N.C.V.']) {
      expect(nomeFalado(n), n).toBe(n);
    }
  });

  it('nome todo em maiúsculas (ou todo em minúsculas) fica como gente escreve', () => {
    expect(nomeFalado('TREDIESEL CAMINHÕES LTDA')).toBe('Trediesel Caminhões');
    expect(nomeFalado('BC CAMINHÕES E MÁQUINAS')).toBe('BC Caminhões e Máquinas');
    expect(nomeFalado('AUTO BOM CAMINHÕES')).toBe('Auto Bom Caminhões');
    expect(nomeFalado('fulano caminhões de minas')).toBe('Fulano Caminhões de Minas');
  });

  it('"e", "de", "da", "do" no meio do nome vão em minúscula', () => {
    expect(nomeFalado('Paulo Mokan Compra E Venda De Máquinas Usadas')).toBe('Paulo Mokan Compra e Venda de Máquinas Usadas');
    expect(nomeFalado('Kades Central De Máquinas')).toBe('Kades Central de Máquinas');
    expect(nomeFalado('De Nigris - MB')).toBe('De Nigris');
  });

  it('acento nas palavras do setor, sem mexer em nome próprio', () => {
    expect(nomeFalado('Nilson Caminhoes')).toBe('Nilson Caminhões');
    expect(nomeFalado('Querência Maquinas - Stara')).toBe('Querência Máquinas');
    expect(nomeFalado('SB Veiculos')).toBe('SB Veículos');
    expect(nomeFalado('Moi Maquinas e Implementos Agricolas')).toBe('Moi Máquinas e Implementos Agrícolas');
    expect(nomeFalado('Agricola Bavaria')).toBe('Agrícola Bavaria');
    expect(nomeFalado('Agua Clara Caminhões')).toBe('Água Clara Caminhões');
    expect(nomeFalado('Micro-onibus Caminhoes')).toBe('Micro-ônibus Caminhões');
    expect(nomeFalado('Fulano Comercio de Pecas Rodoviarias')).toBe('Fulano Comércio de Peças Rodoviárias');
    expect(nomeFalado('Itajai Caminhões')).toBe('Itajai Caminhões');
  });

  it('sem razão social, parênteses e ®', () => {
    expect(nomeFalado('Jacó Comércio de Peças Agrícolas LTDA')).toBe('Jacó Comércio de Peças Agrícolas');
    expect(nomeFalado('Tratornew S/A - New Holland')).toBe('Tratornew');
    expect(nomeFalado('Comércio de Caminhões Silva Ltda - ME')).toBe('Comércio de Caminhões Silva');
    expect(nomeFalado('Fulano Caminhões EIRELI')).toBe('Fulano Caminhões');
    expect(nomeFalado('Fulano Caminhões EPP')).toBe('Fulano Caminhões');
    expect(nomeFalado('Ibiporã Implementos Rodoviários - ( Fábrica )')).toBe('Ibiporã Implementos Rodoviários');
    expect(nomeFalado('Fulano Caminhões (Matriz)')).toBe('Fulano Caminhões');
    expect(nomeFalado('Rural Vendas®')).toBe('Rural Vendas');
    /* "Me" só sai como razão social, no fim. */
    expect(nomeFalado('Agro Mesa')).toBe('Agro Mesa');
  });

  it('UF solta e "Matriz" no fim saem; cidade sem separador fica', () => {
    expect(nomeFalado('Marcelo Caminhões MG')).toBe('Marcelo Caminhões');
    expect(nomeFalado('JK Caminhões PR')).toBe('JK Caminhões');
    expect(nomeFalado('Edmilson Caminhões Itajubá MG')).toBe('Edmilson Caminhões Itajubá');
    expect(nomeFalado('Fulano Caminhões Matriz')).toBe('Fulano Caminhões');
    expect(nomeFalado('Agrícola LL')).toBe('Agrícola LL');
    expect(nomeFalado('Beto Caminhões Piracicaba')).toBe('Beto Caminhões Piracicaba');
  });

  it('pontuação e espaço sobrando', () => {
    expect(nomeFalado('  Eixo   Forte  Caminhões -  ')).toBe('Eixo Forte Caminhões');
    expect(nomeFalado('Forza Caminhões, Ônibus e Implementos - Agrale')).toBe('Forza Caminhões, Ônibus e Implementos');
    expect(nomeFalado('Fulano Caminhões &')).toBe('Fulano Caminhões');
  });

  it('higiene da Meta: sem quebra de linha, tab ou 4 espaços seguidos, e até 60 caracteres cortados na palavra', () => {
    expect(paramDaMeta('Minas\nCaminhões')).toBe('Minas Caminhões');
    expect(paramDaMeta('Minas\tCaminhões     Ltda')).toBe('Minas Caminhões Ltda');
    expect(nomeFalado('Fulano\r\nCaminhões')).toBe('Fulano Caminhões');
    const longo = nomeFalado('Caminhões Seminovos Transportadora Rodoviária e Comércio de Peças Agrícolas do Brasil Central Ltda');
    expect(longo.length).toBeLessThanOrEqual(60);
    expect(longo).toBe('Caminhões Seminovos Transportadora Rodoviária e Comércio');
    expect(paramDaMeta('x'.repeat(80)).length).toBe(60);
  });

  it('nunca devolve vazio', () => {
    for (const n of ['', '   ', 'LTDA', '- Matriz', '( )', '®']) {
      const r = nomeFalado(n);
      expect(r.trim(), JSON.stringify(n)).not.toBe('');
      expect(r).not.toMatch(/[\n\t]| {4}/);
    }
    expect(nomeFalado('')).toBe('sua loja');
  });

  it('a correção à mão (dados.nome_mensagem) vale mais que a regra, com a mesma higiene', () => {
    expect(nomeDaLojaNaMensagem({ nome: 'P. B. Lopes - Scania - Campo Grande MS', dados: { nome_mensagem: 'PB Lopes' } })).toBe('PB Lopes');
    expect(nomeDaLojaNaMensagem({ nome: 'X', dados: { nome_mensagem: '  Minas\nCaminhões  ' } })).toBe('Minas Caminhões');
    expect(nomeDaLojaNaMensagem({ nome: 'GOTEMBURGO / SEMINOVOS', dados: { nome_mensagem: '   ' } })).toBe('Gotemburgo');
    expect(nomeDaLojaNaMensagem({ nome: 'GOTEMBURGO / SEMINOVOS', dados: { nome_mensagem: 42 } })).toBe('Gotemburgo');
    expect(nomeDaLojaNaMensagem({ nome: 'GOTEMBURGO / SEMINOVOS', dados: null })).toBe('Gotemburgo');
    expect(nomeDaLojaNaMensagem({ nome: 'Y', dados: { nome_mensagem: 'a'.repeat(70) } }).length).toBe(60);
  });
});

/* As regras da Meta para modelo: o que ela recusa na aprovação, conferido antes de submeter. */
describe('os modelos seguem as regras da Meta', () => {
  for (const m of MODELOS) {
    it(m.name, () => {
      const corpo = m.components.find((c) => c.type === 'BODY') as { text: string; example?: { body_text?: string[][] } } | undefined;
      expect(corpo, 'todo modelo tem corpo').toBeTruthy();
      const texto = String(corpo!.text);
      expect(texto.length, 'corpo até 1024').toBeLessThanOrEqual(1024);
      expect(texto.trim(), 'corpo não começa com variável').not.toMatch(/^\{\{\d+\}\}/);
      expect(texto.trim(), 'corpo não termina com variável').not.toMatch(/\{\{\d+\}\}$/);
      const numeros = [...new Set([...texto.matchAll(/\{\{(\d+)\}\}/g)].map((x) => Number(x[1])))].sort((a, b) => a - b);
      expect(numeros, 'variáveis em sequência, de 1 em 1').toEqual(numeros.map((_, i) => i + 1));
      if (numeros.length) expect(corpo!.example?.body_text?.[0]?.length, 'um exemplo por variável').toBe(numeros.length);
      const rodape = m.components.find((c) => c.type === 'FOOTER');
      if (rodape) expect(String(rodape.text).length, 'rodapé até 60').toBeLessThanOrEqual(60);
      const topo = m.components.find((c) => c.type === 'HEADER');
      if (topo && (topo.format ?? 'TEXT') === 'TEXT') expect(String(topo.text).length, 'cabeçalho até 60').toBeLessThanOrEqual(60);
      const botoes = (m.components.find((c) => c.type === 'BUTTONS') as { buttons?: { type: string; text: string }[] } | undefined)?.buttons ?? [];
      for (const b of botoes) expect(b.text.length, `botão "${b.text}" até 25`).toBeLessThanOrEqual(25);
    });
  }
});

/* Pelo número oficial: o canal em 03/11/2026; a mensagem única com o vídeo em 10/11/2026. */
describe('prospecção pelo número oficial', () => {
  const modelo = (nome: string) => MODELOS.find((m) => m.name === nome)!;
  const corpo = (nome: string) => String(modelo(nome).components.find((c) => c.type === 'BODY')!.text);
  const botoes = (nome: string) =>
    (modelo(nome).components.find((c) => c.type === 'BUTTONS') as unknown as { buttons: { type: string; text: string }[] } | undefined)?.buttons ?? [];

  it('o número da YCloud é o oficial; o resto é QR code', () => {
    expect(canalDa('ycloud')).toBe('oficial');
    expect(canalDa('evolution')).toBe('evolution');
    expect(canalDa(null)).toBe('evolution');
  });

  it('um contato só por loja, começando em 30 por dia e subindo 10 por semana', () => {
    expect(REGRAS_DO_CANAL.oficial.maxContatos).toBe(1);
    const ini = new Date('2026-11-03T13:00:00Z');
    expect(limiteDoDia(50, ini, ini, 'oficial')).toBe(30);
    expect(limiteDoDia(50, ini, new Date('2026-11-11T13:00:00Z'), 'oficial')).toBe(40);
    expect(limiteDoDia(50, ini, new Date('2026-12-30T13:00:00Z'), 'oficial')).toBe(50);
    expect(limiteDoDia(40, ini, ini)).toBe(15); // o QR code continua como era
  });

  it('a mensagem do vídeo existe (com e sem o nome), de marketing; as três de antes ficam de reserva; o antigo com teste grátis não sai mais', () => {
    expect([...MODELOS_DA_PROSPECCAO]).toEqual([MODELO_SIMPLES, MODELO_SIMPLES_NOME]);
    for (const m of MODELOS_DA_PROSPECCAO) expect(modelo(m)?.category, m).toBe('MARKETING');
    for (const m of MODELOS_DE_RESERVA) {
      expect(modelo(m)?.category, m).toBe('MARKETING'); // a conta nova recria
      expect((MODELOS_DA_PROSPECCAO as readonly string[]).includes(m), m).toBe(false); // e não sai
    }
    expect(MODELOS.some((m) => m.name === 'prospeccao_lojista' || m.name === 'prospeccao_lojista_v2')).toBe(false);
  });

  const FRASE = 'Já imaginou atender seus clientes com essa facilidade? Foto, ficha e preço do veículo no WhatsApp dele, com um clique.';
  const FECHO = 'O único sistema de gestão do Brasil, para lojas de veículos pesados';

  it('o texto do dono (10/11): a frase, a promessa e o fecho dele, palavra por palavra; com o vendedor, "Fala, {{1}}!"', () => {
    expect(corpo(MODELO_SIMPLES)).toBe(`${FRASE}\n\n${FECHO}`);
    expect(corpo(MODELO_SIMPLES_NOME)).toBe(`Fala, {{1}}! ${FRASE}\n\n${FECHO}`);
  });

  it('o vídeo no topo, o rodapé e os dois botões de resposta', () => {
    for (const m of MODELOS_DA_PROSPECCAO) {
      const topo = modelo(m).components.find((c) => c.type === 'HEADER') as unknown as { format: string; example: { header_url: string[] } };
      expect(topo.format, m).toBe('VIDEO');
      expect(topo.example.header_url, m).toEqual([VIDEO_DO_MODELO]);
      expect(modelo(m).components.find((c) => c.type === 'FOOTER')?.text, m).toBe('Xavier · Via Pesados');
      expect(botoes(m).map((b) => b.text), m).toEqual([BOTAO_VER, BOTAO_SAIR]);
      expect(botoes(m).every((b) => b.type === 'QUICK_REPLY'), m).toBe(true);
    }
  });

  it('o vídeo novo, num endereço novo (cache da Meta e do WhatsApp)', () => {
    expect(VIDEO_DO_MODELO).toMatch(/\/logos\/wa\/prospeccao-v2\.mp4$/);
  });

  it('nenhuma mensagem fala de teste grátis, de prazo, nem de oferta (a Black Friday fica só no vídeo, que troca sem aprovação)', () => {
    for (const m of [...MODELOS_DA_PROSPECCAO, ...MODELOS_DE_RESERVA]) {
      expect(corpo(m)).not.toMatch(/gr[áa]tis|gratuit|teste|testar|amostra/i);
      expect(corpo(m)).not.toMatch(/\d+ dias/);
    }
    for (const m of MODELOS_DA_PROSPECCAO) expect(corpo(m)).not.toMatch(/oferta|black|novembro|R\$|desconto|promo/i);
  });

  it('a sequência: uma mensagem só, o vídeo com o vendedor quando o portal tem o nome', () => {
    const comVendedor = sequenciaDaProspeccao({ nome: 'Hohl Máquinas Agrícolas - John Deere', dados: { contato: 'vendedor: Marcelo Cristo' } });
    expect(comVendedor).toEqual([{ modelo: MODELO_SIMPLES_NOME, params: ['Marcelo'], video: true, botoes: true }]);
    const daLoja = sequenciaDaProspeccao({ nome: 'TREDIESEL CAMINHÕES LTDA', dados: { contato: 'loja' } });
    expect(daLoja).toEqual([{ modelo: MODELO_SIMPLES, params: [], video: true, botoes: true }]);
    const semNome = sequenciaDaProspeccao({ nome: 'X', dados: { contato: 'vendedor: Cowboy', vendedor_mensagem: '' } });
    expect(semNome.map((m) => m.modelo)).toEqual([MODELO_SIMPLES]);
    expect(textoDoModelo(corpo(MODELO_SIMPLES_NOME), comVendedor[0].params)).toMatch(/^Fala, Marcelo! Já imaginou/);
    expect(ROTULO_DO_VIDEO.startsWith('[vídeo')).toBe(true); // é por aqui que o Davi reconhece a prospecção
    expect(ROTULO_DO_VIDEO).toMatch(/Black Friday/); // o Davi sabe da oferta que o vídeo promete
  });

  it('o primeiro nome do vendedor, do jeito que o portal escreve', () => {
    const v = (contato: string) => primeiroNomeDoVendedor({ contato });
    expect(v('vendedor: Marcelo')).toBe('Marcelo');
    expect(v('vendedor: Marcelo Cristo')).toBe('Marcelo');
    expect(v('vendedor: João Paulo')).toBe('João Paulo');
    expect(v('vendedor: Luiz Fernando')).toBe('Luiz Fernando');
    expect(v('vendedor: Pedro Paulo (Vendas)')).toBe('Pedro Paulo');
    expect(v('vendedor: Erick (Implementos)')).toBe('Erick');
    expect(v('vendedor: Rafaela Fernanda - FINANCIAMENTOS')).toBe('Rafaela');
    expect(v('vendedor: Guilherme - Vendas de Peças')).toBe('Guilherme');
    expect(v('vendedor: Edson Natal RIGO Filho')).toBe('Edson');
    expect(v('vendedor: MARCELO')).toBe('Marcelo');
    expect(v('vendedor: Junior ou Amarildo')).toBeNull(); // dois no mesmo número
    expect(v('vendedor: Jr. Mahnic')).toBeNull();
    expect(v('vendedor: Vendas')).toBeNull();
    expect(v('loja')).toBeNull();
    expect(primeiroNomeDoVendedor(null)).toBeNull();
    expect(primeiroNomeDoVendedor({ contato: 'vendedor: Bil AutoSueco', vendedor_mensagem: 'Bill' })).toBe('Bill');
    expect(primeiroNomeDoVendedor({ contato: 'vendedor: Cowboy', vendedor_mensagem: '' })).toBeNull();
  });

  it('"Quero ver funcionando" é pedido de ver; "Bora!" (conversa antiga) não é pedido de ver nem de sair; "Não tenho interesse" é saída', () => {
    expect(pediuParaSair(BOTAO_SAIR)).toBe(true);
    expect(pediuParaSair(BOTAO_BORA)).toBe(false);
    expect(pediuParaVer(BOTAO_BORA)).toBe(false);
    expect(pediuParaVer(BOTAO_VER)).toBe(true);
    expect(pediuParaVer('quero ver funcionando!')).toBe(true);
    expect(pediuParaVer('quero ver funcionando, quanto custa?')).toBe(false);
    expect(pediuParaVer(null)).toBe(false);
    expect(pediuParaSair(BOTAO_VER)).toBe(false);
  });

  it('entrega que falhou: sem WhatsApp sai da fila; bloqueio desliga', () => {
    expect(lojaDepoisDaFalha('131026').status).toBe('sem_whatsapp');
    expect(lojaDepoisDaFalha('131049').motivo).toContain('muitas mensagens de empresas');
    expect(lojaDepoisDaFalha('').status).toBe('sem_resposta');
    expect(FALHAS_QUE_DESLIGAM.has('131048')).toBe(true);
    expect(FALHAS_QUE_DESLIGAM.has('131026')).toBe(false);
  });

  it('qualidade amarela ou vermelha desliga; verde ou sem leitura segue', () => {
    expect(motivoParaDesligar('GREEN', 'CONNECTED')).toBeNull();
    expect(motivoParaDesligar('UNKNOWN', null)).toBeNull();
    expect(motivoParaDesligar('YELLOW', 'CONNECTED')).toContain('amarelo');
    expect(motivoParaDesligar('RED', 'CONNECTED')).toContain('vermelho');
    expect(motivoParaDesligar('GREEN', 'FLAGGED')).toContain('FLAGGED');
  });
});
