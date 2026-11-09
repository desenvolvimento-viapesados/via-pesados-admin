import type { Etapa, Situacao } from '../../supabase/functions/_shared/assistente-regras';

/**
 * O funil da prospecção automática (dono, 09/11/2026): cada loja abordada pela
 * prospecção, na fase em que está. Ninguém arrasta card: a fase sai do que já
 * aconteceu (as mensagens, a conversa com o Davi, a Agenda e o card do funil
 * principal), então anda sozinha a cada novidade.
 */

/** O caminho, em ordem. Uma loja só anda para a frente. */
export const FASES = [
  { chave: 'abordada', rotulo: 'Abordadas', explica: 'Receberam as mensagens e ainda não responderam.' },
  { chave: 'conversando', rotulo: 'Em conversa', explica: 'Responderam. O Davi está fazendo as perguntas.' },
  { chave: 'qualificada', rotulo: 'Qualificadas', explica: 'Já se sabe a loja, o estoque e quem está falando.' },
  { chave: 'convite', rotulo: 'Convite feito', explica: 'O Davi ofereceu os horários da demonstração.' },
  { chave: 'reuniao', rotulo: 'Reunião marcada', explica: 'Na Agenda, com o link enviado.' },
  { chave: 'realizada', rotulo: 'Reunião feita', explica: 'Marcada como realizada na Agenda.' },
  { chave: 'teste', rotulo: 'Teste grátis', explica: 'Começou o teste.' },
  { chave: 'cliente', rotulo: 'Clientes', explica: 'Fechou.' },
] as const;

export type Fase = (typeof FASES)[number]['chave'];

/** Fora do caminho: o que espera alguém, quem não respondeu e quem não quer. */
export const LADOS = [
  { chave: 'com_voce', rotulo: 'Esperando você', explica: 'O Davi chamou você, ou alguém da equipe já está na conversa.' },
  { chave: 'sem_resposta', rotulo: 'Não responderam', explica: 'Receberam as mensagens e não responderam.' },
  { chave: 'perdida', rotulo: 'Perdidas', explica: 'Disseram que não querem, pediram para sair ou o card foi para perdido.' },
] as const;

export type Lado = (typeof LADOS)[number]['chave'];

const ORDEM: Record<Fase, number> = Object.fromEntries(FASES.map((f, i) => [f.chave, i])) as Record<Fase, number>;

export type StatusDaLoja =
  | 'nova' | 'pronta' | 'sem_whatsapp' | 'ja_conhecida' | 'em_contato' | 'sem_resposta'
  | 'conversando' | 'com_voce' | 'sem_interesse' | 'descartada';

/** O que entra no cálculo: a loja, a conversa com o Davi, a reunião e o card do funil principal. */
export type FatosDaLoja = {
  loja: {
    status: StatusDaLoja; nome?: string | null; respondeu_em?: string | null;
    primeiro_contato_em?: string | null; contatos?: number | null;
  };
  conversa?: {
    etapa?: Etapa | null;
    situacao?: Situacao | null;
    horarios_oferecidos?: unknown[] | null;
  } | null;
  /** A reunião que vale (a do Davi ou a marcada à mão na Agenda), escolhida por reuniaoQueVale. */
  reuniao?: { status: string; scheduled_at: string } | null;
  /** O card do funil principal: a etapa de hoje e a mais alta a que já chegou (prospect_events). */
  card?: { stage: string; maiorEtapa?: string | null } | null;
};

export type PosicaoNoFunil = {
  /** Até onde a loja chegou no caminho (null = não foi abordada pela prospecção). */
  fase: Fase | null;
  /** Fora do caminho, se for o caso: a coluna em que ela aparece é esta. */
  lado: Lado | null;
  /** A reunião marcada já passou e ninguém disse na Agenda como foi. */
  reuniaoPassou: boolean;
  /** A reunião foi cancelada e não há outra marcada. */
  reuniaoCancelada: boolean;
};

const temTexto = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/** As etapas do card do funil principal, em ordem ('perdido' fica de fora: é lado, não degrau). */
const ORDEM_DO_CARD: Record<string, number> = { contato: 0, amostra: 1, oportunidade: 2, reuniao: 3, teste: 4, vendido: 5 };

/** A etapa mais alta entre as que o card já teve (hoje e no histórico). */
export function maiorEtapaDoCard(etapas: (string | null | undefined)[]): string | null {
  let melhor: string | null = null;
  for (const e of etapas) {
    if (!e || !(e in ORDEM_DO_CARD)) continue;
    if (melhor === null || ORDEM_DO_CARD[e] > ORDEM_DO_CARD[melhor]) melhor = e;
  }
  return melhor;
}

/**
 * Das reuniões da loja (a do Davi e as marcadas à mão para o card), a que vale:
 * a de pé mais recente; senão a feita mais recente; senão a cancelada mais recente.
 */
export function reuniaoQueVale<T extends { status: string; scheduled_at: string }>(reunioes: T[]): T | null {
  const peso = (r: T) => (r.status === 'agendada' || r.status === 'remarcada' ? 3 : r.status === 'realizada' ? 2 : 1);
  return [...reunioes].sort((a, b) => peso(b) - peso(a) || b.scheduled_at.localeCompare(a.scheduled_at))[0] ?? null;
}

/** Loja, estoque e cargo: a qualificação curta do Davi (dono, 06/11). A loja da lista já vem com o nome. */
export function qualificacaoCompleta(f: FatosDaLoja): boolean {
  const s = f.conversa?.situacao ?? {};
  return (temTexto(s.loja) || temTexto(f.loja.nome)) && temTexto(s.estoque) && temTexto(s.cargo);
}

/** Onde a loja está no funil, só com o que já aconteceu. */
export function posicaoNoFunil(f: FatosDaLoja, agora = new Date()): PosicaoNoFunil {
  const c = f.conversa ?? null;
  const r = f.reuniao ?? null;
  const cardHoje = f.card?.stage ?? null;
  const cardMaior = ORDEM_DO_CARD[maiorEtapaDoCard([cardHoje, f.card?.maiorEtapa]) ?? ''] ?? -1;
  const reuniaoDePe = !!r && (r.status === 'agendada' || r.status === 'remarcada');
  const reuniaoPassou = reuniaoDePe && new Date(r!.scheduled_at).getTime() < agora.getTime();
  const reuniaoCancelada = r?.status === 'cancelada';

  let fase: Fase | null = null;
  const chegou = (x: Fase) => { if (fase === null || ORDEM[x] > ORDEM[fase]) fase = x; };

  /* Abordada é quem recebeu a prospecção (ou já conversa com o Davi por ela). Loja que
     escreveu por conta própria antes de receber nada não é resultado da prospecção. */
  const abordada = !!f.loja.primeiro_contato_em || (f.loja.contatos ?? 0) > 0 || !!c;
  if (!abordada) return { fase: null, lado: null, reuniaoPassou, reuniaoCancelada };
  chegou('abordada');
  if (f.loja.respondeu_em || ['conversando', 'com_voce'].includes(f.loja.status) || c) chegou('conversando');
  if (c && qualificacaoCompleta(f)) chegou('qualificada');
  if (c && ((c.horarios_oferecidos?.length ?? 0) > 0 || c.etapa === 'compromisso')) chegou('convite');
  /* A reunião vale pela Agenda: cancelada não conta. Sem linha na Agenda, vale o que o Davi
     ou o card dizem. */
  if (reuniaoDePe || r?.status === 'realizada') chegou('reuniao');
  if (!r && (c?.etapa === 'agendado' || c?.etapa === 'entregue' || cardMaior >= ORDEM_DO_CARD.reuniao)) chegou('reuniao');
  if (r?.status === 'realizada') chegou('realizada');
  if (cardMaior >= ORDEM_DO_CARD.teste) chegou('teste');
  if (cardMaior >= ORDEM_DO_CARD.vendido) chegou('cliente');

  const base = { fase, reuniaoPassou, reuniaoCancelada };
  /* Testando ou cliente hoje: vale isso, venha o que vier da conversa. */
  if (cardHoje === 'teste' || cardHoje === 'vendido') return { ...base, lado: null };
  /* O mais novo manda: voltou a escrever depois de recusar, ou o Davi chamou você (em qualquer fase). */
  if (f.loja.status === 'com_voce' || c?.etapa === 'com_xavier') return { ...base, lado: 'com_voce' };
  const perdeu = f.loja.status === 'sem_interesse' || c?.etapa === 'perdido' || c?.etapa === 'saiu' || cardHoje === 'perdido';
  /* Só uma reunião que ainda vai acontecer segura a loja fora de Perdidas. */
  const reuniaoPelaFrente = reuniaoDePe && !reuniaoPassou;
  if (perdeu && !reuniaoPelaFrente) return { ...base, lado: 'perdida' };
  if (f.loja.status === 'sem_resposta' && fase === 'abordada') return { ...base, lado: 'sem_resposta' };
  return { ...base, lado: null };
}

/** Quantas lojas chegaram pelo menos a cada fase (para a conta "de 100 abordadas, 8 responderam"). */
export function chegaramAte(posicoes: PosicaoNoFunil[]): Record<Fase, number> {
  const n = Object.fromEntries(FASES.map((f) => [f.chave, 0])) as Record<Fase, number>;
  for (const p of posicoes) {
    if (!p.fase) continue;
    for (const f of FASES) if (ORDEM[f.chave] <= ORDEM[p.fase]) n[f.chave]++;
  }
  return n;
}

/** "8%" de quem chegou à fase anterior; vazio quando não há base. */
export function taxa(parte: number, todo: number): string {
  if (!todo) return '';
  const p = (parte / todo) * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1).replace('.', ',')}%`;
}

/** O que o Davi descobriu, na ordem em que interessa ao dono, só o que tem resposta. */
export const O_QUE_SE_SABE: { chave: keyof Situacao; rotulo: string }[] = [
  { chave: 'loja', rotulo: 'Loja' },
  { chave: 'estoque', rotulo: 'Estoque' },
  { chave: 'cargo', rotulo: 'Quem fala' },
  { chave: 'quem_fala', rotulo: 'Nome' },
  { chave: 'cidade', rotulo: 'Cidade' },
  { chave: 'segmento', rotulo: 'Vende' },
  { chave: 'estrutura', rotulo: 'Pátio' },
  { chave: 'equipe', rotulo: 'Equipe' },
  { chave: 'canais', rotulo: 'Onde anuncia' },
  { chave: 'quem_anuncia', rotulo: 'Quem posta' },
  { chave: 'como_manda', rotulo: 'Como manda foto e ficha' },
  { chave: 'sistema_atual', rotulo: 'Sistema que usa' },
  { chave: 'o_que_quer_ver', rotulo: 'Quer ver' },
  { chave: 'motivo', rotulo: 'Por que agora' },
  { chave: 'prazo', rotulo: 'Prazo' },
  { chave: 'nao_e_o_momento', rotulo: 'Não é o momento' },
  { chave: 'epoca_boa', rotulo: 'Época boa' },
  { chave: 'recusou_reuniao', rotulo: 'Recusou a reunião' },
];

const SEGMENTO: Record<string, string> = {
  caminhoes: 'Caminhões', implementos: 'Implementos', maquinas: 'Máquinas', onibus: 'Ônibus', outro: 'Outro',
};

const PEDIDO: Record<string, string> = {
  fechar_ja: 'Quer fechar já', comprar: 'Quer comprar', ver: 'Quer ver funcionando', como_funciona: 'Perguntou como funciona',
};

export function respostas(s: Situacao | null | undefined): { rotulo: string; valor: string }[] {
  const x = (s ?? {}) as Record<string, unknown>;
  const extra: { rotulo: string; valor: string }[] = [];
  if (temTexto(x.pedido)) extra.push({ rotulo: 'Pedido', valor: PEDIDO[String(x.pedido)] ?? String(x.pedido) });
  else if (x.interesse === 'sim') extra.push({ rotulo: 'Pedido', valor: 'Quer ver funcionando' });
  return [...O_QUE_SE_SABE
    .filter((q) => temTexto(x[q.chave]))
    .map((q) => ({ rotulo: q.rotulo, valor: q.chave === 'segmento' ? (SEGMENTO[String(x[q.chave])] ?? String(x[q.chave])) : String(x[q.chave]).trim() })), ...extra];
}

/* O Davi grava a resposta ao pé da letra ("Hoje a gente tá com uns 35"): o card mostra o essencial. */

/** "Hoje a gente tá com uns 35" → "35 no estoque"; sem número, nada (a frase inteira fica na ficha). */
export function estoqueCurto(texto: unknown): string | null {
  const n = String(texto ?? '').match(/\d+/);
  return n ? `${n[0]} no estoque` : null;
}

const CARGOS: [RegExp, string][] = [
  [/\bs[oó]ci[oa]\b/i, 'Sócio'], [/\bdon[oa]\b|\bpropriet[aá]ri[oa]\b|\bpatr[aã]o\b/i, 'Dono'],
  [/\bgerente\b/i, 'Gerente'], [/\bvendedor(?:a)?\b|\bvendas\b/i, 'Vendedor'], [/\bredes\b|\bmarketing\b|\bsocial\b/i, 'Redes'],
];

/** "Sou dono" → "Dono"; o que não reconhece, nada. */
export function cargoCurto(texto: unknown): string | null {
  const t = String(texto ?? '');
  return CARGOS.find(([r]) => r.test(t))?.[1] ?? null;
}

/** O vendedor do anúncio: a correção à mão, ou o "vendedor: X" do contato do portal. */
export function vendedorDoAnuncio(dados: Record<string, unknown> | null | undefined): string | null {
  const d = dados ?? {};
  if (typeof d.vendedor_mensagem === 'string') return d.vendedor_mensagem.trim() || null;
  const m = String(d.contato ?? '').match(/vendedor[a]?\s*:\s*([^\n,;|()\-]+)/i);
  const nome = m?.[1]?.trim();
  return nome && !/^loja$/i.test(nome) ? nome : null;
}
