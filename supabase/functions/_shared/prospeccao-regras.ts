/**
 * As regras do agente de prospecção, num lugar só.
 *
 * Decididas pelo dono em 27/10/2026:
 *
 *  1. Sai pelo WhatsApp de vendas dele (98814-4005). Foi avisado do risco:
 *     é o número de todos os anúncios. Por isso o resto daqui é conservador.
 *  2. Três contatos em ~10 dias: dia 0, dia 3 e dia 8. Respondeu qualquer
 *     coisa, para de insistir. Pediu para sair, não recebe mais nada.
 *  3. Só em dia útil, das 08h às 20h de Brasília (a mesma janela da régua).
 *  4. Teto por dia que cresce devagar: número que de repente fala com muita
 *     gente desconhecida é o que a Meta derruba.
 *
 * Arquivo sem nada de Deno de propósito: src/lib/prospeccao.test.ts confere.
 */
import { dentroDaJanela } from './regua.ts';

/* Brasília é UTC-3 o ano inteiro (sem horário de verão desde 2019). */
const BRT_MS = -3 * 60 * 60 * 1000;
const emBRT = (d: Date) => new Date(d.getTime() + BRT_MS);

/**
 * Feriados nacionais (11/11/2026: o dono disse "só em dia útil", e 20/11 cai numa sexta).
 * Os de data fixa por lei (o 20/11 é nacional desde a Lei 14.759/2023) e a Sexta-feira
 * Santa, que muda com a Páscoa. Carnaval e Corpus Christi são ponto facultativo: ficam de fora.
 */
const FERIADOS_FIXOS = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano), em UTC 00h. */
export function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** A data (ano, mês 0–11, dia) é feriado nacional? */
function feriadoNaData(ano: number, mes: number, dia: number): boolean {
  if (FERIADOS_FIXOS.has(`${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`)) return true;
  const sextaSanta = new Date(pascoa(ano).getTime() - 2 * 86_400_000);
  return sextaSanta.getUTCMonth() === mes && sextaSanta.getUTCDate() === dia;
}

/** Hoje é feriado nacional, em Brasília? */
export function feriadoNacional(agora = new Date()): boolean {
  const b = emBRT(agora);
  return feriadoNaData(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
}

/* `alvo` é uma data de Brasília guardada em UTC 00h (como em proximoContato). */
const diaDeTrabalho = (alvo: Date) =>
  alvo.getUTCDay() !== 0 && alvo.getUTCDay() !== 6 && !feriadoNaData(alvo.getUTCFullYear(), alvo.getUTCMonth(), alvo.getUTCDate());

/** Segunda a sexta, em Brasília, fora dos feriados nacionais. */
export function diaUtil(agora = new Date()): boolean {
  const d = emBRT(agora).getUTCDay();
  return d >= 1 && d <= 5 && !feriadoNacional(agora);
}

export function podeEnviarAgora(agora = new Date()): boolean {
  return diaUtil(agora) && dentroDaJanela(agora);
}

/** Dias de espera DEPOIS de cada contato: depois do 1º, 3 dias; do 2º, 5; do 3º, 3 até desistir. */
export const ESPERA_APOS_CONTATO = [3, 5, 3] as const;
export const MAX_CONTATOS = 3;

/**
 * Quando cai o próximo contato: N dias depois, num horário útil sorteado
 * (09h–17h), empurrado para o próximo dia útil se cair no fim de semana ou
 * num feriado nacional. Horário igual todo dia é assinatura de robô.
 */
export function proximoContato(contatoFeito: number, agora = new Date(), sorteio = Math.random): Date {
  const dias = ESPERA_APOS_CONTATO[Math.min(contatoFeito, MAX_CONTATOS) - 1] ?? 3;
  const b = emBRT(agora);
  const alvo = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + dias));
  while (!diaDeTrabalho(alvo)) alvo.setUTCDate(alvo.getUTCDate() + 1);
  const minutos = 9 * 60 + Math.floor(sorteio() * 8 * 60); // 09h00–16h59 em Brasília
  return new Date(alvo.getTime() + minutos * 60_000 - BRT_MS);
}

/* ── o canal ──────────────────────────────────────────────────── */

/**
 * O número oficial (API da Meta, pela YCloud) prospecta com regras próprias,
 * decididas pelo dono em 03/11/2026, sabendo que a lista do portal não deu
 * aceite para receber mensagem:
 *
 *  - UM contato por loja, pelo modelo aprovado. Insistir em quem não
 *    respondeu é o que mais gera bloqueio, e bloqueio no oficial cala junto
 *    a cobrança, o acesso e o "esqueci minha senha".
 *  - Começa em 120 por dia (dono, 12/11/2026: "está muito lento, a gente precisa abordar muitos
 *    clientes"; a fila inteira até o fim da oferta, 30/11) e sobe 10 por semana até o teto da tela.
 *    O número está no limite de 250 conversas iniciadas por dia na Meta: a tela vai até 200 para
 *    sobrar vaga para cobrança, senha e avisos.
 */
export type Canal = 'evolution' | 'oficial';

export const REGRAS_DO_CANAL: Record<Canal, { maxContatos: number; tetoInicial: number; passoSemanal: number }> = {
  evolution: { maxContatos: MAX_CONTATOS, tetoInicial: 15, passoSemanal: 5 },
  /* 23/11/2026: a cadência de 21 dias (CADENCIA, mais abaixo). O máximo é o número de passos que saem. */
  oficial: { maxContatos: 6, tetoInicial: 120, passoSemanal: 10 },
};

/** O número da YCloud é o oficial; o resto foi conectado pelo QR code. */
export const canalDa = (origem: string | null | undefined): Canal => (origem === 'ycloud' ? 'oficial' : 'evolution');

/**
 * O teto do dia: começa no inicial do canal e cresce por semana ligado, sem
 * passar do que o dono definiu. Conta primeiras mensagens e lembretes;
 * respostas do agente a quem escreveu não contam (são conversa, não prospecção).
 */
export function limiteDoDia(limiteDefinido: number, ligadoDesde: Date | null, agora = new Date(), canal: Canal = 'evolution'): number {
  const { tetoInicial, passoSemanal } = REGRAS_DO_CANAL[canal];
  const semanas = ligadoDesde ? Math.max(0, Math.floor((agora.getTime() - ligadoDesde.getTime()) / (7 * 86_400_000))) : 0;
  return Math.max(1, Math.min(limiteDefinido, tetoInicial + passoSemanal * semanas));
}

/** Minutos até o próximo envio, sorteados entre o mínimo e o máximo. */
export function intervaloSorteado(min: number, max: number, sorteio = Math.random): number {
  const a = Math.max(1, Math.min(min, max)), b = Math.max(a, max);
  return a + Math.floor(sorteio() * (b - a + 1));
}

/* ── telefone ─────────────────────────────────────────────────── */

/* Os DDDs que existem. 80 não é DDD: "0800 123 4567" virava um celular de mentira. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Só dígitos com 55. Devolve null para o que não é telefone brasileiro de pessoa (0800, 4004…). */
export function telefoneBR(bruto: string | null | undefined): string | null {
  let n = String(bruto ?? '').replace(/\D/g, '');
  if (!n || /^0?(300|500|800|900)/.test(n) || /^[34]00[0-9]/.test(n)) return null;
  if (n.startsWith('0')) n = n.replace(/^0+/, '');
  if (n.length === 10 || n.length === 11) n = '55' + n;
  if (!n.startsWith('55') || (n.length !== 12 && n.length !== 13)) return null;
  if (!DDDS.has(Number(n.slice(2, 4)))) return null;
  return n;
}

/** Celular: 9 dígitos começando com 9 depois do DDD. Fixo pode ter WhatsApp Business, mas é raro. */
export function ehCelular(tel: string): boolean {
  return tel.length === 13 && tel[4] === '9';
}

/**
 * As grafias do mesmo número. O WhatsApp conhece alguns celulares sem o 9
 * (12 dígitos) — e o CRM grava como o WhatsApp entrega. Para saber se já
 * conversamos com alguém, procura-se pelas duas.
 */
export function variantes(tel: string): string[] {
  if (tel.length === 13 && tel[4] === '9') return [tel, tel.slice(0, 4) + tel.slice(5)];
  if (tel.length === 12 && /[6-9]/.test(tel[4])) return [tel, tel.slice(0, 4) + '9' + tel.slice(4)];
  return [tel];
}

/**
 * Com que grafia gravar a conversa deste número, dadas as conversas que a caixa já tem
 * nas variantes dele. O WhatsApp devolve o celular como o conhece (de DDD 31 para cima,
 * em geral sem o 9) e a prospecção grava com o 9: sem isto, a resposta da loja abria
 * uma segunda conversa e o Davi atendia sem ver a mensagem que ela recebeu (11/11/2026).
 * Conversa na grafia exata manda; senão, a que já existe na outra grafia; senão, a que chegou.
 * Só número brasileiro: as variantes do 9 não existem fora daqui.
 */
export function grafiaDaConversa(tel: string, existentes: readonly string[]): string {
  if (!tel.startsWith('55') || existentes.includes(tel)) return tel;
  /* Celular com 9 seguido de 1 a 5 nunca existiu sem o 9: tirar o 9 daria o FIXO de outra
     pessoa (variantes não confere isso no sentido 13→12; o contrário já exige 6 a 9). */
  if (tel.length === 13 && !/[6-9]/.test(tel[5])) return tel;
  return variantes(tel).find((v) => v !== tel && existentes.includes(v)) ?? tel;
}

/* ── a resposta da pessoa ─────────────────────────────────────── */

/* Valem em qualquer mensagem. */
const SAIR_SEMPRE = [
  /^\s*(sair|pare|parar|stop|remover|remova|chega)\s*[.!]*\s*$/i,
  /* "me tira uma dúvida" e "deu bloqueio no Face" não são pedido de sair: só "me tira DA LISTA",
     "vou bloquear", "vou denunciar". */
  /\b(me\s+tir[ae]\s+(d[aeo]s?s[ae]\s+lista|da\s+lista|daqui|do\s+grupo)|tir[ae]\s+(o\s+)?(meu|esse)\s+n[úu]mero|sair\s+da\s+lista|descadastr\w*|vou\s+(te\s+)?bloque\w*|vou\s+(te\s+)?denunci\w*)/i,
  /\bpar[ae]\s+de\s+(mandar|enviar|me\s+(mandar|chamar|enviar))/i,
  /\b(n[aã]o|nem)\s+(tenho|temos|tem)\s+(nenhum\s+)?interesse/i,
  /\bsem\s+interesse\b/i,
  /\bn[aã]o\s+me\s+(mande|manda|chame|chama|procure|procura|ligue|liga)/i,
];
/* Só valem quando são a mensagem inteira: "não quero" sozinho é recusa; "não quero
   perder tempo com planilha" é o contrário, e "não preciso, já tenho site" é objeção. */
const SAIR_SE_CURTA = [
  /^\s*n[aã]o\s+(quero|queremos|precisamos|preciso)(\s+n[aã]o)?(,?\s*obrigad[oa])?\s*[.!]*\s*$/i,
  /^\s*n[aã]o\s*[.!,]*\s*(obrigad[oa])?\s*[.!]*\s*$/i,
];

/**
 * A pessoa pediu para sair ou disse que não quer. Pega só o óbvio — o
 * resto quem decide é a leitura da conversa pela IA (assistente-responder).
 */
export function pediuParaSair(texto: string | null | undefined): boolean {
  const t = String(texto ?? '').trim();
  if (!t) return false;
  if (SAIR_SEMPRE.some((r) => r.test(t))) return true;
  const palavras = t.split(/\s+/).filter(Boolean).length;
  return palavras <= 6 && SAIR_SE_CURTA.some((r) => r.test(t));
}

/* ── o texto ──────────────────────────────────────────────────── */

export type LojaParaTexto = { nome: string; cidade?: string | null };

/* ── o nome da loja como gente fala ───────────────────────────── */

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Parâmetro de modelo do jeito que a Meta aceita: sem quebra de linha, sem tab e sem
 * 4 espaços seguidos (é recusa, não texto torto), e com tamanho de nome — 60 caracteres,
 * cortados no fim de uma palavra. Devolve '' quando não sobra nada.
 */
export function paramDaMeta(texto: string | null | undefined, max = 60): string {
  let t = String(texto ?? '').replace(/[\r\n\t\v\f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\d]/u.test(t)) return '';
  if (t.length > max) {
    const corte = t.slice(0, max + 1).lastIndexOf(' ');
    t = (corte > 0 ? t.slice(0, corte) : t.slice(0, max)).trim();
    t = t.replace(/(\s+(e|de|da|do|das|dos|em|com|&|\+))+$/i, '').replace(/[\s,;:\-–—|/·&+]+$/, '').trim();
  }
  return t;
}

/* Razão social no fim do nome: "Ltda", "ME", "EPP", "Eireli", "S/A", "S.A.". */
const RAZAO_SOCIAL = /[\s,.\-–]+(ltda|me|epp|eireli|s\.?\/?a)\.?\s*$/i;
/* " - ", " – ", " | ", " / ": depois disso vem marca, cidade, UF, "Matriz" ou descrição. */
const SEPARADOR = /\s+[-–—|/·]\s+/;
const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);
/* Palavras de marca de fábrica (sem acento, minúsculas). Trecho só de marca não é o nome da loja. */
const MARCAS = new Set(['volvo', 'scania', 'daf', 'mb', 'mercedes', 'benz', 'mercedes-benz', 'vw', 'volks', 'volkswagen', 'iveco',
  'ford', 'foton', 'agrale', 'randon', 'librelato', 'guerra', 'facchini', 'noma', 'pastre', 'rodotecnica', 'truckvan', 'stara',
  'jacto', 'john', 'deere', 'massey', 'ferguson', 'valtra', 'new', 'holland', 'case', 'landini', 'mahindra', 'kuhn', 'ls',
  'tractor', 'fendt', 'horsch', 'budny', 'agritech']);
/* Palavras que sozinhas não fazem nome ("Seminovos", "Caminhões e Máquinas"). */
const GENERICAS = new Set(['caminhao', 'caminhoes', 'carreta', 'carretas', 'maquina', 'maquinas', 'trator', 'tratores', 'implemento',
  'implementos', 'veiculo', 'veiculos', 'seminovo', 'seminovos', 'semi', 'novos', 'usado', 'usados', 'pesado', 'pesados', 'agro',
  'agricola', 'agricolas', 'rodoviario', 'rodoviarios', 'grupo', 'loja', 'revenda', 'comercio', 'comercial', 'matriz', 'filial',
  'multimarcas', 'truck', 'trucks', 'onibus', 'pecas', 'servicos', 'equipamentos', 'utilitarios', 'e', 'de', 'da', 'do', 'das',
  'dos', '&']);
/* Ligam palavras: no meio do nome vão em minúscula ("Compra e Venda de Máquinas"). */
const CONECTIVOS = new Set(['e', 'de', 'da', 'do', 'das', 'dos', 'em', 'com']);
/* Palavras curtas que, num nome todo em maiúsculas, são palavra e não sigla. */
const CURTAS_COMUNS = new Set(['auto', 'agro', 'rodo', 'sul', 'rio', 'bom', 'boa', 'top', 'mais', 'novo', 'nova', 'max', 'real',
  'rei', 'sao', 'luz', 'sol', 'mar', 'via', 'casa', 'loja', 'cia', 'ouro', 'mato', 'vale', 'alto', 'boi']);
/* Palavras do setor que aparecem sem acento ("Caminhoes", "Maquinas Agricolas"). */
const ACENTOS: Record<string, string> = {
  caminhao: 'caminhão', caminhoes: 'caminhões', maquina: 'máquina', maquinas: 'máquinas', veiculo: 'veículo', veiculos: 'veículos',
  comercio: 'comércio', agricola: 'agrícola', agricolas: 'agrícolas', peca: 'peça', pecas: 'peças', onibus: 'ônibus',
  rodoviario: 'rodoviário', rodoviarios: 'rodoviários', rodoviaria: 'rodoviária', rodoviarias: 'rodoviárias',
  automovel: 'automóvel', automoveis: 'automóveis', servico: 'serviço', servicos: 'serviços', utilitario: 'utilitário',
  utilitarios: 'utilitários', negocios: 'negócios',
  agronegocio: 'agronegócio', agronegocios: 'agronegócios', solucao: 'solução', solucoes: 'soluções',
  concessionaria: 'concessionária', agropecuaria: 'agropecuária', industria: 'indústria', locacao: 'locação', locacoes: 'locações',
  representacao: 'representação', representacoes: 'representações', consignacao: 'consignação', patio: 'pátio', agua: 'água',
  mecanica: 'mecânica', hidraulica: 'hidráulica', logistica: 'logística', agromaquinas: 'agromáquinas',
};

const letrasDe = (t: string) => t.replace(/[^\p{L}]/gu, '');
const chave = (t: string) => semAcento(t).toLowerCase().replace(/[^a-z0-9&-]/g, '');
const tituloDe = (t: string) => t.toLowerCase().replace(/(^|[-.'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/** Por que o trecho não serve sozinho como nome: curto, só marca ou só palavra genérica. */
function fraqueza(trecho: string): 'curto' | 'marca' | 'generico' | null {
  const palavras = trecho.split(/\s+/).filter((p) => chave(p));
  if (letrasDe(trecho).length + (trecho.match(/\d/g)?.length ?? 0) < 2 || !palavras.length) return 'curto';
  if (palavras.every((p) => MARCAS.has(chave(p)))) return 'marca';
  /* UF só quando é a sigla pura ("GO"); "M.A." é nome. */
  if (palavras.every((p) => GENERICAS.has(chave(p)) || UFS.has(p))) return 'generico';
  return null;
}

/** Fica com o nome: o primeiro trecho, a não ser que ele sozinho não seja nome. */
function escolherTrecho(trechos: string[]): string {
  const [primeiro, ...resto] = trechos;
  const f = fraqueza(primeiro);
  if (!f || !resto.length) return primeiro;
  const forte = resto.find((t) => !fraqueza(t));
  if (!forte) return primeiro;
  /* "Volks / Confia" → "Confia"; "Seminovos - Tracbel" → "Seminovos Tracbel". */
  return f === 'generico' ? `${primeiro} ${forte}` : forte;
}

/** Maiúsculas, conectivos e acentos, palavra por palavra. */
function ajustarPalavras(nome: string): string {
  const tudoMaiusculo = !/\p{Ll}/u.test(nome);
  const tudoMinusculo = !/\p{Lu}/u.test(nome);
  return nome.split(' ').map((p, i) => {
    const letras = letrasDe(p);
    const k = chave(p);
    let r = p;
    if (letras && !/\d/.test(p)) {
      if (i > 0 && CONECTIVOS.has(k)) return k;
      const maiuscula = letras === letras.toUpperCase();
      /* Palavra inteira em maiúsculas com 5+ letras é grito; até 4 é sigla (BC, JDM, TSG). Num nome
         todo em maiúsculas, 3 ou 4 letras com vogal se lê como palavra ("JOSÉ", "SAO"), e o
         conectivo do começo também ("DO BRASIL"). */
      const palavraCurta = tudoMaiusculo && letras.length >= 3 && letras.length <= 4 && /[aeiouáéíóúâêôãõ]/i.test(letras);
      if ((maiuscula && letras.length >= 5) || (tudoMaiusculo && (CURTAS_COMUNS.has(k) || CONECTIVOS.has(k) || palavraCurta))
        || tudoMinusculo) r = tituloDe(p);
    }
    /* Acento por pedaço ("micro-onibus"), mantendo a maiúscula do começo. */
    return r.split('-').map((parte) => {
      const certo = ACENTOS[chave(parte)];
      if (!certo) return parte;
      const so = letrasDe(parte);
      if (so.length > 1 && so === so.toUpperCase()) return parte.replace(/\p{L}+/u, certo.toUpperCase());
      return parte.replace(/\p{L}+/u, /^\p{Lu}/u.test(so) ? certo[0].toUpperCase() + certo.slice(1) : certo);
    }).join('-');
  }).join(' ');
}

/**
 * Nome da loja como gente fala, para "foto, ficha e preço dos veículos da {{1}}":
 *  - fica o primeiro trecho antes de " - ", " – ", " | " ou " / " ("Garra Caminhões - Goiânia",
 *    "SM Tratores - Massey - Matriz"); se ele sozinho não é nome (só marca, só palavra genérica,
 *    uma letra), entra o próximo trecho que é;
 *  - sem razão social (Ltda, ME, EPP, Eireli, S/A), sem parênteses, sem ®;
 *  - palavra inteira em maiúsculas com 5+ letras vira Primeira Maiúscula ("ZEROBALA" → "Zerobala");
 *    até 4 é sigla e fica ("BC", "JDM", "NG", "4R");
 *  - acento nas palavras do setor ("Caminhoes" → "Caminhões"), "e/de/da/do" em minúscula no meio;
 *  - UF solta no fim sai ("Marcelo Caminhões MG"), "Matriz"/"Filial" no fim também;
 *  - por fim, a higiene da Meta (paramDaMeta). Nunca devolve vazio.
 */
export function nomeFalado(nome: string): string {
  const bruto = String(nome ?? '').replace(/[®™©]/g, '').replace(/\s*\([^)]*\)?\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const trechos = bruto.split(SEPARADOR)
    .map((t) => {
      let x = t.trim();
      for (let i = 0; i < 3 && RAZAO_SOCIAL.test(` ${x}`); i++) x = ` ${x}`.replace(RAZAO_SOCIAL, '').trim();
      return x.replace(/^[\s\-–—|/·,;:&+]+|[\s\-–—|/·,;:&+]+$/g, '').trim();
    })
    .filter((t) => letrasDe(t) || /\d/.test(t));
  let n = trechos.length ? escolherTrecho(trechos) : '';
  n = ajustarPalavras(n);
  let palavras = n.split(' ').filter(Boolean);
  while (palavras.length > 2 && (UFS.has(palavras[palavras.length - 1]) || /^(matriz|filial)$/i.test(palavras[palavras.length - 1]))) {
    palavras = palavras.slice(0, -1);
  }
  n = palavras.join(' ').replace(/\s+,/g, ',');
  return paramDaMeta(n) || 'sua loja';
}

/**
 * Textos de reserva, para quando a escrita pela IA falhar. Três jeitos de
 * dizer cada contato: o mesmo texto para centenas de números é o padrão que
 * o WhatsApp reconhece como disparo em massa.
 */
export function textoDeReserva(loja: LojaParaTexto, contato: number, sorteio = Math.random): string {
  const nome = nomeFalado(loja.nome);
  const em = loja.cidade ? ` aí em ${loja.cidade}` : '';
  const opcoes: string[][] = [
    [
      `Oi, tudo bem? Aqui é o Xavier, da Via Pesados. Vi a ${nome}${em} e queria te mostrar uma coisa: a gente faz um sistema só para loja de caminhão e carreta, que anuncia o estoque no Mercado Livre, Instagram e Facebook num clique e já vem com o site da loja. Posso te mostrar em 15 minutos como ficaria com os caminhões de vocês?`,
      `Boa tarde! Xavier aqui, da Via Pesados. Encontrei a ${nome}${em}. Trabalho com um sistema feito para lojas de pesados: o caminhão é cadastrado uma vez e vai para o site da loja, Mercado Livre, Instagram e Facebook. Faz sentido eu te mostrar rapidinho?`,
      `Olá, tudo certo? Sou o Xavier, da Via Pesados. Vi o trabalho da ${nome}${em}. A gente ajuda loja de caminhão a anunciar o estoque inteiro em todos os canais num clique, com site próprio incluso. Posso te mandar uma amostra de como ficaria a de vocês?`,
    ],
    [
      `Oi! Passando de novo rapidinho: consigo montar uma amostra do site da ${nome} com os caminhões de vocês, sem compromisso. Quer que eu monte? Se não fizer sentido agora, é só me falar que não te chamo mais.`,
      `Voltando aqui: se quiser, eu monto uma amostra da ${nome} no sistema, com os seus caminhões, para você ver funcionando. Topa? E se não for o momento, me avisa que eu paro por aqui.`,
      `Oi, tudo bem? Só para não deixar passar: dá para eu montar uma amostra do site e dos anúncios da ${nome}, sem custo. Te interessa? Se não, é só dizer que eu não insisto.`,
    ],
    [
      `Última mensagem por aqui para não te incomodar. Se em algum momento quiser ver o sistema rodando com os caminhões da ${nome}, é só me chamar. Abraço!`,
      `Vou parar de te chamar por aqui. Quando quiser ver como ficaria a ${nome} no sistema, é só responder esta mensagem. Abraço e boas vendas!`,
      `Não vou mais insistir. Fica o meu contato: quando fizer sentido ver a ${nome} no sistema, me chama aqui. Grande abraço!`,
    ],
  ];
  const lista = opcoes[Math.min(Math.max(contato, 1), 3) - 1];
  return lista[Math.floor(sorteio() * lista.length) % lista.length];
}

/* ── o que a busca acha e não serve ───────────────────────────── */

const FORA = /\b(pe[çc]as?|autope[çc]as|borracharia|oficina|mec[aâ]nica|transportadora|transportes?|guincho|pneus?|lava ?(jato|car)|posto|despachante|seguro|financeira|retifica|ret[íi]fica|diesel servi|el[ée]trica|funilaria|lanternagem|auto ?escola|loca[çc][ãa]o|locadora)\b/i;
const DENTRO = /\b(caminh[õo]es?|carretas?|seminovos?|pesados?|ve[íi]culos|implementos?|m[áa]quinas|trucks?|revenda|multimarcas)\b/i;

/** Oficina, peças, transportadora: o Google devolve junto, mas não é loja de pesados. */
export function pareceLojaDePesados(nome: string): boolean {
  if (DENTRO.test(nome)) return true;
  return !FORA.test(nome);
}

/** As buscas por cidade: o jeito como o dono de loja se cadastra no Google. */
export const BUSCAS = [
  'loja de caminhões',
  'revenda de caminhões seminovos',
  'revenda de carretas',
  'caminhões usados',
];

/* ── os modelos do número oficial ─────────────────────────────── */

/**
 * Pelo número oficial a primeira mensagem só pode ser modelo aprovado pela Meta (texto livre
 * só depois que a pessoa responde). Dono, 10/11/2026 (até 17/11, quando o filme entrou: MODELO_UNICO): UMA mensagem só — o vídeo dele (que já
 * mostra o envio, diz o que é o Via Pesados, fala da Black Friday e pede para responder), a
 * frase "Já imaginou atender seus clientes com essa facilidade?…", o fecho e os botões. Com
 * "Fala, <nome>!" quando o número é de um vendedor com nome no portal. Os textos moram em
 * modelos.ts.
 */
export const MODELO_SIMPLES = 'prospeccao_simples';
export const MODELO_SIMPLES_NOME = 'prospeccao_simples_nome';
/**
 * Dono, 17/11/2026: o filme de produto da Via Pesados no topo, "O único sistema do Brasil feito
 * para lojas de veículos pesados…" e os botões "Quero conhecer" / "Não tenho interesse". O mesmo
 * modelo para loja nova e para quem não respondeu (remarketing). Sem variável: sem "Fala, <nome>!".
 * As duas do vídeo do Xavier (prospeccao_simples*) ficam de reserva.
 */
export const MODELO_UNICO = 'prospeccao_unico';
/**
 * Dono, 18/11/2026: o mesmo filme com a marca no masculino ("com o Via Pesados"). Desde 23/11/2026 é
 * a primeira mensagem da prospecção; o prospeccao_unico (feminino) fica de reserva.
 */
export const MODELO_FILME = 'prospeccao_filme';
/** Todos precisam estar aprovados para a prospecção sair (o filme e a cadência inteira). */
export const MODELOS_DA_PROSPECCAO = [
  MODELO_FILME, 'cadencia_canais', 'cadencia_vendeu', 'cadencia_atendimento', 'cadencia_definicao', 'cadencia_encerramento',
  'cadencia_retomada',
] as const;
/**
 * As três mensagens de antes (06/11/2026): seguem aprovadas na Meta e no catálogo, de reserva,
 * e não saem mais. Conversa antiga pode ter começado por elas (o "Bora!" do convite).
 */
export const MODELO_ABERTURA = 'prospeccao_abertura';
export const MODELO_ABERTURA_NOME = 'prospeccao_abertura_nome';
export const MODELO_OFERTA = 'prospeccao_oferta';
export const MODELO_CTA = 'prospeccao_cta';
export const MODELOS_DE_RESERVA = [MODELO_ABERTURA, MODELO_ABERTURA_NOME, MODELO_OFERTA, MODELO_CTA] as const;
/** Como cada modelo aparece para o dono (no aviso de por que a prospecção não sai). */
export const NOME_DA_MENSAGEM: Record<string, string> = {
  [MODELO_UNICO]: 'a do filme da Via Pesados',
  [MODELO_FILME]: 'a do filme do Via Pesados',
  cadencia_canais: 'a do dia 4 (canais)', cadencia_vendeu: 'a do dia 10 (vendeu, sai de todos)',
  cadencia_atendimento: 'a do dia 13 (foto, ficha e preço)', cadencia_definicao: 'a do dia 19 (será que é a hora?)',
  cadencia_encerramento: 'a do dia 21 (vou parar de chamar)', cadencia_retomada: 'a da retomada',
  [MODELO_SIMPLES]: 'a do vídeo', [MODELO_SIMPLES_NOME]: 'a do vídeo com o nome do vendedor',
};
export const STATUS_NA_META: Record<string, string> = {
  PENDING: 'em análise', REJECTED: 'reprovada', PAUSED: 'pausada pela Meta', DISABLED: 'desativada pela Meta', APPROVED: 'aprovada',
};
/** Segundos entre uma mensagem e a próxima: dá tempo de a anterior chegar primeiro. */
export const PAUSA_ENTRE_MENSAGENS_MS = 4_000;
/** O botão do convite das três mensagens de antes: conversa antiga pode ter. */
export const BOTAO_BORA = 'Bora!';
export const BOTAO_SAIR = 'Não tenho interesse';
/** O botão da mensagem do vídeo do Xavier (10/11/2026). Tocou (ou escreveu só isso), é pedido de ver. */
export const BOTAO_VER = 'Quero ver funcionando';
/** O botão da mensagem do filme (17/11/2026): também é pedido de ver. */
export const BOTAO_CONHECER = 'Quero conhecer';
/** O botão do meio da cadencia_definicao (19/11/2026): não é recusa nem interesse; a retomada fica marcada. */
export const BOTAO_OUTRO_MOMENTO = 'Outro momento';
/* O vídeo do cabeçalho: o filme de produto da Via Pesados (v5 de 16/11/2026, 38,8 s, H.264 Main
   sem B-frames, que o Android toca). Arquivo novo = nome novo (v4, v5…): a Meta e o WhatsApp
   guardam em cache pelo endereço. O rótulo é o que a caixa do CRM e o Davi leem no lugar do
   vídeo, e o roteiro do Davi (assistente-roteiro.ts, "Lead da lista que recebeu a mensagem")
   diz o que o vídeo fala: troque os três juntos. O filme não fala de oferta nem de data. */
export const VIDEO_DO_MODELO = 'https://ktjvyysqhsyvjmhumjly.supabase.co/storage/v1/object/public/logos/wa/prospeccao-v3.mp4';
export const ROTULO_DO_VIDEO = '[vídeo da Via Pesados: cadastra uma vez e publica em todos os canais]';

export type LojaDoModelo = { nome: string; dados?: Record<string, unknown> | null };

/**
 * O nome da loja na oferta das três mensagens de antes ("E a boa parte é que a {{1}} foi
 * selecionada…"), hoje de reserva.
 * `dados.nome_mensagem` é a correção à mão para uma loja: quando existe, vale ela.
 */
export function nomeDaLojaNaMensagem(loja: LojaDoModelo): string {
  const manual = paramDaMeta(typeof loja.dados?.nome_mensagem === 'string' ? loja.dados.nome_mensagem : '');
  return manual || nomeFalado(loja.nome);
}

/* Rótulos que o portal põe no lugar do nome do vendedor. */
const NAO_E_NOME = new Set(['vendas', 'venda', 'vendedor', 'vendedora', 'comercial', 'financeiro', 'financiamento', 'financiamentos',
  'loja', 'atendimento', 'gerente', 'escritorio', 'pecas', 'sac', 'consultor', 'consultora', 'setor', 'dep', 'departamento',
  'administrativo', 'administracao', 'contato', 'whatsapp', 'fone', 'telefone', 'oficina', 'compras', 'seminovos']);
/* Primeiro nome que quase sempre vem com o segundo ("João Paulo", "Luiz Fernando"). */
const PRIMEIRO_DE_COMPOSTO = new Set(['joao', 'jose', 'ana', 'maria', 'luiz', 'luis', 'marco', 'pedro', 'paulo', 'julio', 'carlos',
  'antonio', 'jean', 'joao']);
const SEGUNDO_DE_COMPOSTO = new Set(['paulo', 'pedro', 'carlos', 'fernando', 'vitor', 'victor', 'aurelio', 'antonio', 'cesar',
  'claudia', 'paula', 'maria', 'luiz', 'luis', 'henrique', 'eduardo', 'roberto', 'ricardo', 'marcos', 'gabriel', 'felipe',
  'augusto', 'renato', 'lucas', 'miguel', 'rafael', 'clara', 'julia', 'beatriz', 'cristina', 'lucia', 'jose', 'reinaldo']);

/**
 * O primeiro nome de quem atende, quando o número é de um vendedor com nome no portal
 * (dados.contato = "vendedor: Marcelo Cristo") — vai no "Fala, {{1}}!". Nome composto comum
 * fica inteiro ("João Paulo"). Dois nomes no mesmo número ("Junior ou Amarildo"), rótulo
 * ("Vendas"), inicial ("Jr.") ou coisa que não é nome: null, e sai a abertura sem nome.
 * `dados.vendedor_mensagem` é a correção à mão: vale ela ('' = sem nome).
 */
export function primeiroNomeDoVendedor(dados: Record<string, unknown> | null | undefined): string | null {
  /* Correção à mão por loja: o nome certo, ou '' para sair a abertura sem nome. */
  if (typeof dados?.vendedor_mensagem === 'string') return paramDaMeta(dados.vendedor_mensagem, 30) || null;
  const contato = typeof dados?.contato === 'string' ? dados.contato : '';
  const m = /^vendedor:\s*(.+)$/i.exec(contato.trim());
  if (!m) return null;
  const limpo = m[1].replace(/\([^)]*\)?/g, ' ').split(/\s+[-–—|/·]\s+|,/)[0].replace(/\s+/g, ' ').trim();
  if (/\s(ou|e|&)\s/i.test(` ${limpo} `.replace(/^\s+/, ' '))) return null;
  const palavras = limpo.split(' ').filter(Boolean);
  const nome = (p: string | undefined) => !!p && /^\p{L}{2,15}$/u.test(p) && !NAO_E_NOME.has(chave(p));
  if (!nome(palavras[0])) return null;
  const composto = PRIMEIRO_DE_COMPOSTO.has(chave(palavras[0])) && nome(palavras[1]) && SEGUNDO_DE_COMPOSTO.has(chave(palavras[1]));
  return (composto ? palavras.slice(0, 2) : palavras.slice(0, 1)).map(tituloDe).join(' ');
}

export type MensagemDaSequencia = { modelo: string; params: string[]; video: boolean; botoes: boolean };

/**
 * O que sai para uma loja, na ordem (10/11/2026: uma mensagem só, o vídeo com a frase, o fecho
 * e os botões; com o nome do vendedor quando o portal tem).
 */
export function sequenciaDaProspeccao(_loja: LojaDoModelo): MensagemDaSequencia[] {
  /* 17/11/2026: o filme, a mesma mensagem para toda loja (sem o nome do vendedor). 23/11: no masculino. */
  return [{ modelo: MODELO_FILME, params: [], video: true, botoes: true }];
}

/* ── a cadência (playbook de 18/11/2026, ligada em 23/11/2026) ─────────────

   Quem recebeu o filme e não respondeu recebe uma mensagem a cada ~3 dias até o dia 21; quem
   respondeu sai da cadência (status conversando) e é com o Davi. As ligações dos dias 2, 11 e 20
   são do dono (Ligações do dia). Depois do dia 21 sem resposta, uma retomada 90 dias depois;
   "Outro momento", 60 dias depois (o Davi marca a data em proximo_contato_em).

   Os passos de vídeo próprio (vendas, dia 7; relatórios, dia 16) ficam de fora até os vídeos
   existirem: ponha o endereço em VIDEO_DA_CADENCIA e eles voltam sozinhos, sem aprovação nova. */

export type PassoDaCadencia = { modelo: string; dia: number; params: 'tipo' | 'loja' | 'loja_tipo' | null; video: boolean };

export const CADENCIA: PassoDaCadencia[] = [
  { modelo: MODELO_FILME, dia: 1, params: null, video: true },
  { modelo: 'cadencia_canais', dia: 4, params: 'loja_tipo', video: false },
  { modelo: 'cadencia_vendas', dia: 7, params: 'tipo', video: true },
  { modelo: 'cadencia_vendeu', dia: 10, params: 'tipo', video: false },
  { modelo: 'cadencia_atendimento', dia: 13, params: 'tipo', video: false },
  { modelo: 'cadencia_relatorios', dia: 16, params: 'tipo', video: true },
  { modelo: 'cadencia_definicao', dia: 19, params: 'loja', video: false },
  { modelo: 'cadencia_encerramento', dia: 21, params: 'loja', video: false },
];
export const MODELO_RETOMADA = 'cadencia_retomada';
/** Dias até a retomada de quem chegou ao fim da cadência sem responder. */
export const RETOMADA_SEM_RESPOSTA_DIAS = 90;

/**
 * O vídeo de cada passo com vídeo próprio. null = o vídeo ainda não foi gravado e o passo não sai.
 * O filme do primeiro passo é o VIDEO_DO_MODELO.
 */
export const VIDEO_DA_CADENCIA: Record<string, string | null> = {
  cadencia_vendas: null,
  cadencia_relatorios: null,
};

/** Os passos que saem hoje, na ordem (sem os de vídeo que ainda não existe). */
export function passosDaCadencia(): PassoDaCadencia[] {
  return CADENCIA.filter((p) => !(p.modelo in VIDEO_DA_CADENCIA) || !!VIDEO_DA_CADENCIA[p.modelo]);
}

/** O vídeo que vai no cabeçalho de um modelo da prospecção (null = sem vídeo). */
export function videoDoPasso(modelo: string): string | null {
  if (modelo in VIDEO_DA_CADENCIA) return VIDEO_DA_CADENCIA[modelo];
  return CADENCIA.find((p) => p.modelo === modelo)?.video ? VIDEO_DO_MODELO : null;
}

/**
 * O veículo da loja no singular e no masculino, para os modelos ("o mesmo {{2}}", "quando um {{1}}
 * é vendido", "do {{1}}"). Máquinas vira "equipamento": "um máquina" não dá.
 */
export function veiculoDaLoja(loja: LojaDoModelo): string {
  const t = semAcento(String(loja.dados?.tipo ?? '')).toLowerCase();
  if (/maquin|trator/.test(t)) return 'equipamento';
  if (/implement|carreta/.test(t)) return 'implemento';
  if (/onibus/.test(t)) return 'ônibus';
  return 'caminhão';
}

/**
 * A próxima mensagem para uma loja da prospecção que ainda não respondeu, ou null se não há.
 *   - `contatos` = quantas mensagens da cadência já saíram (o filme é a 1ª);
 *   - quem respondeu e adiou ("Outro momento") ou terminou a cadência recebe a retomada;
 *   - a retomada sai uma vez só (depois dela proximo_contato_em fica vazio).
 */
export function proximaMensagemDaCadencia(
  loja: LojaDoModelo & { contatos?: number | null; respondeu_em?: string | null },
): MensagemDaSequencia & { retomada: boolean } {
  const passos = passosDaCadencia();
  const feitos = loja.contatos ?? 0;
  const params = (p: PassoDaCadencia['params']) => {
    const nome = nomeDaLojaNaMensagem(loja), tipo = veiculoDaLoja(loja);
    return p === 'loja_tipo' ? [nome, tipo] : p === 'loja' ? [nome] : p === 'tipo' ? [tipo] : [];
  };
  if (loja.respondeu_em || feitos >= passos.length) {
    return { modelo: MODELO_RETOMADA, params: params('loja'), video: false, botoes: true, retomada: true };
  }
  const p = passos[Math.max(0, feitos)];
  return { modelo: p.modelo, params: params(p.params), video: p.video, botoes: true, retomada: false };
}

/**
 * Quando sai a próxima depois de mandar o passo `feitos` (1 = o filme): a distância entre os dias
 * do playbook, num horário útil sorteado (como proximoContato). Depois do último, a data da
 * retomada (90 dias). Depois da retomada, null: acabou.
 */
export function proximaDataDaCadencia(feitos: number, agora = new Date(), retomada = false, sorteio = Math.random): Date | null {
  if (retomada) return null;
  const passos = passosDaCadencia();
  const dias = feitos >= passos.length ? RETOMADA_SEM_RESPOSTA_DIAS : passos[feitos].dia - passos[Math.max(0, feitos - 1)].dia;
  const b = emBRT(agora);
  const alvo = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + dias));
  while (!diaDeTrabalho(alvo)) alvo.setUTCDate(alvo.getUTCDate() + 1);
  const minutos = 9 * 60 + Math.floor(sorteio() * 8 * 60);
  return new Date(alvo.getTime() + minutos * 60_000 - BRT_MS);
}

/** O texto do modelo com as variáveis no lugar: é o que aparece na caixa do CRM. */
export function textoDoModelo(corpo: string, params: string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '');
}

const comoBotao = (t: string | null | undefined) =>
  semAcento(String(t ?? '')).toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '').trim();

/**
 * A pessoa escreveu só "Quero conhecer" ou "Quero ver funcionando" (com ou sem ponto ou
 * exclamação, sem ligar para maiúsculas e acentos): é pedido de ver. Frase maior não conta:
 * aí quem lê é a IA.
 */
export function pediuParaVer(texto: string | null | undefined): boolean {
  const t = comoBotao(texto);
  return t === comoBotao(BOTAO_VER) || t === comoBotao(BOTAO_CONHECER);
}

/** A pessoa tocou (ou escreveu só) "Outro momento": adiar, nem recusa nem interesse. */
export function pediuOutroMomento(texto: string | null | undefined): boolean {
  return comoBotao(texto) === comoBotao(BOTAO_OUTRO_MOMENTO);
}

/* ── qual mensagem automática a loja está respondendo ─────────── */

/**
 * Os modelos que a loja pode estar respondendo (dono, 19/11/2026: o pós-resposta). Na conversa
 * gravada o modelo aparece com as variáveis já preenchidas e, se tem vídeo, com o rótulo do vídeo
 * na frente; por isso cada um se reconhece pela frase que só ele tem, perto do começo do corpo.
 * O filme no masculino (prospeccao_filme) é o mesmo filme do prospeccao_unico: trate igual.
 */
export type ModeloRespondido =
  | 'prospeccao_unico' | 'prospeccao_filme' | 'prospeccao_simples'
  | 'cadencia_canais' | 'cadencia_vendas' | 'cadencia_vendeu' | 'cadencia_atendimento'
  | 'cadencia_relatorios' | 'cadencia_definicao' | 'cadencia_encerramento' | 'cadencia_retomada';

/* Sobre o texto sem acento, minúsculo e com espaços únicos. A ordem importa: canais e retomada
   começam iguais ("oi! aqui e o davi, do via pesados."). */
const ABERTURAS: [ModeloRespondido, RegExp][] = [
  ['prospeccao_filme', /^o unico sistema do brasil feito para lojas de veiculos pesados\b[\s\S]{0,80}\bcom o via pesados\b/],
  ['prospeccao_unico', /^o unico sistema do brasil feito para lojas de veiculos pesados\b/],
  ['prospeccao_simples', /^(?:fala, [^!]{1,40}! )?ja imaginou atender seus clientes com essa facilidade\b/],
  ['cadencia_canais', /^oi! aqui e o davi, do via pesados\. uma pergunta rapida sobre\b/],
  ['cadencia_retomada', /^oi! aqui e o davi, do via pesados\. faz um tempo que te mandei o video\b/],
  ['cadencia_vendas', /^anunciar e metade\. a venda acontece no atendimento\b/],
  ['cadencia_vendeu', /^quando um .{1,40} e vendido ai na loja, quem tira o anuncio\b/],
  ['cadencia_atendimento', /^e no whatsapp: quando o cliente pede foto, ficha e preco\b/],
  ['cadencia_relatorios', /^voce sabe qual .{1,40} mais vendeu na loja este ano\b/],
  ['cadencia_definicao', /^toda loja que cresce chega numa hora\b/],
  ['cadencia_encerramento', /^vou parar de te chamar por aqui pra nao insistir\b/],
];

/** Qual modelo é este texto de mensagem (o que a caixa grava), ou null. */
export function modeloDaMensagem(texto: string | null | undefined): ModeloRespondido | null {
  const corpo = semAcento(String(texto ?? '')).toLowerCase()
    .replace(/^\s*(?:\[[^\]\n]*\]\s*)+/, '') // o rótulo do vídeo na frente
    .replace(/\s+/g, ' ').trim();
  if (!corpo) return null;
  for (const [modelo, r] of ABERTURAS) if (r.test(corpo)) return modelo;
  return null;
}

/** O filme (feminino ou masculino) e o vídeo antigo do Xavier se respondem do mesmo jeito. */
export const ehOFilme = (m: ModeloRespondido | null | undefined): boolean => m === 'prospeccao_unico' || m === 'prospeccao_filme';

/**
 * O último modelo da prospecção que saiu na conversa (as mensagens em ordem): é a ele que o lead
 * está respondendo. Só olha saídas; o recado e as respostas do Davi não casam com nenhum modelo.
 */
export function ultimoModeloRespondido(msgs: { direcao: string; conteudo?: string | null }[]): ModeloRespondido | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].direcao !== 'saida') continue;
    const m = modeloDaMensagem(msgs[i].conteudo);
    if (m) return m;
  }
  return null;
}

/* ── o que a Meta diz sobre o número ──────────────────────────── */

/**
 * Falhas de entrega que dizem "o número está em risco": desligam a
 * prospecção na hora. 131048 é a Meta avisando que muita gente bloqueou ou
 * marcou como spam; 131031, conta travada; 368, punição por política.
 */
export const FALHAS_QUE_DESLIGAM = new Set(['131048', '131031', '368']);
/* O número não tem WhatsApp ou não recebe de empresa: a loja sai da fila. */
export const FALHAS_SEM_WHATSAPP = new Set(['131026']);

/**
 * O envio falhou por causa da conta, não do número da loja (o saldo acabou,
 * a chave foi recusada): a loja continua na fila e a prospecção para na hora,
 * sem queimar outras lojas tentando. Devolve o motivo na língua do dono.
 */
export function falhaDaConta(erro: string): string | null {
  if (/balance is insufficient|insufficient balance|saldo insuficiente/i.test(erro)) {
    return 'Acabou o saldo da conta do número oficial. Recarregue e ligue de novo: as lojas continuam na fila.';
  }
  if (/\bunauthori[sz]ed\b|invalid api key|api key is invalid/i.test(erro)) {
    return 'A conta do número oficial recusou a chave de acesso. Nada saiu; as lojas continuam na fila.';
  }
  return null;
}

/** A loja depois de uma entrega que falhou. */
export function lojaDepoisDaFalha(codigo: string): { status: 'sem_whatsapp' | 'sem_resposta'; motivo: string } {
  if (FALHAS_SEM_WHATSAPP.has(codigo)) return { status: 'sem_whatsapp', motivo: 'O número não tem WhatsApp ou não recebe mensagem de empresa.' };
  if (codigo === '131049') return { status: 'sem_resposta', motivo: 'A Meta segurou a entrega: a pessoa já recebeu muitas mensagens de empresas nos últimos dias.' };
  return { status: 'sem_resposta', motivo: `A mensagem não foi entregue${codigo ? ` (código ${codigo} da Meta)` : ''}.` };
}

/**
 * A qualidade do número oficial impede prospectar? Amarelo já para: com
 * mais bloqueios a Meta restringe o número, e é ele que manda cobrança,
 * acesso e senha. Sem leitura (vazio ou UNKNOWN) não para — número com
 * pouco uso costuma vir assim.
 */
export function motivoParaDesligar(qualidade: string | null | undefined, status?: string | null): string | null {
  const q = String(qualidade ?? '').toUpperCase();
  const fim = 'Desliguei a prospecção para proteger o número que manda cobrança, acesso e senha.';
  if (q === 'RED') return `A qualidade do número oficial está baixa (vermelho) na Meta. ${fim}`;
  if (q === 'YELLOW') return `A qualidade do número oficial caiu para média (amarelo) na Meta. ${fim}`;
  const s = String(status ?? '').toUpperCase();
  if (s && s !== 'CONNECTED') return `O número oficial não está conectado na Meta (status ${s}). ${fim}`;
  return null;
}
