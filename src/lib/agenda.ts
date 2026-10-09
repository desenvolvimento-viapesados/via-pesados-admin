/* As contas da agenda (CRM › Reuniões): semana começando na segunda, grade
   do mês com 6 semanas, e onde cada reunião cai na grade de horas. Tudo em
   horário LOCAL — é o que a pessoa vê no relógio. */

export const HORA_INICIAL = 7;
export const HORA_FINAL = 21; // a grade vai até 21h
export const PX_POR_HORA = 56;

export const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Segunda-feira da semana de `d`. */
export function inicioDaSemana(d: Date): Date {
  const dia = inicioDoDia(d);
  const dow = (dia.getDay() + 6) % 7; // segunda = 0
  return somarDias(dia, -dow);
}

export const diasDaSemana = (d: Date) => Array.from({ length: 7 }, (_, i) => somarDias(inicioDaSemana(d), i));

/** As 42 casas do mês (6 semanas), começando na segunda antes do dia 1. */
export function gradeDoMes(d: Date): Date[] {
  const primeiro = new Date(d.getFullYear(), d.getMonth(), 1);
  const inicio = inicioDaSemana(primeiro);
  return Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
}

/** Topo e altura (px) de uma reunião na coluna do dia. */
export function posicaoNoDia(inicio: Date, duracaoMin: number) {
  const minutos = (inicio.getHours() - HORA_INICIAL) * 60 + inicio.getMinutes();
  const top = Math.max(0, (minutos / 60) * PX_POR_HORA);
  const fim = Math.min((HORA_FINAL - HORA_INICIAL) * 60, minutos + Math.max(15, duracaoMin));
  const altura = Math.max(22, ((fim - Math.max(0, minutos)) / 60) * PX_POR_HORA);
  return { top, altura };
}

/** O horário do ponto da coluna (px desde o topo), no começo da faixa de
    `passo` minutos onde ele cai — clicar em 10h20 marca 10h, como no Google. */
export function horarioDoClique(dia: Date, y: number, passo = 30): Date {
  const minutos = Math.max(0, Math.floor(((y / PX_POR_HORA) * 60) / passo) * passo);
  const d = inicioDoDia(dia);
  d.setHours(HORA_INICIAL, 0, 0, 0);
  d.setMinutes(Math.min(minutos, (HORA_FINAL - HORA_INICIAL) * 60 - passo));
  return d;
}

/**
 * Reuniões que se sobrepõem dividem a largura da coluna, como no Google
 * Agenda. Devolve, para cada id, a coluna e quantas colunas o grupo tem.
 */
export function colunasDeSobreposicao(itens: { id: string; inicio: number; fim: number }[]) {
  const ordenados = [...itens].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
  const resultado = new Map<string, { coluna: number; total: number }>();
  let grupo: typeof ordenados = [];
  let fimDoGrupo = -Infinity;
  const fecharGrupo = () => {
    const colunas: number[] = []; // fim da última reunião em cada coluna
    const desteGrupo: { id: string; coluna: number }[] = [];
    for (const it of grupo) {
      let c = colunas.findIndex((fim) => fim <= it.inicio);
      if (c === -1) { c = colunas.length; colunas.push(it.fim); } else colunas[c] = it.fim;
      desteGrupo.push({ id: it.id, coluna: c });
    }
    for (const x of desteGrupo) resultado.set(x.id, { coluna: x.coluna, total: colunas.length });
    grupo = [];
  };
  for (const it of ordenados) {
    if (it.inicio >= fimDoGrupo && grupo.length) fecharGrupo();
    grupo.push(it);
    fimDoGrupo = Math.max(grupo.length === 1 ? it.fim : fimDoGrupo, it.fim);
  }
  if (grupo.length) fecharGrupo();
  return resultado;
}

/** Valor para <input type="datetime-local"> no horário local. */
export function paraCampoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Próxima meia hora a partir de agora. */
export function proximaMeiaHora(agora: Date = new Date()): Date {
  const d = new Date(agora);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() >= 30 ? 60 : 30);
  return d;
}
