/**
 * A matemática do OKR — e as três perguntas que ela responde.
 *
 *   quanto andou?      progresso, de 0 a 1, contado da PARTIDA até o alvo
 *   está no ritmo?     progresso comparado com o tempo que já passou
 *   onde vai parar?    projeção do valor no fim do ciclo
 *
 * A partida é o que a maioria das planilhas esquece: sair de 8 clientes
 * para 10 não é o mesmo trabalho que sair de 0 para 10, e progresso
 * medido sobre o alvo sozinho mostra 80% no primeiro dia.
 *
 * Nada aqui sabe de banco nem de tela: é número entrando e número
 * saindo, para que o painel e o teste vejam a mesma conta.
 */

export type Unidade = 'numero' | 'moeda' | 'percentual' | 'marco';
export type Direcao = 'subir' | 'descer';
export type Confianca = 'alta' | 'media' | 'baixa';

export type KR = {
  id: string;
  titulo: string;
  unidade: Unidade;
  partida: number;
  alvo: number;
  direcao: Direcao;
  /** O valor de agora: do sistema, quando a fonte é automática; do check-in, quando é manual. */
  atual: number | null;
};

export type Ciclo = { inicio: string; fim: string };

const limitar = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const dia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).getTime();

/**
 * Quanto do caminho foi andado, de 0 a 1.
 *
 * `null` quando ninguém mediu ainda — e `null` não é zero: zero é "mediu
 * e não saiu do lugar", que pede uma conversa diferente.
 */
export function progressoDoKr(kr: Pick<KR, 'partida' | 'alvo' | 'direcao' | 'atual' | 'unidade'>): number | null {
  if (kr.atual === null || kr.atual === undefined) return null;
  /* Marco é sim ou não: meio marco não existe. */
  if (kr.unidade === 'marco') return kr.atual >= kr.alvo ? 1 : 0;
  const caminho = kr.direcao === 'descer' ? kr.partida - kr.alvo : kr.alvo - kr.partida;
  if (caminho === 0) return kr.atual === kr.alvo ? 1 : 0;
  const andado = kr.direcao === 'descer' ? kr.partida - kr.atual : kr.atual - kr.partida;
  return limitar(andado / caminho);
}

/** Passou do alvo — merece aparecer, e não como "100%". */
export function superou(kr: Pick<KR, 'alvo' | 'direcao' | 'atual'>): boolean {
  if (kr.atual === null || kr.atual === undefined) return false;
  return kr.direcao === 'descer' ? kr.atual < kr.alvo : kr.atual > kr.alvo;
}

/** Quanto do ciclo já passou, de 0 a 1. */
export function fracaoDoTempo(ciclo: Ciclo, agora = Date.now()): number {
  const i = dia(ciclo.inicio);
  const f = dia(ciclo.fim);
  if (f <= i) return 1;
  return limitar((agora - i) / (f - i));
}

export type Saude = 'sem_medida' | 'adiantado' | 'no_ritmo' | 'atencao' | 'risco';

export const ROTULO_SAUDE: Record<Saude, { texto: string; tom: 'bom' | 'neutro' | 'atencao' | 'ruim' }> = {
  sem_medida: { texto: 'sem medida', tom: 'neutro' },
  adiantado: { texto: 'adiantado', tom: 'bom' },
  no_ritmo: { texto: 'no ritmo', tom: 'bom' },
  atencao: { texto: 'atrás do ritmo', tom: 'atencao' },
  risco: { texto: 'em risco', tom: 'ruim' },
};

/**
 * Comparar progresso com tempo é o que separa "80% feito" de "80% feito
 * faltando dois dias". Uma meta em 50% no meio do trimestre está no
 * ritmo; a mesma meta em 50% na última semana está em risco.
 */
export function saudeDoKr(progresso: number | null, tempo: number): Saude {
  if (progresso === null) return 'sem_medida';
  const folga = progresso - tempo;
  if (folga >= 0.1) return 'adiantado';
  if (folga >= -0.1) return 'no_ritmo';
  if (folga >= -0.25) return 'atencao';
  return 'risco';
}

/**
 * Onde o KR vai parar, mantido o ritmo até aqui.
 *
 * Projeção linear, e só isso: com 10% do ciclo andado ela erra feio, e
 * por isso devolve `null` antes de haver caminho medido o bastante.
 */
export function previsaoFinal(
  kr: Pick<KR, 'partida' | 'atual'>, tempo: number,
): number | null {
  if (kr.atual === null || kr.atual === undefined || tempo < 0.15) return null;
  return kr.partida + (kr.atual - kr.partida) / tempo;
}

/** O progresso do objetivo é a média dos KRs medidos. */
export function progressoDoObjetivo(krs: Pick<KR, 'partida' | 'alvo' | 'direcao' | 'atual' | 'unidade'>[]): number | null {
  const medidos = krs.map(progressoDoKr).filter((p): p is number => p !== null);
  if (!medidos.length) return null;
  return medidos.reduce((s, p) => s + p, 0) / medidos.length;
}

export type ResumoDoCiclo = {
  objetivos: number;
  krs: number;
  progresso: number | null;
  emRisco: number;
  semMedida: number;
};

export function resumoDoCiclo(
  objetivos: { krs: Pick<KR, 'partida' | 'alvo' | 'direcao' | 'atual' | 'unidade'>[] }[],
  tempo: number,
): ResumoDoCiclo {
  const krs = objetivos.flatMap((o) => o.krs);
  const progressos = krs.map(progressoDoKr);
  const medidos = progressos.filter((p): p is number => p !== null);
  return {
    objetivos: objetivos.length,
    krs: krs.length,
    progresso: medidos.length ? medidos.reduce((s, p) => s + p, 0) / medidos.length : null,
    emRisco: progressos.filter((p) => saudeDoKr(p, tempo) === 'risco').length,
    semMedida: progressos.filter((p) => p === null).length,
  };
}

/** Como o valor aparece na tela, no formato da unidade. */
export function formatarValor(valor: number | null | undefined, unidade: Unidade): string {
  if (valor === null || valor === undefined) return '—';
  if (unidade === 'moeda') {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  if (unidade === 'percentual') return `${Math.round(valor)}%`;
  if (unidade === 'marco') return valor >= 1 ? 'feito' : 'em aberto';
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/* ── Os ciclos ───────────────────────────────────────────────────────── */

/** "out/2026 → dez/2027", que é como se fala de um prazo que não é mês nem ano. */
export function rotuloDoPeriodo(inicio: string, fim: string): string {
  const curto = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
  };
  return `${curto(inicio)} → ${curto(fim)}`;
}

const DOIS = (n: number) => String(n).padStart(2, '0');

/** O trimestre, o ano e os cinco anos em que uma data cai. */
export function cicloDaData(tipo: 'mes' | 'trimestre' | 'ano' | 'cinco_anos', d = new Date()) {
  const ano = d.getFullYear();
  if (tipo === 'mes') {
    const m = d.getMonth();
    const fim = new Date(ano, m + 1, 0).getDate();
    return {
      tipo, rotulo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      inicio: `${ano}-${DOIS(m + 1)}-01`, fim: `${ano}-${DOIS(m + 1)}-${DOIS(fim)}`,
    };
  }
  if (tipo === 'trimestre') {
    const t = Math.floor(d.getMonth() / 3);
    const mi = t * 3;
    const fim = new Date(ano, mi + 3, 0).getDate();
    return {
      tipo, rotulo: `${ano} · T${t + 1}`,
      inicio: `${ano}-${DOIS(mi + 1)}-01`, fim: `${ano}-${DOIS(mi + 3)}-${DOIS(fim)}`,
    };
  }
  if (tipo === 'ano') {
    return { tipo, rotulo: String(ano), inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
  }
  /* Cinco anos corridos a partir do ano atual: o horizonte serve para
     dizer não, e um horizonte que encolhe a cada janeiro não diz nada. */
  return { tipo, rotulo: `${ano}–${ano + 4}`, inicio: `${ano}-01-01`, fim: `${ano + 4}-12-31` };
}
