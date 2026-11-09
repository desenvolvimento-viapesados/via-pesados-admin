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
  loja: { status: StatusDaLoja; humano_assumiu?: boolean | null; respondeu_em?: string | null; nome?: string | null };
  conversa?: {
    etapa?: Etapa | null;
    situacao?: Situacao | null;
    horarios_oferecidos?: unknown[] | null;
    reuniao_id?: string | null;
  } | null;
  reuniao?: { status: string; scheduled_at: string } | null;
  card?: { stage: string } | null;
};

export type PosicaoNoFunil = {
  /** Até onde a loja chegou no caminho (null = ainda não foi abordada). */
  fase: Fase | null;
  /** Fora do caminho, se for o caso: a coluna em que ela aparece é esta. */
  lado: Lado | null;
  /** A reunião marcada já passou e ninguém disse na Agenda como foi. */
  reuniaoPassou: boolean;
};

const temTexto = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/** Loja, estoque e cargo: a qualificação curta do Davi (dono, 06/11). A loja da lista já vem com o nome. */
export function qualificacaoCompleta(f: FatosDaLoja): boolean {
  const s = f.conversa?.situacao ?? {};
  return (temTexto(s.loja) || temTexto(f.loja.nome)) && temTexto(s.estoque) && temTexto(s.cargo);
}

/** Onde a loja está no funil, só com o que já aconteceu. */
export function posicaoNoFunil(f: FatosDaLoja, agora = new Date()): PosicaoNoFunil {
  const c = f.conversa ?? null;
  const card = f.card?.stage ?? null;
  const r = f.reuniao ?? null;
  const reuniaoDePe = !!r && (r.status === 'agendada' || r.status === 'remarcada');

  let fase: Fase | null = null;
  const chegou = (x: Fase) => { if (fase === null || ORDEM[x] > ORDEM[fase]) fase = x; };

  const abordada = !['nova', 'pronta', 'sem_whatsapp', 'ja_conhecida', 'descartada'].includes(f.loja.status);
  if (abordada) chegou('abordada');
  if (f.loja.respondeu_em || ['conversando', 'com_voce'].includes(f.loja.status) || c) chegou('conversando');
  if (c && qualificacaoCompleta(f)) chegou('qualificada');
  if (c && ((c.horarios_oferecidos?.length ?? 0) > 0 || c.etapa === 'compromisso')) chegou('convite');
  if (reuniaoDePe || r?.status === 'realizada' || c?.etapa === 'agendado' || c?.etapa === 'entregue') chegou('reuniao');
  if (r?.status === 'realizada') chegou('realizada');
  if (card === 'teste') chegou('teste');
  if (card === 'vendido') chegou('cliente');

  const reuniaoPassou = reuniaoDePe && new Date(r!.scheduled_at).getTime() < agora.getTime();

  if (fase === null) return { fase, lado: null, reuniaoPassou };
  const atual = fase as Fase;
  /* Fechou ou está testando: vale isso, venha o que vier da conversa. */
  if (ORDEM[atual] >= ORDEM.teste) return { fase, lado: null, reuniaoPassou };

  const perdeu = f.loja.status === 'sem_interesse' || c?.etapa === 'perdido' || c?.etapa === 'saiu' || card === 'perdido';
  if (perdeu && !reuniaoDePe) return { fase, lado: 'perdida', reuniaoPassou };
  /* Com a reunião marcada, quem espera é a Agenda: a loja fica na coluna da reunião. */
  if (ORDEM[atual] < ORDEM.reuniao) {
    const comVoce = f.loja.status === 'com_voce' || c?.etapa === 'com_xavier' || !!f.loja.humano_assumiu;
    if (comVoce) return { fase, lado: 'com_voce', reuniaoPassou };
    if (f.loja.status === 'sem_resposta' && atual === 'abordada') return { fase, lado: 'sem_resposta', reuniaoPassou };
  }
  return { fase, lado: null, reuniaoPassou };
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
];

const SEGMENTO: Record<string, string> = {
  caminhoes: 'Caminhões', implementos: 'Implementos', maquinas: 'Máquinas', onibus: 'Ônibus', outro: 'Outro',
};

export function respostas(s: Situacao | null | undefined): { rotulo: string; valor: string }[] {
  const x = (s ?? {}) as Record<string, unknown>;
  return O_QUE_SE_SABE
    .filter((q) => temTexto(x[q.chave]))
    .map((q) => ({ rotulo: q.rotulo, valor: q.chave === 'segmento' ? (SEGMENTO[String(x[q.chave])] ?? String(x[q.chave])) : String(x[q.chave]).trim() }));
}
