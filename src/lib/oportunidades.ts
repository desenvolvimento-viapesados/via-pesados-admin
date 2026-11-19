import { reuniaoQueVale, type PosicaoNoFunil } from './funilDaProspeccao';

/**
 * As oportunidades de venda, num lugar só (dono, 18/11/2026: "bato o olho e não consigo
 * compreender; as sessões não se conectam").
 *
 * Antes havia dois quadros para as mesmas lojas: o funil dos cards e o funil da prospecção
 * automática, cada um com etapas de nome diferente. Aqui toda oportunidade, venha da mensagem
 * de prospecção, da ligação, do formulário do site ou de indicação, cai nas mesmas seis etapas
 * e ganha UM próximo passo, dito em português. A etapa nunca é gravada: sai do que já
 * aconteceu (a conversa, a Agenda, o card), então anda sozinha.
 *
 * Puro, para testar sem banco.
 */

export const ETAPAS = [
  { chave: 'novo', rotulo: 'Novos', explica: 'Pediram contato. Ninguém falou com eles ainda.' },
  { chave: 'conversa', rotulo: 'Em conversa', explica: 'Responderam. A conversa está andando.' },
  { chave: 'reuniao', rotulo: 'Reunião marcada', explica: 'Demonstração com dia e hora.' },
  { chave: 'decisao', rotulo: 'Reunião feita', explica: 'Viram o sistema. Falta decidir.' },
  { chave: 'teste', rotulo: 'Teste grátis', explica: 'Estão usando o sistema.' },
  { chave: 'cliente', rotulo: 'Clientes', explica: 'Fecharam.' },
] as const;

export type EtapaDaVenda = (typeof ETAPAS)[number]['chave'];

const ORDEM: Record<EtapaDaVenda, number> =
  Object.fromEntries(ETAPAS.map((e, i) => [e.chave, i])) as Record<EtapaDaVenda, number>;

export const rotuloDaEtapa = (e: EtapaDaVenda) => ETAPAS.find((x) => x.chave === e)!.rotulo;

/** O que a oportunidade pede. 'agora' é com você e não pode esperar. */
export type Tom = 'agora' | 'atencao' | 'calmo';

export type TipoDePasso =
  | 'chamar' | 'responder' | 'registrar_reuniao' | 'reuniao_hoje' | 'reuniao' | 'remarcar'
  | 'decisao' | 'retomar' | 'davi' | 'aguardar' | 'teste' | 'cliente' | 'perdida';

export type Passo = { tipo: TipoDePasso; texto: string; tom: Tom };

export type ReuniaoDaOportunidade = {
  id: string; scheduled_at: string; status: string; meet_link?: string | null; outcome?: string | null;
  prospect_id?: string | null;
};

export type Oportunidade = {
  /** `loja:<id>` ou `card:<id>`. */
  id: string;
  nome: string;
  /** "Uberlândia/MG", ou vazio. */
  lugar: string;
  /** Só dígitos, com DDD (e 55 quando veio assim). */
  telefone: string | null;
  /** De onde veio, em uma palavra: Prospecção, Ligação, Site, Indicação. */
  origem: string;
  etapa: EtapaDaVenda;
  perdida: boolean;
  cardId: string | null;
  lojaId: string | null;
  conversaId: string | null;
  reuniao: ReuniaoDaOportunidade | null;
  /** Mensagens que chegaram e ninguém leu. */
  naoLidas: number;
  /** O fim da conversa, para mostrar sem abrir. */
  ultimaMensagem: string | null;
  /** Está esperando VOCÊ (o Davi chamou, ou é lead novo, ou escreveu e ninguém leu). */
  esperandoVoce: boolean;
  /** Por que espera você, quando se sabe. */
  motivo: string | null;
  /** O Davi está na conversa. */
  comODavi: boolean;
  /** O que já se sabe, em etiquetas curtas ("35 no estoque", "Dono"). */
  sabe: string[];
  /** Respostas do formulário ou anotações do card. */
  notas: string | null;
  /** A última novidade. */
  mexeuEm: string;
  entrouEm: string;
  passo: Passo;
};

/* ── datas faladas ───────────────────────────────────────────────── */

const FUSO = 'America/Sao_Paulo';
const diaEmBrasilia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: FUSO });

/** Quantos dias de calendário (Brasília) de `de` até `ate`. Hoje = 0, ontem = 1. */
export function diasEntre(de: Date | string, ate: Date = new Date()): number {
  const a = new Date(`${diaEmBrasilia(new Date(de))}T00:00:00Z`).getTime();
  const b = new Date(`${diaEmBrasilia(ate)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "15h" ou "15h30". */
export function horaFalada(d: Date | string): string {
  const [h, m] = new Date(d).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** "hoje", "amanhã", "ontem" ou "qui, 13/11". */
export function diaFalado(d: Date | string, agora: Date = new Date()): string {
  const n = diasEntre(d, agora);
  if (n === 0) return 'hoje';
  if (n === -1) return 'amanhã';
  if (n === 1) return 'ontem';
  const data = new Date(d);
  const semana = data.toLocaleDateString('pt-BR', { timeZone: FUSO, weekday: 'short' }).replace('.', '');
  const dia = data.toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
  return `${semana}, ${dia}`;
}

/** "há 5 min", "há 3 h", "ontem", "há 4 dias". */
export function haQuanto(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.max(1, diasEntre(iso, agora));
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

/* ── telefone ────────────────────────────────────────────────────── */

/** DDD + os 8 últimos dígitos: o mesmo número com ou sem 55 e com ou sem o nono dígito. */
export function chaveDoTelefone(t: string | null | undefined): string | null {
  let d = String(t ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}

/** Os dígitos com 55 na frente, para o `tel:` e o `wa.me`. */
export function telefoneCompleto(t: string | null | undefined): string | null {
  const d = String(t ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.length >= 12 && d.startsWith('55') ? d : `55${d}`;
}

/** `5533988144005` → `(33) 98814-4005`. */
export function telefoneFalado(t: string | null | undefined): string {
  const c = telefoneCompleto(t);
  if (!c) return String(t ?? '');
  const n = c.slice(2);
  return `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}`;
}

/* ── a etapa ─────────────────────────────────────────────────────── */

const reuniaoDePe = (r?: { status: string } | null) => !!r && (r.status === 'agendada' || r.status === 'remarcada');

/** A reunião de pé já passou da hora (com uma folga para a própria chamada). */
export function reuniaoPassou(r: { status: string; scheduled_at: string } | null | undefined, agora: Date = new Date()): boolean {
  return reuniaoDePe(r) && new Date(r!.scheduled_at).getTime() + 20 * 60_000 < agora.getTime();
}

/** Marcou e não veio: é o que a tela grava em `outcome` quando ele não aparece. */
export const NAO_APARECEU = 'Não apareceu';
const naoApareceu = (r?: { status: string; outcome?: string | null } | null) =>
  !!r && r.status === 'cancelada' && (r.outcome ?? '').startsWith(NAO_APARECEU);

/**
 * A etapa de uma loja da prospecção, a partir da posição que o funil dela já calcula.
 * `null` = ainda não é oportunidade (recebeu a mensagem e não respondeu).
 */
export function etapaDaLoja(p: PosicaoNoFunil, temCard: boolean): EtapaDaVenda | null {
  if (!p.fase) return temCard ? 'conversa' : null;
  if (p.lado === 'sem_resposta' && !temCard) return null;
  switch (p.fase) {
    case 'cliente': return 'cliente';
    case 'teste': return 'teste';
    case 'realizada': return 'decisao';
    case 'reuniao': return 'reuniao';
    case 'abordada': return p.lado === 'com_voce' || p.lado === 'perdida' || temCard ? 'conversa' : null;
    default: return 'conversa';
  }
}

export type FatosDoCard = {
  stage: string;
  reunioes: ReuniaoDaOportunidade[];
  /** Existe conversa do WhatsApp ligada ao card. */
  temConversa: boolean;
  /** Alguém já registrou um contato (tentativa que ninguém atendeu não conta). */
  temContato: boolean;
};

/** A etapa de um card que não veio da prospecção (formulário do site, indicação, cadastro à mão). */
export function etapaDoCard(f: FatosDoCard): { etapa: EtapaDaVenda; perdida: boolean; reuniao: ReuniaoDaOportunidade | null } {
  const r = reuniaoQueVale(f.reunioes);
  if (f.stage === 'vendido') return { etapa: 'cliente', perdida: false, reuniao: r };
  if (f.stage === 'teste') return { etapa: 'teste', perdida: false, reuniao: r };
  let etapa: EtapaDaVenda = 'conversa';
  if (r?.status === 'realizada') etapa = 'decisao';
  else if (reuniaoDePe(r)) etapa = 'reuniao';
  else if (f.stage === 'contato' && !f.temConversa && !f.temContato && !r) etapa = 'novo';
  return { etapa, perdida: f.stage === 'perdido', reuniao: r };
}

/* ── o próximo passo ─────────────────────────────────────────────── */

export type FatosDoPasso = {
  etapa: EtapaDaVenda;
  perdida: boolean;
  reuniao: ReuniaoDaOportunidade | null;
  naoLidas: number;
  esperandoVoce: boolean;
  motivo?: string | null;
  comODavi: boolean;
  /** O lead pediu para falar depois. */
  pausa?: boolean;
  /** Veio do formulário do site. */
  doSite?: boolean;
  /** Tentativas de contato que ninguém atendeu. */
  tentativas?: number;
  mexeuEm: string;
};

/** Depois de quantos dias sem novidade uma conversa pede que alguém chame de novo. */
export const DIAS_PARADA = 2;

export function proximoPasso(f: FatosDoPasso, agora: Date = new Date()): Passo {
  if (f.perdida) return { tipo: 'perdida', texto: f.motivo?.trim() || 'Perdida', tom: 'calmo' };
  if (f.etapa === 'cliente') return { tipo: 'cliente', texto: 'Cliente', tom: 'calmo' };
  if (f.etapa === 'teste') return { tipo: 'teste', texto: 'Em teste grátis', tom: 'calmo' };

  const r = f.reuniao;
  if (reuniaoPassou(r, agora)) {
    return { tipo: 'registrar_reuniao', texto: `A reunião de ${diaFalado(r!.scheduled_at, agora)} passou: conte como foi`, tom: 'agora' };
  }
  if (f.naoLidas > 0) return { tipo: 'responder', texto: 'Escreveu e espera resposta', tom: 'agora' };
  if (f.etapa === 'reuniao' && reuniaoDePe(r)) {
    const hoje = diasEntre(r!.scheduled_at, agora) === 0;
    return hoje
      ? { tipo: 'reuniao_hoje', texto: `Reunião hoje às ${horaFalada(r!.scheduled_at)}`, tom: 'agora' }
      : { tipo: 'reuniao', texto: `Reunião ${diaFalado(r!.scheduled_at, agora)} às ${horaFalada(r!.scheduled_at)}`, tom: 'calmo' };
  }
  if (f.esperandoVoce && f.etapa !== 'novo') {
    return { tipo: 'responder', texto: f.motivo?.trim() || 'Está esperando você', tom: 'agora' };
  }
  if (f.etapa === 'novo') {
    const t = f.tentativas ?? 0;
    if (t > 0) return { tipo: 'chamar', texto: `Você tentou ${t === 1 ? 'uma vez' : `${t} vezes`} e não atendeu: tente de novo`, tom: 'agora' };
    return { tipo: 'chamar', texto: f.doSite ? 'Pediu contato pelo site: chame agora' : 'Ninguém falou com ela ainda: faça o primeiro contato', tom: 'agora' };
  }
  if (f.etapa === 'decisao') {
    const dias = r ? Math.max(0, diasEntre(r.scheduled_at, agora)) : Math.max(0, diasEntre(f.mexeuEm, agora));
    if (dias === 0) return { tipo: 'decisao', texto: 'Reunião feita hoje: combine o próximo passo', tom: 'atencao' };
    return {
      tipo: 'decisao',
      texto: `Reunião feita ${dias === 1 ? 'ontem' : `há ${dias} dias`}: cobre a decisão`,
      tom: dias >= DIAS_PARADA ? 'agora' : 'atencao',
    };
  }
  /* Em conversa. */
  if (naoApareceu(r)) return { tipo: 'remarcar', texto: 'Não apareceu na reunião: marque outra', tom: 'atencao' };
  if (r?.status === 'cancelada') return { tipo: 'remarcar', texto: 'A reunião foi cancelada: marque outra', tom: 'atencao' };
  if (f.pausa) return { tipo: 'aguardar', texto: 'Pediu para falar depois', tom: 'calmo' };
  const dias = Math.max(0, diasEntre(f.mexeuEm, agora));
  if (dias >= DIAS_PARADA) return { tipo: 'retomar', texto: `Parada há ${dias} dias: chame de novo`, tom: 'atencao' };
  if (f.comODavi) return { tipo: 'davi', texto: 'O Davi está atendendo', tom: 'calmo' };
  return { tipo: 'aguardar', texto: 'Em conversa', tom: 'calmo' };
}

/* ── juntar as duas origens ──────────────────────────────────────── */

/** A etapa mais adiantada entre duas leituras da mesma oportunidade. */
export const maisAdiantada = (a: EtapaDaVenda, b: EtapaDaVenda): EtapaDaVenda => (ORDEM[b] > ORDEM[a] ? b : a);

/** "Assistente chamou você: X" → "O Davi chamou você: X". */
export function motivoFalado(motivo: string | null | undefined): string | null {
  const m = (motivo ?? '').trim();
  if (!m) return null;
  return m.replace(/^Assistente chamou voc[eê]:\s*/i, 'O Davi chamou você: ');
}

/** De onde veio um card, pelo canal de aquisição. */
export function origemDoCanal(slug: string | null | undefined, nome: string | null | undefined): string {
  if (slug === 'site') return 'Site';
  if (slug === 'instagram' || slug === 'google') return 'Anúncio';
  if (slug === 'indicacao') return 'Indicação';
  if (slug === 'assistente' || slug === 'outbound') return 'Prospecção';
  return nome?.trim() || 'Sem origem';
}

/* ── o dia ───────────────────────────────────────────────────────── */

/** Quem está esperando você agora, com o mais urgente em cima. */
export function paraResponder(ops: Oportunidade[]): Oportunidade[] {
  const peso = (o: Oportunidade) => (o.etapa === 'novo' ? 0 : o.naoLidas > 0 ? 1 : 2);
  return ops
    .filter((o) => !o.perdida && o.etapa !== 'cliente' && o.esperandoVoce)
    /* Lead novo primeiro e o mais recente em cima (quem acabou de pedir contato esfria rápido);
       nos outros, quem espera há mais tempo. */
    .sort((a, b) => peso(a) - peso(b)
      || (a.etapa === 'novo' ? b.entrouEm.localeCompare(a.entrouEm) : a.mexeuEm.localeCompare(b.mexeuEm)));
}

/** O que não é para agora, mas não pode ser esquecido: cobrar decisão, remarcar, retomar. */
export function paraAcompanhar(ops: Oportunidade[]): Oportunidade[] {
  const tipos: TipoDePasso[] = ['decisao', 'remarcar', 'retomar'];
  const peso = (o: Oportunidade) => tipos.indexOf(o.passo.tipo);
  return ops
    .filter((o) => !o.perdida && !o.esperandoVoce && tipos.includes(o.passo.tipo))
    .sort((a, b) => peso(a) - peso(b) || a.mexeuEm.localeCompare(b.mexeuEm));
}

export type QuandoDaReuniao = 'passou' | 'hoje' | 'amanha';

export type ReuniaoDoDia<R extends ReuniaoDaOportunidade = ReuniaoDaOportunidade> = {
  reuniao: R;
  quando: QuandoDaReuniao;
  oportunidade: Oportunidade | null;
};

/**
 * As reuniões que pedem alguma coisa: as que passaram e ninguém contou como foram,
 * as de hoje e as de amanhã. Nessa ordem.
 */
export function reunioesDoDia<R extends ReuniaoDaOportunidade>(
  reunioes: R[], ops: Oportunidade[], agora: Date = new Date(),
): ReuniaoDoDia<R>[] {
  const porReuniao = new Map(ops.filter((o) => o.reuniao).map((o) => [o.reuniao!.id, o]));
  const porCard = new Map(ops.filter((o) => o.cardId).map((o) => [o.cardId!, o]));
  const linhas: ReuniaoDoDia<R>[] = [];
  for (const r of reunioes) {
    if (!reuniaoDePe(r)) continue;
    const dias = diasEntre(r.scheduled_at, agora);
    const quando: QuandoDaReuniao | null = reuniaoPassou(r, agora) ? 'passou' : dias === 0 ? 'hoje' : dias === -1 ? 'amanha' : dias > 0 ? 'passou' : null;
    if (!quando) continue;
    linhas.push({ reuniao: r, quando, oportunidade: porReuniao.get(r.id) ?? (r.prospect_id ? porCard.get(r.prospect_id) ?? null : null) });
  }
  const ordem: Record<QuandoDaReuniao, number> = { passou: 0, hoje: 1, amanha: 2 };
  return linhas.sort((a, b) => ordem[a.quando] - ordem[b.quando] || a.reuniao.scheduled_at.localeCompare(b.reuniao.scheduled_at));
}

/** As oportunidades de cada etapa, com o que pede você em cima. */
export function porEtapa(ops: Oportunidade[]): Record<EtapaDaVenda, Oportunidade[]> {
  const m = Object.fromEntries(ETAPAS.map((e) => [e.chave, [] as Oportunidade[]])) as Record<EtapaDaVenda, Oportunidade[]>;
  const tom: Record<Tom, number> = { agora: 0, atencao: 1, calmo: 2 };
  for (const o of ops) if (!o.perdida) m[o.etapa].push(o);
  for (const e of ETAPAS) m[e.chave].sort((a, b) => tom[a.passo.tom] - tom[b.passo.tom] || b.mexeuEm.localeCompare(a.mexeuEm));
  return m;
}

/** A frase que abre o dia: o que está esperando, em uma linha. */
export function resumoDoDia(x: { responder: number; reunioesHoje: number; semRegistro: number; ligacoes: number; acompanhar: number }): string {
  const partes: string[] = [];
  const n = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
  if (x.responder) partes.push(n(x.responder, 'pessoa esperando você', 'pessoas esperando você'));
  if (x.semRegistro) partes.push(n(x.semRegistro, 'reunião sem registro', 'reuniões sem registro'));
  if (x.reunioesHoje) partes.push(n(x.reunioesHoje, 'reunião hoje', 'reuniões hoje'));
  if (x.acompanhar) partes.push(n(x.acompanhar, 'oportunidade para acompanhar', 'oportunidades para acompanhar'));
  if (x.ligacoes) partes.push(n(x.ligacoes, 'ligação para fazer', 'ligações para fazer'));
  return partes.length ? partes.join(' · ') : 'Nada esperando você agora.';
}

/* ── montar: as lojas da prospecção e os cards, numa lista só ────── */

export type FonteLoja = {
  lojaId: string; nome: string; cidade: string | null; uf: string | null; telefone: string;
  status: string; motivo: string | null; atualizadaEm: string; contatos: number; ligacoes: number;
  conversaId: string | null; primeiroContatoEm: string | null; mexeuEm: string;
  posicao: PosicaoNoFunil;
  reuniao: ReuniaoDaOportunidade | null;
  cardId: string | null;
  /** A conversa com o Davi: a etapa dele e se ele atende sozinho. */
  davi: { etapa: string | null; modo: string | null } | null;
  sabe: string[];
  /** Loja do número de teste do dono: fica de fora. */
  teste: boolean;
};

export type FonteCard = {
  id: string; company_name: string; contact_name: string | null; whatsapp: string | null;
  city: string | null; state: string | null; stage: string; notes: string | null; lost_reason: string | null;
  created_at: string; updated_at: string; canalSlug: string | null; canalNome: string | null;
};

export type FonteConversa = {
  id: string; prospect_id: string | null; nao_lidas: number; ultima_direcao: string | null;
  ultima_mensagem: string | null; ultima_mensagem_em: string | null; telefone: string; nome?: string | null;
};

export type Fontes = {
  lojas: FonteLoja[];
  cards: FonteCard[];
  reunioes: ReuniaoDaOportunidade[];
  conversas: FonteConversa[];
  /** Registros feitos à mão no card. `tentativa` = ligou e ninguém atendeu. */
  atividades: { prospect_id: string | null; kind: string; created_at: string }[];
  /** A última mensagem que alguém da equipe escreveu em cada conversa. */
  respostasDaEquipe: Record<string, string>;
};

const maisRecente = (...datas: (string | null | undefined)[]) =>
  datas.filter((d): d is string => !!d).sort().pop() ?? '';

/**
 * Mensagens que esperam resposta. Se a última palavra da conversa é nossa (o Davi ou alguém da
 * equipe já respondeu), ninguém está esperando, mesmo que o contador de não lidas siga aceso.
 * Aviso do próprio WhatsApp ("[system]") também não é gente esperando.
 */
export function esperamResposta(c: Pick<FonteConversa, 'nao_lidas' | 'ultima_direcao' | 'ultima_mensagem'> | null | undefined): number {
  if (!c || c.ultima_direcao !== 'entrada') return 0;
  if ((c.ultima_mensagem ?? '').trim().toLowerCase().startsWith('[system]')) return 0;
  return c.nao_lidas ?? 0;
}

const lugarDe = (cidade: string | null | undefined, uf: string | null | undefined) => [cidade, uf].filter(Boolean).join('/');

const DAVI_FORA = new Set(['com_xavier', 'perdido', 'saiu', 'pausa', 'frio']);

export function montarOportunidades(f: Fontes, agora: Date = new Date()): Oportunidade[] {
  const conversaPorId = new Map(f.conversas.map((c) => [c.id, c]));
  const conversaDoCard = new Map<string, FonteConversa>();
  for (const c of f.conversas) {
    if (!c.prospect_id) continue;
    const atual = conversaDoCard.get(c.prospect_id);
    if (!atual || (c.ultima_mensagem_em ?? '') > (atual.ultima_mensagem_em ?? '')) conversaDoCard.set(c.prospect_id, c);
  }
  const reunioesDoCard = new Map<string, ReuniaoDaOportunidade[]>();
  for (const r of f.reunioes) if (r.prospect_id) reunioesDoCard.set(r.prospect_id, [...(reunioesDoCard.get(r.prospect_id) ?? []), r]);
  const cardPorId = new Map(f.cards.map((c) => [c.id, c]));
  /* Card e loja que não se ligaram pela conversa (reunião marcada por ligação) se acham pelo telefone. */
  const cardPorTelefone = new Map<string, FonteCard>();
  for (const c of f.cards) { const k = chaveDoTelefone(c.whatsapp); if (k && !cardPorTelefone.has(k)) cardPorTelefone.set(k, c); }
  const ultimaConversa = (c?: FonteConversa) => (c && c.ultima_direcao === 'entrada' ? c.ultima_mensagem?.trim() || null : null);


  const usados = new Set<string>();
  const ops: Oportunidade[] = [];

  for (const l of f.lojas) {
    if (l.teste) continue;
    const card = (l.cardId ? cardPorId.get(l.cardId) : undefined) ?? cardPorTelefone.get(chaveDoTelefone(l.telefone) ?? '') ?? null;
    if (card && usados.has(card.id)) continue;
    const daLoja = etapaDaLoja(l.posicao, !!card);
    if (daLoja === null) continue;
    let etapa = daLoja;
    let perdida = l.posicao.lado === 'perdida';
    let reuniao = l.reuniao;
    if (card) {
      usados.add(card.id);
      /* Loja da lista que nunca respondeu e agora pediu contato pelo site: é lead novo, e dos mais quentes. */
      const respondeu = !!l.posicao.fase && l.posicao.fase !== 'abordada';
      const falaram = f.atividades.some((a) => a.prospect_id === card.id && a.kind !== 'tentativa');
      const doCard = etapaDoCard({ stage: card.stage, reunioes: reunioesDoCard.get(card.id) ?? [], temConversa: respondeu || l.posicao.lado === 'com_voce', temContato: falaram });
      etapa = doCard.etapa === 'novo' ? 'novo' : maisAdiantada(etapa, doCard.etapa);
      perdida = (perdida || doCard.perdida) && card.stage !== 'teste' && card.stage !== 'vendido';
      reuniao = reuniao ?? doCard.reuniao;
    }
    const conv = (l.conversaId ? conversaPorId.get(l.conversaId) : undefined) ?? (card ? conversaDoCard.get(card.id) : undefined);
    const conversaId = l.conversaId ?? conv?.id ?? null;
    const naoLidas = esperamResposta(conv);
    const chamou = (l.status === 'com_voce' && !/^Reuni[aã]o marcada na liga[cç][aã]o/i.test(l.motivo ?? '')) || l.davi?.etapa === 'com_xavier';
    /* Você respondeu depois que o Davi chamou: escrevendo na conversa do CRM, ou por fora
       (ligação, outro WhatsApp) e marcando "Já respondi", que grava um contato no card. */
    const contatoNoCard = card ? f.atividades.find((a) => a.prospect_id === card.id && a.kind !== 'tentativa')?.created_at ?? '' : '';
    const respondeuDepois = (!!conversaId && (f.respostasDaEquipe[conversaId] ?? '') > l.atualizadaEm) || contatoNoCard > l.atualizadaEm;
    const esperandoVoce = !perdida && (etapa === 'novo' || naoLidas > 0 || (chamou && !respondeuDepois));
    const comODavi = !!l.davi && l.davi.modo === 'sozinho' && !DAVI_FORA.has(l.davi.etapa ?? '') && !chamou;
    const motivo = perdida ? (card?.lost_reason ?? l.motivo) : chamou && !respondeuDepois ? motivoFalado(l.motivo) : null;
    const mexeuEm = maisRecente(l.mexeuEm, conv?.ultima_mensagem_em, conversaId ? f.respostasDaEquipe[conversaId] : null, contatoNoCard);
    ops.push({
      id: `loja:${l.lojaId}`, nome: l.nome, lugar: lugarDe(l.cidade, l.uf), telefone: telefoneCompleto(l.telefone),
      origem: l.contatos === 0 && l.ligacoes > 0 ? 'Ligação' : 'Prospecção',
      etapa, perdida, cardId: card?.id ?? null, lojaId: l.lojaId, conversaId, reuniao, naoLidas,
      ultimaMensagem: ultimaConversa(conv), esperandoVoce, motivo, comODavi, sabe: l.sabe, notas: card?.notes ?? null,
      mexeuEm, entrouEm: l.primeiroContatoEm ?? l.mexeuEm,
      passo: proximoPasso({
        etapa, perdida, reuniao, naoLidas, esperandoVoce, motivo, comODavi, pausa: l.davi?.etapa === 'pausa', mexeuEm,
        doSite: card?.canalSlug === 'site',
        tentativas: card ? f.atividades.filter((a) => a.prospect_id === card.id && a.kind === 'tentativa').length : 0,
      }, agora),
    });
  }

  for (const c of f.cards) {
    if (usados.has(c.id)) continue;
    const conv = conversaDoCard.get(c.id);
    const atv = f.atividades.filter((a) => a.prospect_id === c.id);
    const tentativas = atv.filter((a) => a.kind === 'tentativa').length;
    const { etapa, perdida, reuniao } = etapaDoCard({
      stage: c.stage, reunioes: reunioesDoCard.get(c.id) ?? [], temConversa: !!conv, temContato: atv.some((a) => a.kind !== 'tentativa'),
    });
    const naoLidas = esperamResposta(conv);
    const esperandoVoce = !perdida && (etapa === 'novo' || naoLidas > 0);
    const doSite = c.canalSlug === 'site';
    const motivo = perdida ? c.lost_reason : null;
    const mexeuEm = maisRecente(c.updated_at, conv?.ultima_mensagem_em, atv[0]?.created_at);
    ops.push({
      id: `card:${c.id}`, nome: c.contact_name ? `${c.company_name} · ${c.contact_name}` : c.company_name,
      lugar: lugarDe(c.city, c.state), telefone: telefoneCompleto(c.whatsapp), origem: origemDoCanal(c.canalSlug, c.canalNome),
      etapa, perdida, cardId: c.id, lojaId: null, conversaId: conv?.id ?? null, reuniao, naoLidas,
      ultimaMensagem: ultimaConversa(conv), esperandoVoce, motivo, comODavi: false, sabe: [], notas: c.notes,
      mexeuEm, entrouEm: c.created_at,
      passo: proximoPasso({ etapa, perdida, reuniao, naoLidas, esperandoVoce, motivo, comODavi: false, doSite, tentativas, mexeuEm }, agora),
    });
  }
  return ops;
}

/** Conversas com mensagem por ler que não são de nenhuma oportunidade (alguém de fora escreveu). */
export function conversasSoltas(conversas: FonteConversa[], ops: Oportunidade[]): FonteConversa[] {
  const dasOps = new Set(ops.map((o) => o.conversaId).filter(Boolean));
  return conversas
    .filter((c) => esperamResposta(c) > 0 && !dasOps.has(c.id))
    .sort((a, b) => (b.ultima_mensagem_em ?? '').localeCompare(a.ultima_mensagem_em ?? ''));
}
