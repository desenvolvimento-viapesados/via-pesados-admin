/**
 * A régua da mensalidade, num lugar só.
 *
 * Regras dadas pelo dono em 09/10/2026, e que valem para todo cliente:
 *
 *  1. O ciclo conta da DATA DE IMPLANTAÇÃO, não do dia em que alguém
 *     gerou a cobrança. Implantou em 14/09: a licença vale até 14/10, a
 *     mensalidade seguinte cobre de 14/10 a 14/11, e assim por diante.
 *  2. A mensalidade é enviada alguns dias ANTES do vencimento — não quando
 *     o Asaas cria a fatura, que é 40 dias antes e confunde quem recebe.
 *  3. Corte no TERCEIRO dia (revisto pelo dono no mesmo 09/10): venceu dia
 *     14 → dia 15 um lembrete brando, dia 16 o aviso de risco, dia 17 sai
 *     TUDO do ar — painel e site. Nada é apagado. Pagou, volta na hora.
 *  4. Nenhuma mensagem automática sai fora das 08h às 20h (Brasília). A
 *     que cair fora espera a próxima abertura.
 *
 * Arquivo sem nada de Deno de propósito: os testes do painel (vitest)
 * importam daqui e conferem as contas.
 */

export const DIAS_ANTES_DA_MENSALIDADE = 5;
export const DIAS_DE_TOLERANCIA = 3;
export const JANELA_ABRE = 8;   // 08h00
export const JANELA_FECHA = 20; // até 19h59

/* O Brasil não tem horário de verão desde 2019: Brasília é UTC-3 o ano
   inteiro. Somar o deslocamento e ler com getUTC* evita depender do fuso
   da máquina que roda a função. */
const BRT_MS = -3 * 60 * 60 * 1000;
const emBRT = (d: Date) => new Date(d.getTime() + BRT_MS);
const p2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' de hoje em Brasília. */
export function hojeBRT(agora = new Date()): string {
  const b = emBRT(agora);
  return `${b.getUTCFullYear()}-${p2(b.getUTCMonth() + 1)}-${p2(b.getUTCDate())}`;
}

export function dentroDaJanela(agora = new Date()): boolean {
  const h = emBRT(agora).getUTCHours();
  return h >= JANELA_ABRE && h < JANELA_FECHA;
}

/** O próximo instante em que pode sair mensagem (agora, se já pode). */
export function proximaAbertura(agora = new Date()): Date {
  if (dentroDaJanela(agora)) return agora;
  const b = emBRT(agora);
  const dia = b.getUTCHours() >= JANELA_FECHA ? b.getUTCDate() + 1 : b.getUTCDate();
  // 08h em Brasília = 11h UTC
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), dia, JANELA_ABRE + 3, 0, 0));
}

/** Soma dias a uma data 'YYYY-MM-DD'. */
export function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const r = new Date(Date.UTC(a, m - 1, d + n));
  return r.toISOString().slice(0, 10);
}

/**
 * Soma meses mantendo o dia — e encostando no último dia quando o mês é
 * mais curto (implantou em 31/01, a próxima vence em 28/02, não em 03/03).
 */
export function somarMeses(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Onde cada mensalidade em aberto deveria vencer, contando da implantação.
 * Cada mensalidade paga cobriu um período; as em aberto, na ordem, cobrem
 * os seguintes. `proxima` é onde a assinatura deve gerar a próxima.
 */
export function vencimentosDoCiclo(implantadoEm: string, pagas: number, emAberto: number) {
  const vencimentos = Array.from({ length: emAberto }, (_, j) => somarMeses(implantadoEm, pagas + j));
  return { vencimentos, proxima: somarMeses(implantadoEm, pagas + emAberto) };
}

/** A mensalidade já pode ser enviada? (até N dias antes, e ainda não venceu) */
export const hojeEnviaMensalidade = (vencimento: string, hoje: string) =>
  vencimento >= hoje && vencimento <= somarDias(hoje, DIAS_ANTES_DA_MENSALIDADE);

/** Passou da tolerância? (venceu dia 14 → corta a partir do dia 17) */
export const passouDaTolerancia = (vencimento: string, hoje: string) =>
  hoje >= somarDias(vencimento, DIAS_DE_TOLERANCIA);
