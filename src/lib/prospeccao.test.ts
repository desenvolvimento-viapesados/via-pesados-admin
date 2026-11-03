import { describe, expect, it } from 'vitest';
import {
  diaUtil, podeEnviarAgora, proximoContato, limiteDoDia, intervaloSorteado, telefoneBR, ehCelular, variantes,
  pediuParaSair, nomeFalado, textoDeReserva, pareceLojaDePesados,
  canalDa, REGRAS_DO_CANAL, paramsDoModelo, textoDoModelo, pediuTeste, BOTAO_TESTE, BOTAO_SAIR,
  MODELO_PROSPECCAO, lojaDepoisDaFalha, FALHAS_QUE_DESLIGAM, motivoParaDesligar, VIDEO_DO_MODELO,
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
    const d = proximoContato(1, quinta, () => 0); // quinta + 3 = domingo → segunda
    expect(d.toISOString()).toBe('2026-11-02T12:00:00.000Z');
    expect(diaUtil(d)).toBe(true);
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
    expect(nomeFalado('RODOLIMA CAMINHOES LTDA')).toBe('Rodolima Caminhoes');
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

/* Pelo número oficial, como o dono decidiu em 03/11/2026. */
describe('prospecção pelo número oficial', () => {
  const modelo = MODELOS.find((m) => m.name === MODELO_PROSPECCAO)!;
  const corpo = String(modelo.components.find((c) => c.type === 'BODY')!.text);

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

  it('o modelo é de marketing, com o vídeo no topo, as duas variáveis e os dois botões', () => {
    expect(modelo.category).toBe('MARKETING');
    const topo = modelo.components.find((c) => c.type === 'HEADER') as unknown as { format: string; example: { header_url: string[] } };
    expect(topo.format).toBe('VIDEO');
    expect(topo.example.header_url).toEqual([VIDEO_DO_MODELO]);
    expect(corpo.match(/\{\{\d\}\}/g)).toEqual(['{{1}}']);
    const botoes = (modelo.components.find((c) => c.type === 'BUTTONS') as unknown as { buttons: { type: string; text: string }[] }).buttons;
    expect(botoes.map((b) => b.text)).toEqual([BOTAO_TESTE, BOTAO_SAIR]);
    expect(botoes.every((b) => b.type === 'QUICK_REPLY' && b.text.length <= 25)).toBe(true);
    const rodape = modelo.components.find((c) => c.type === 'FOOTER');
    if (rodape) expect(String(rodape.text).length).toBeLessThanOrEqual(60);
  });

  it('a loja entra com o nome falado, no texto do dono', () => {
    expect(paramsDoModelo({ nome: 'TREDIESEL CAMINHÕES LTDA', dados: { tipo: 'Caminhões' } })).toEqual(['Trediesel Caminhões']);
    const texto = textoDoModelo(corpo, paramsDoModelo({ nome: 'Claudir Caminhões' }));
    expect(texto).toMatch(/^Aqui é ferramenta, meu amigo!/);
    expect(texto).toContain('foto, ficha e preço dos veículos da Claudir Caminhões pros seus clientes com um toque');
    expect(texto).toContain('Mercado Livre, Insta, Face e no site da loja');
    expect(texto).toContain('teste grátis. Bora!');
    expect(texto).not.toMatch(/\d+ dias/); // o prazo do teste ainda não foi definido
    expect(texto).not.toContain('amostra');
    expect(texto).not.toContain('{{');
  });

  it('os botões: "Não tenho interesse" é saída, "Quero testar grátis" vai para o Xavier', () => {
    expect(pediuParaSair(BOTAO_SAIR)).toBe(true);
    expect(pediuTeste(BOTAO_TESTE)).toBe(true);
    expect(pediuTeste('quero testar grátis!')).toBe(true);
    expect(pediuTeste('quero testar grátis, mas quanto custa depois?')).toBe(false);
    expect(pediuParaSair(BOTAO_TESTE)).toBe(false);
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
