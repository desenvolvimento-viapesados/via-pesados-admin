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

/** Segunda a sexta, em Brasília. */
export function diaUtil(agora = new Date()): boolean {
  const d = emBRT(agora).getUTCDay();
  return d >= 1 && d <= 5;
}

export function podeEnviarAgora(agora = new Date()): boolean {
  return diaUtil(agora) && dentroDaJanela(agora);
}

/** Dias de espera DEPOIS de cada contato: depois do 1º, 3 dias; do 2º, 5; do 3º, 3 até desistir. */
export const ESPERA_APOS_CONTATO = [3, 5, 3] as const;
export const MAX_CONTATOS = 3;

/**
 * Quando cai o próximo contato: N dias depois, num horário útil sorteado
 * (09h–17h), empurrado para segunda se cair no fim de semana. Horário igual
 * todo dia é assinatura de robô.
 */
export function proximoContato(contatoFeito: number, agora = new Date(), sorteio = Math.random): Date {
  const dias = ESPERA_APOS_CONTATO[Math.min(contatoFeito, MAX_CONTATOS) - 1] ?? 3;
  const b = emBRT(agora);
  const alvo = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + dias));
  while (alvo.getUTCDay() === 0 || alvo.getUTCDay() === 6) alvo.setUTCDate(alvo.getUTCDate() + 1);
  const minutos = 9 * 60 + Math.floor(sorteio() * 8 * 60); // 09h00–16h59 em Brasília
  return new Date(alvo.getTime() + minutos * 60_000 - BRT_MS);
}

/**
 * O teto do dia: começa em 15 e cresce 5 por semana ligado, sem passar do que
 * o dono definiu. Conta primeiras mensagens e lembretes; respostas do agente
 * a quem escreveu não contam (são conversa, não prospecção).
 */
export function limiteDoDia(limiteDefinido: number, ligadoDesde: Date | null, agora = new Date()): number {
  const semanas = ligadoDesde ? Math.max(0, Math.floor((agora.getTime() - ligadoDesde.getTime()) / (7 * 86_400_000))) : 0;
  return Math.max(1, Math.min(limiteDefinido, 15 + 5 * semanas));
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

/* ── a resposta da pessoa ─────────────────────────────────────── */

/* Valem em qualquer mensagem. */
const SAIR_SEMPRE = [
  /^\s*(sair|pare|parar|stop|remover|remova|chega)\s*[.!]*\s*$/i,
  /\b(me\s+tir[ae]|tir[ae]\s+(o\s+)?(meu|esse)\s+n[úu]mero|sair\s+da\s+lista|descadastr\w*|bloque(ar|io|ei|ando)|denunci\w*)/i,
  /\bpar[ae]\s+de\s+(mandar|enviar|me\s+(mandar|chamar|enviar))/i,
  /\b(n[aã]o|nem)\s+(tenho|temos|tem)\s+(nenhum\s+)?interesse/i,
  /\bsem\s+interesse\b/i,
  /\bn[aã]o\s+me\s+(mande|manda|chame|chama|procure|procura|ligue|liga)/i,
];
/* Só valem em resposta curta: "não quero" sozinho é recusa; "não quero perder
   tempo com planilha" é o contrário. */
const SAIR_SE_CURTA = [
  /\bn[aã]o\s+(quero|queremos|precisamos|preciso|obrigad[oa])\b/i,
  /^\s*(n[aã]o|nao)\s*[.!,]*\s*(obrigad[oa])?\s*[.!]*\s*$/i,
];

/**
 * A pessoa pediu para sair ou disse que não quer. Pega só o óbvio — o
 * resto quem decide é a leitura da conversa pela IA (prospeccao-responder).
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

/** Nome da loja como gente escreve: sem "LTDA", sem tudo em maiúsculas. */
export function nomeFalado(nome: string): string {
  let n = nome.replace(/\b(ltda|me|eireli|s\.?\/?a\.?|epp)\b\.?/gi, '').replace(/\s{2,}/g, ' ').trim();
  n = n.replace(/[-–|·]\s*$/, '').trim();
  if (n === n.toUpperCase() && /[A-Z]/.test(n)) {
    n = n.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  }
  return n || nome;
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
