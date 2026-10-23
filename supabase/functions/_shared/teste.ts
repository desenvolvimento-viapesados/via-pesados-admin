/**
 * O teste grátis, num lugar só — as datas, as mensagens e as tarefas.
 *
 * Regras do dono (16/10/2026; 60 dias desde 23/10/2026, o que a
 * apresentação comercial e os anúncios prometem):
 *  1. São 60 dias CONTADOS DA IMPLANTAÇÃO, não do dia em que a venda foi
 *     registrada. O sistema precisa estar montado para o teste valer: um
 *     teste que começa vazio termina com "não serviu".
 *  2. Implantou dia 16/10: o teste vai até 15/12 (`fim`, inclusive). No dia
 *     seguinte, 16/12, se não assinou, painel e site saem do ar — o mesmo
 *     corte da mensalidade, com nada apagado. Assinou, volta na hora.
 *  3. A contagem chega pelo WhatsApp e pelo vendedor; o sistema do lojista
 *     não ganha faixa nem bolinha de "faltam X dias".
 *  4. Quem assina durante o teste só paga quando ele acaba: a primeira
 *     mensalidade vence no dia do corte, e o ciclo conta dali — o mês
 *     grátis não pode virar mês cobrado.
 *
 * Arquivo sem nada de Deno de propósito: os testes do painel (vitest)
 * importam daqui, como fazem com regua.ts.
 */
import { somarDias } from './regua.ts';

export const DIAS_DE_TESTE = 60;

export type StatusDoTeste = 'aguardando_implantacao' | 'em_teste' | 'convertido' | 'encerrado' | 'cancelado';

export type DatasDoTeste = { inicio: string | null; fim: string | null };

/** Último dia com acesso. `extras` são os dias que a equipe deu a mais. */
export const fimDoTeste = (inicio: string, extras = 0) => somarDias(inicio, DIAS_DE_TESTE + extras);

/** O dia em que, sem assinatura, painel e site saem do ar. */
export const diaDoCorte = (fim: string) => somarDias(fim, 1);

const dias = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/** Dia N do teste — 1 no dia da implantação. */
export const diaDoTeste = (inicio: string, hoje: string) => dias(inicio, hoje) + 1;

/** Quantos dias de acesso ainda restam, contando hoje. 0 = acabou. */
export const diasRestantes = (fim: string, hoje: string) => Math.max(0, dias(hoje, fim) + 1);

/** O teste já passou do fim? (é o dia do corte ou depois) */
export const acabou = (fim: string, hoje: string) => hoje >= diaDoCorte(fim);

/**
 * Primeiro vencimento de quem assina vindo do teste: o dia do corte — ou
 * hoje + 3, a folga do boleto, se o teste já acabou. Quem assina antes da
 * implantação ainda não tem data: fica para depois do teste inteiro, e a
 * implantação realinha (ver ancoraDoCiclo).
 */
export function primeiroVencimento(teste: DatasDoTeste | null, hoje: string): string {
  const folga = somarDias(hoje, 3);
  if (!teste) return folga;
  const alvo = teste.fim ? diaDoCorte(teste.fim) : somarDias(hoje, DIAS_DE_TESTE + 1);
  return alvo > folga ? alvo : folga;
}

/**
 * De onde o ciclo da mensalidade conta. Sem teste, da implantação (regra
 * de 09/10). Com teste, do dia do corte: o primeiro mês foi grátis.
 */
export const ancoraDoCiclo = (implantadoEm: string, teste: DatasDoTeste | null) =>
  teste?.fim ? diaDoCorte(teste.fim) : implantadoEm;

/* ─── Mensagens ─────────────────────────────────────────────────── */

export type MensagemDoTeste = {
  template: 'teste_gratis_inicio' | 'teste_gratis_faltam_5_dias' | 'teste_gratis_termina_amanha';
  marco: 'comecou' | 'faltam_5' | 'termina_amanha';
  /** Até quando ainda faz sentido mandar (fim do dia, em Brasília). */
  ate: string;
};

/**
 * A mensagem de hoje, se houver. Uma por dia no máximo — a mais urgente
 * ganha. Cada uma tem uma janela curta para recuperar um dia perdido (rotina
 * que não rodou), sem nunca mandar "faltam 5 dias" quando falta um.
 */
export function mensagemDoDia(teste: { inicio: string; fim: string }, hoje: string): MensagemDoTeste | null {
  const { inicio, fim } = teste;
  if (hoje < inicio || hoje > fim) return null;
  const vespera = somarDias(fim, -1);
  if (hoje === vespera) return { template: 'teste_gratis_termina_amanha', marco: 'termina_amanha', ate: vespera };
  const cinco = somarDias(fim, -5);
  if (hoje >= cinco && hoje <= somarDias(fim, -3)) return { template: 'teste_gratis_faltam_5_dias', marco: 'faltam_5', ate: somarDias(fim, -3) };
  if (hoje <= somarDias(inicio, 2)) return { template: 'teste_gratis_inicio', marco: 'comecou', ate: somarDias(inicio, 2) };
  return null;
}

/** A reconquista: três dias depois do corte, uma vez. */
export const diaDaReconquista = (fim: string) => somarDias(diaDoCorte(fim), 3);

/* ─── Tarefas do vendedor ───────────────────────────────────────── */

export type TarefaDoTeste = { marco: string; dia: string; titulo: string; detalhe: string };

/**
 * O que o vendedor faz em cada ponto do teste. Cai na Agenda dele às 10h
 * do dia. Quem vende acompanha: o teste que ninguém acompanha não converte.
 */
export function tarefasDoTeste(inicio: string, fim: string): TarefaDoTeste[] {
  return [
    {
      marco: 'teste:primeiro_dia', dia: somarDias(inicio, 1), titulo: 'Teste grátis · primeiro dia',
      detalhe: 'Conferir se a loja entrou, se o WhatsApp está conectado e se o primeiro veículo já foi publicado. O que travou, resolver hoje.',
    },
    {
      marco: 'teste:primeira_semana', dia: somarDias(inicio, 7), titulo: 'Teste grátis · uma semana',
      detalhe: 'Ligar: já chegou cliente pelo WhatsApp? Quantos veículos estão anunciados? A equipe está usando? Anotar o que ouviu.',
    },
    {
      marco: 'teste:metade', dia: somarDias(inicio, Math.round(DIAS_DE_TESTE / 2)), titulo: 'Teste grátis · metade',
      detalhe: 'Marcar 20 minutos para mostrar o que já aconteceu: anúncios no ar, contatos que chegaram, vendas registradas. Perguntar o que falta para fechar.',
    },
    {
      marco: 'teste:faltam_5', dia: somarDias(fim, -5), titulo: 'Teste grátis · conversa de fechamento',
      detalhe: 'O aviso de 5 dias saiu hoje de manhã. Ligar, mostrar os números do teste e mandar o link para assinar. Quem assina agora só paga quando o teste acabar.',
    },
    {
      marco: 'teste:ultimo_dia', dia: somarDias(fim, -1), titulo: 'Teste grátis · véspera do fim',
      detalhe: 'Ainda não assinou: última ligação. Depois de amanhã de manhã, painel e site saem do ar.',
    },
  ];
}

/** A tarefa que nasce no corte, para entender o porquê. */
export const tarefaDoCorte = (fim: string): TarefaDoTeste => ({
  marco: 'teste:encerrado', dia: diaDoCorte(fim), titulo: 'Teste grátis · encerrado sem assinatura',
  detalhe: 'Painel e site saíram do ar hoje. Ligar para entender o motivo, registrar no teste e oferecer a assinatura — assinou, volta na hora.',
});

/** 10h em Brasília = 13h UTC. */
export const as10h = (dia: string) => `${dia}T13:00:00.000Z`;
