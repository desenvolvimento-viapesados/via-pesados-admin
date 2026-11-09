/**
 * As regras do assistente de vendas, num lugar só.
 *
 * Decididas pelo dono em 03/11/2026:
 *
 *  1. "Se está na lista, está no atendimento": atende quem responder, explora a dor e
 *     conduz até 15 minutos de videochamada com o Xavier. Antes de fechar o horário,
 *     pergunta se quem decide vem junto (não bloqueia; vai para o dossiê).
 *  2. Nunca diz preço nem prazo do teste. Nunca número falso, caso inventado, depoimento.
 *  3. Fala como o Davi, atendente virtual do Via Pesados (05/11/2026: o dono quis nome
 *     próprio e "atendente"; o "virtual" fica, é o aviso de que é IA); nunca finge ser gente
 *     nem finge esquecimento.
 *  4. Nada automático fora das 08h–20h de São Paulo, e texto livre só com a janela de 24h
 *     da Meta aberta.
 *  5. Quem calcula a etapa é o código: a IA só registra o que ouviu, com citação que
 *     precisa existir na conversa.
 *
 * Arquivo sem nada de Deno de propósito: src/lib/assistente.test.ts confere, e a tela
 * importa os rótulos e tipos daqui.
 */
import { dentroDaJanela, proximaAbertura } from './regua.ts';
import { pediuParaVer } from './prospeccao-regras.ts';

/* ── vocabulário ──────────────────────────────────────────────── */

export type Modo = 'desligado' | 'sugere' | 'sozinho';
export const MODOS: readonly Modo[] = ['desligado', 'sugere', 'sozinho'];
export const ROTULO_DO_MODO: Record<Modo, string> = {
  desligado: 'Desligado',
  sugere: 'Sugere, você aprova',
  sozinho: 'Atende sozinho',
};

/**
 * Quem fala (decisão do dono, 05/11/2026): o Davi, do Via Pesados. O aviso de atendimento
 * virtual vai na primeira mensagem, numa palavra, e é a única coisa que não sai: a IA nunca se
 * passa por gente (regra de uso da IA e confiança do lojista).
 */
export const PERSONA = {
  nome: 'Davi',
  apresentacao: 'Aqui é o Davi, atendente virtual do Via Pesados.',
  souAutomatico: 'Sou o atendente virtual do Via Pesados, sim. Se preferir, chamo o Xavier pra falar com você por aqui.',
} as const;

export type Etapa =
  | 'conversa' | 'dor' | 'prova' | 'compromisso' | 'agendado' | 'entregue'
  | 'pausa' | 'frio' | 'perdido' | 'saiu' | 'com_xavier';

/** O caminho da venda, em ordem. Só anda para a frente. */
export const ETAPAS_DO_FUNIL = ['conversa', 'dor', 'prova', 'compromisso', 'agendado', 'entregue'] as const;
/** Estados de lado: só entram por ação explícita e o cálculo nunca tira a conversa deles. */
export const ETAPAS_LATERAIS = ['pausa', 'frio', 'perdido', 'saiu', 'com_xavier'] as const;
/** Etapas em que o assistente não escreve mais (até alguém devolver). */
export const ETAPAS_SEM_RESPOSTA: readonly Etapa[] = ['entregue', 'perdido', 'saiu', 'com_xavier'];

export const ROTULO_DA_ETAPA: Record<Etapa, string> = {
  conversa: 'Conversando',
  dor: 'Dor encontrada',
  prova: 'Mostrou o sistema',
  compromisso: 'Combinando horário',
  agendado: 'Reunião marcada',
  entregue: 'Reunião marcada',
  pausa: 'Pausado',
  frio: 'Esfriou',
  perdido: 'Encerrado',
  saiu: 'Encerrado',
  com_xavier: 'Com você',
};

export const LIMITES = {
  /** Balões por turno. */
  MAX_MENSAGENS: 3,
  /** Caracteres por balão (dono, 05/11: parágrafo, negrito e lista curta; nada embolado). */
  MAX_CARACTERES: 700,
  /** Linhas (não vazias) por balão. */
  MAX_LINHAS: 10,
  /** Itens de lista ("• ") por balão. */
  MAX_ITENS_DE_LISTA: 4,
  /** Perguntas no turno inteiro. */
  MAX_PERGUNTAS: 1,
  /** Espera depois da última mensagem do lead antes de pensar. */
  ESPERA_AGRUPAMENTO_MS: 40_000,
  /** Teto da espera, contado de pendente_desde (rajada de fotos não adia para sempre). */
  TETO_AGRUPAMENTO_MS: 120_000,
  /** Mensagens do assistente sem chegar a 'agendado' → chamar o Xavier. */
  MAX_MENSAGENS_SEM_AGENDAR: 25,
  /** Janela da Meta para texto livre. */
  JANELA_META_MS: 24 * 60 * 60 * 1000,
  /** Rodadas de ferramenta por turno. */
  MAX_RODADAS: 4,
  /** Imagens mais recentes que vão para a IA. */
  MAX_IMAGENS: 3,
  /** Mensagens da conversa que entram inteiras; as mais antigas só pela memória. */
  MAX_MENSAGENS_NO_CONTEXTO: 120,
  MEMORIA_MAX: 1500,
  /** Horários que o assistente enxerga para oferecer. */
  HORARIOS_OFERECIDOS: 6,
} as const;

/* ── as linhas do banco (migration 20261103190000_assistente_de_vendas) ── */

export type AssistenteConfig = {
  id: 1;
  ligado: boolean;
  modelo: string;
  teto_usd_dia: number | string;
  link_reuniao: string | null;
  dias_semana: number[];
  hora_inicio: string;
  hora_fim: string;
  duracao_min: number;
  folga_min_horas: number;
  max_reunioes_dia: number;
  modo_prospeccao: Modo;
  responsavel_id: string | null;
  pausado_motivo: string | null;
  /** Números do dono para testar: mensagem deles entra com o assistente atendendo sozinho. */
  telefones_teste: string[];
  /** O valor por mês que o Davi pode dizer (dono, 06/11: R$ 437). Vazio = o valor é só com o Xavier. */
  preco_mensal: number | null;
  /** O valor normal, sem a oferta (dono, 06/11: R$ 587 + taxa de implantação). Vazio = não há oferta. */
  preco_cheio?: number | null;
  /** Último dia da oferta (AAAA-MM-DD, hora de Brasília). Depois dele vale o preco_cheio com a taxa. */
  oferta_ate?: string | null;
  /** O WhatsApp que recebe o aviso de reunião marcada (dono, 09/11: o 98814-4005). Vazio = sem aviso. */
  aviso_whatsapp?: string | null;
  atualizado_em: string;
  atualizado_por: string | null;
};

/* ── o valor e a oferta do mês ────────────────────────────────── */

/**
 * O que o Davi diz de valor hoje. Dono, 06/11/2026 (oferta de lançamento, a Black Friday de
 * novembro): o normal é R$ 587 por mês mais a taxa de implantação; até oferta_ate sai R$ 437
 * por mês e a implantação não é cobrada. Passou a data, vale o cheio com a taxa. Sem
 * preco_cheio, só o preco_mensal, como antes; sem nenhum, o valor é com o Xavier (null).
 */
export type PrecoDeHoje = {
  mensal: number; cheio: number | null; ofertaAte: string | null; comTaxa: boolean;
  /** A oferta existiu e acabou nesta data (AAAA-MM-DD): o Davi não chama o valor de hoje de oferta. */
  ofertaAcabouEm?: string | null;
};

export function precoDeHoje(
  cfg: Pick<AssistenteConfig, 'preco_mensal' | 'preco_cheio' | 'oferta_ate'> | null | undefined, agora = new Date(),
): PrecoDeHoje | null {
  if (!cfg) return null;
  const hoje = new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10); // Brasília
  const cheio = cfg.preco_cheio ? Number(cfg.preco_cheio) : null;
  const ate = cfg.oferta_ate ? String(cfg.oferta_ate).slice(0, 10) : null;
  if (cheio && ate) {
    return cfg.preco_mensal && hoje <= ate
      ? { mensal: Number(cfg.preco_mensal), cheio, ofertaAte: ate, comTaxa: false }
      : { mensal: cheio, cheio: null, ofertaAte: null, comTaxa: true, ofertaAcabouEm: ate };
  }
  return cfg.preco_mensal ? { mensal: Number(cfg.preco_mensal), cheio: null, ofertaAte: null, comTaxa: false } : null;
}

/** Os números que o conferente deixa passar hoje. */
export function valoresLiberados(p: PrecoDeHoje | null): number[] {
  return p ? [p.mensal, ...(p.cheio ? [p.cheio] : [])] : [];
}

/** A frase do valor, pronta: a IA usa como está. */
export function falaDoPreco(p: PrecoDeHoje): string {
  if (p.cheio) {
    return `Em novembro tá *R$ ${p.mensal} por mês* e a implantação é por nossa conta. O normal é R$ ${p.cheio} por mês mais a taxa de implantação. Sem fidelidade e sem multa pra cancelar.`;
  }
  if (p.comTaxa) return `É *R$ ${p.mensal} por mês*, mais a taxa de implantação. Sem fidelidade e sem multa pra cancelar.`;
  return `É *R$ ${p.mensal} por mês*, sem fidelidade e sem multa pra cancelar. A implantação é nossa.`;
}

export type ItemCitado = { texto: string; citacao: string | null; mensagem_id: string | null; resposta?: string | null };

export type Situacao = {
  estoque?: string | null;
  canais?: string | null;
  sistema_atual?: string | null;
  cidade?: string | null;
  segmento?: 'caminhoes' | 'implementos' | 'maquinas' | 'onibus' | 'outro' | null;
  quem_fala?: string | null;
  /** A loja: nome ou @ do Instagram (a cidade vai em `cidade`). */
  loja?: string | null;
  /** O cargo de quem fala: dono, sócio, gerente, vendedor, quem cuida das redes... (dono, 05/11). */
  cargo?: string | null;
  /** Estrutura física: tem pátio/loja, ou trabalha sem pátio (intermediando), nas palavras dele. */
  estrutura?: string | null;
  /** Quem posta os anúncios hoje: dono, vendedor, família, agência. */
  quem_anuncia?: string | null;
  /** Como manda foto e ficha ao cliente, nas palavras dele. */
  como_manda?: string | null;
  /** Sozinho, tem vendedor, quantos. */
  equipe?: string | null;
  /** Época boa (máquinas e agro), nas palavras dele. */
  epoca_boa?: string | null;
  /** Por que agora (lead que procurou a gente), nas palavras dele. */
  motivo?: string | null;
  /** O que ele quer ver nos 15 minutos. */
  o_que_quer_ver?: string | null;
  /** Começa já ou mais pra frente, nas palavras dele. */
  prazo?: string | null;
  /** Não é o momento: por quê e quando volta (a porta fica aberta, não encerra). */
  nao_e_o_momento?: string | null;
  /** O pedido mais quente que ele fez (o código decide se já pode oferecer horário). */
  pedido?: Pedido | null;
  /** Disse "sim" a ver funcionando. */
  interesse?: 'sim' | null;
  /** Recusou vídeo ou reunião, ou condicionou ao preço (a frase dele): o convite só volta se ele pedir. */
  recusou_reuniao?: string | null;
};

/** O que o lead pediu, do mais quente ao mais frio (só sobe). */
export type Pedido = 'fechar_ja' | 'comprar' | 'ver' | 'como_funciona';
export const PEDIDOS: readonly Pedido[] = ['fechar_ja', 'comprar', 'ver', 'como_funciona'];
/** Fica o mais quente dos dois (fechar_ja > comprar > ver > como_funciona). */
export function pedidoMaisQuente(a: Pedido | null | undefined, b: Pedido | null | undefined): Pedido | null {
  const ia = a ? PEDIDOS.indexOf(a) : -1, ib = b ? PEDIDOS.indexOf(b) : -1;
  if (ia < 0) return ib < 0 ? null : b!;
  if (ib < 0) return a!;
  return ia <= ib ? a! : b!;
}

/**
 * O botão "Quero ver funcionando" do modelo da prospecção (06/11/2026) é pedido 'ver' no
 * código, não só na leitura da IA: tocou, a porta do horário abre na hora. `msgs` são as
 * mensagens da conversa já cortadas no historico_desde (carregarConversa); vale qualquer
 * entrada do lead que seja o botão. Devolve o pedido como fica (só esquenta).
 */
export function pedidoComOBotao(
  atual: Pedido | null | undefined, msgs: { direcao: string; conteudo: string | null }[],
): Pedido | null {
  const tocou = msgs.some((m) => m.direcao === 'entrada' && pediuParaVer(m.conteudo));
  return tocou ? pedidoMaisQuente(atual, 'ver') : (atual ?? null);
}

/* ── a qualificação curta ─────────────────────────────────────── */

/**
 * Dono, 06/11/2026: antes do convite, três perguntas, nesta ordem e uma por resposta: o nome
 * da loja (só se não souber; a loja da lista já vem com o nome), o estoque e se quem fala é o
 * dono ou vendedor. Com as três, o convite.
 */
export type ItemDaQualificacao = 'loja' | 'estoque' | 'cargo';
export const ORDEM_DA_QUALIFICACAO: readonly ItemDaQualificacao[] = ['loja', 'estoque', 'cargo'];
export const PERGUNTA_DA_QUALIFICACAO: Record<ItemDaQualificacao, string> = {
  loja: 'o nome da loja (e a cidade, se couber na mesma pergunta)',
  estoque: 'quantos veículos tem no estoque',
  cargo: 'se ele é o dono ou vendedor (ou outro cargo)',
};

/** O que falta da qualificação curta, na ordem em que se pergunta. */
export function faltaNaQualificacao(s: Partial<Record<ItemDaQualificacao, string | null>>): ItemDaQualificacao[] {
  return ORDEM_DA_QUALIFICACAO.filter((k) => !String(s[k] ?? '').trim());
}

/**
 * A última mensagem dele é uma pergunta? ("e o Mercado Livre entra?", "quanto custa",
 * "como funciona"). Quando é, o Davi responde o que ele perguntou; quando não é, no meio da
 * qualificação, só reconhece e pergunta (soPerguntar no conferente).
 */
export function perguntouAlgo(texto: string | null | undefined): boolean {
  const t = normalizarTexto(String(texto ?? ''));
  if (!t) return false;
  if (String(texto).includes('?')) return true;
  return /^(e\s+)?(quanto|quantos|quanta|como|qual|quais|onde|quando|porque|por\s+que|pq|tem|funciona|serve|da\s+pra|da\s+para|precisa|posso|consigo|voces|o\s+que|e\s+o|e\s+a|e\s+no|e\s+na)\b/.test(t);
}

/**
 * Um sim curto e sem conteúdo ("Bora!", "pode", "sim", "manda", "gostei"): ao convite das
 * perguntinhas da prospecção, é sim às perguntas, não à demonstração (dono, 06/11).
 */
export function soSimCurto(texto: string | null | undefined): boolean {
  const t = normalizarTexto(String(texto ?? ''));
  if (!t || t.split(' ').length > 3) return false;
  return /^(bora|bora la|vamos|vamo|pode|pode ser|pode mandar|pode perguntar|manda|sim|claro|ok|okay|beleza|blz|show|top|gostei|massa|fechou|opa|uhum|isso)$/.test(t);
}

/** Depois de tantas respostas suas sem completar a qualificação, convida mesmo assim. */
export const RESPOSTAS_ATE_CONVIDAR = 4;

/**
 * Já pode oferecer horário? A regra é do código, não do texto (manual de vendas de 05/11,
 * tabela 1.3): o modelo tende a convidar cedo quando a trava está só nas instruções.
 *   - reunião marcada, ou marcando agora: sim (é remarcar ou confirmar);
 *   - pediu para fechar já: sim, na hora;
 *   - pediu para comprar: depois de duas respostas suas (os horários vêm até a 3ª);
 *   - pediu para ver funcionando, ou disse "sim" a ver: sim;
 *   - segundo pedido de preço: sim (o horário mais cedo, dentro da resposta do preço);
 *   - disse uma dor: sim se veio por conta própria; da lista da prospecção, primeiro o
 *     "quer ver funcionando?" (precisaInteresse).
 */
export function podeOferecerHorario(x: {
  daLista: boolean; pedido?: Pedido | null; interesse?: boolean; dores: number;
  respostasSuas: number; pedidosDePreco: number; reuniaoMarcada?: boolean; recusou?: string | null;
  /** O que falta da qualificação curta (faltaNaQualificacao). Sem isto vale a regra antiga. */
  falta?: ItemDaQualificacao[];
}): { pode: boolean; precisaInteresse: boolean; motivo: string } {
  if (x.reuniaoMarcada) return { pode: true, precisaInteresse: false, motivo: 'a reunião já está marcada (só para remarcar, se ele pedir)' };
  if (x.recusou) return { pode: false, precisaInteresse: false, motivo: `ele recusou vídeo ou reunião ("${x.recusou.slice(0, 120)}"): não convide de novo; ofereça, uma vez, falar com o Xavier por aqui. Se ele mesmo pedir para marcar, registre reabriu_reuniao` };
  if (x.pedido === 'fechar_ja') return { pode: true, precisaInteresse: false, motivo: 'ele pediu para fechar já: horários direto; o que faltar o Xavier vê na reunião' };
  if (x.pedido === 'ver' || x.interesse) return { pode: true, precisaInteresse: false, motivo: 'ele quer ver funcionando' };
  if (x.pedidosDePreco >= 2) return { pode: true, precisaInteresse: false, motivo: 'segundo pedido de preço: só o horário mais cedo, na resposta do preço' };
  /* Dono, 05/11: poucas perguntas e a reunião o tempo inteiro — a partir da 2ª resposta (quem quer
     comprar) ou da 3ª (os demais), ou assim que ele contar uma dor. */
  if (x.pedido === 'comprar' && x.respostasSuas >= 1) return { pode: true, precisaInteresse: false, motivo: 'ele quer comprar e já se apresentou o Via Pesados' };
  /* Dono, 06/11: a qualificação curta (nome da loja se não souber, estoque, cargo) vem antes do convite. */
  if (x.falta) {
    if (!x.falta.length) return { pode: true, precisaInteresse: false, motivo: 'a qualificação curta está completa (loja, estoque e cargo): é a hora do convite' };
    if (x.respostasSuas >= RESPOSTAS_ATE_CONVIDAR) return { pode: true, precisaInteresse: false, motivo: `já foram ${x.respostasSuas} respostas suas: convide; o que faltar (${x.falta.map((k) => PERGUNTA_DA_QUALIFICACAO[k]).join('; ')}) o Xavier vê na reunião` };
    return { pode: false, precisaInteresse: false, motivo: `falta a qualificação curta; a próxima pergunta é ${PERGUNTA_DA_QUALIFICACAO[x.falta[0]]}` };
  }
  if (x.respostasSuas >= 2) return { pode: true, precisaInteresse: false, motivo: 'você já apresentou o Via Pesados e perguntou da loja' };
  if (x.dores > 0) return { pode: true, precisaInteresse: false, motivo: 'ele contou o que atrapalha' };
  return { pode: false, precisaInteresse: false, motivo: 'primeiro apresente o Via Pesados e pergunte o nome da loja' };
}

export type AssistenteConversa = {
  conversa_id: string;
  modo: Modo;
  etapa: Etapa;
  memoria: string | null;
  dores: ItemCitado[];
  objecoes: ItemCitado[];
  situacao: Situacao;
  decisor_vem: 'sim' | 'nao' | 'nao_sei' | null;
  decisor_citacao: string | null;
  quem_vem: string | null;
  pedidos_preco: number;
  prova_enviada: boolean;
  horarios_oferecidos: string[];
  reuniao_id: string | null;
  prospect_id: string | null;
  loja_id: string | null;
  dossie: Record<string, unknown> | null;
  apresentou: boolean;
  token: string | null;
  pendente_desde: string | null;
  ultimo_turno_em: string | null;
  mensagens_enviadas: number;
  custo_usd: number | string;
  pausado_motivo: string | null;
  /** Recomeço do teste: o assistente só lê a conversa daqui para a frente. */
  historico_desde: string | null;
  frente: 'lojista' | 'transportadora';
  criado_em: string;
  atualizado_em: string;
};

export type EstadoDaAcao = 'executada' | 'pendente' | 'recusada' | 'descartada';
export type AcaoDoTurno = {
  tipo: 'registrar' | 'marcar_reuniao' | 'chamar_xavier' | 'encerrar';
  args: Record<string, unknown>;
  estado: EstadoDaAcao;
  resultado?: unknown;
};
export type StatusDoTurno = 'enviado' | 'rascunho' | 'aprovado' | 'descartado' | 'barrado' | 'erro';

export type AssistenteTurno = {
  id: string;
  conversa_id: string;
  criado_em: string;
  entrada_ids: string[];
  mensagens: string[];
  mensagens_finais: string[] | null;
  acoes: AcaoDoTurno[];
  ferramentas: { nome: string; entrada: unknown; saida: unknown }[];
  modelo: string | null;
  usage: Uso | Uso[] | null;
  custo_usd: number | string;
  fiscal: (ResultadoFiscal & { tentativas?: number }) | null;
  status: StatusDoTurno;
  erro: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
  frente: 'lojista' | 'transportadora';
};

export type AssistenteFato = {
  id: string;
  tema: string;
  texto: string;
  nao_dizer: string | null;
  /** A dor que este fato responde: assim a lista deixa de ser cardápio. */
  usar_quando: string | null;
  ativo: boolean;
  ordem: number;
  atualizado_em: string;
  atualizado_por: string | null;
};

/* ── texto: normalizar ────────────────────────────────────────── */

const INVISIVEIS = /[­᠎​-‏⁠-⁤﻿]/g;

/** Tira caracteres invisíveis e unifica larguras (＄ → $). Mantém acento e caixa. */
function limpo(t: string): string {
  return String(t ?? '').normalize('NFKC').replace(INVISIVEIS, '');
}

/** Minúsculas, sem acento, sem invisíveis. Mantém pontuação. */
function plano(t: string): string {
  return limpo(t).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Para comparar citação: sem acento, sem caixa, sem pontuação, espaços únicos. */
export function normalizarTexto(t: string | null | undefined): string {
  return plano(String(t ?? ''))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── citação ──────────────────────────────────────────────────── */

/**
 * Onde a citação aparece, ao pé da letra (ignorando acento, caixa, pontuação e
 * espaços), dentro de UM dos textos. Casa palavra inteira: "ola" não casa com "bola".
 * Aspas e reticências nas pontas são ignoradas. Citação com menos de 3 caracteres
 * úteis nunca confere. Devolve o índice do texto, ou -1.
 */
export function ondeEstaCitacao(citacao: string | null | undefined, textos: (string | null | undefined)[]): number {
  const c = normalizarTexto(citacao);
  if (c.replace(/\s/g, '').length < 3) return -1;
  for (let i = 0; i < textos.length; i++) {
    const t = normalizarTexto(textos[i]);
    if (t && ` ${t} `.includes(` ${c} `)) return i;
  }
  return -1;
}

export function citacaoConfere(citacao: string | null | undefined, textos: (string | null | undefined)[]): boolean {
  return ondeEstaCitacao(citacao, textos) >= 0;
}

/**
 * Separa o que a IA registrou em aceitos (a citação existe numa mensagem do lead; ganha
 * mensagem_id) e recusados (citação vazia ou que não está na conversa). `fontes` são as
 * mensagens de ENTRADA: texto = conteudo + transcrição.
 */
export function conferirCitacoes<T extends { citacao?: string | null }>(
  itens: T[],
  fontes: { id: string; texto: string | null | undefined }[],
): { aceitos: (T & { mensagem_id: string })[]; recusados: T[] } {
  const aceitos: (T & { mensagem_id: string })[] = [];
  const recusados: T[] = [];
  const textos = fontes.map((f) => f.texto);
  for (const item of itens ?? []) {
    const i = ondeEstaCitacao(item?.citacao, textos);
    if (i >= 0) aceitos.push({ ...item, mensagem_id: fontes[i].id });
    else recusados.push(item);
  }
  return { aceitos, recusados };
}

/** O texto de uma mensagem de entrada para conferir citação: o que escreveu + o que falou. */
export function textoDaMensagem(m: { conteudo?: string | null; transcricao?: string | null }): string {
  const c = String(m.conteudo ?? '');
  const util = /^\[[a-z_]+\]$/i.test(c.trim()) ? '' : c; // "[audio]", "[imagem]" não contam
  return [util, m.transcricao ?? ''].filter(Boolean).join('\n');
}

/* ── pedido de parar (antes da IA) ────────────────────────────── */

/*
 * Só o pedido INEQUÍVOCO de parar encerra antes da IA. O assistente faz perguntas de sim
 * ou não ("quem decide consegue estar junto?") e "não", "não quero perder venda", "não
 * preciso, já tenho site", "me tira uma dúvida", "deu bloqueio no Face" e "se for golpe eu
 * denuncio" NÃO são pedido de sair: quem julga é a IA, pela conversa (ferramenta encerrar).
 */
const PARAR: RegExp[] = [
  /^\s*(?:sair|pare|parar|para|stop|remover|remova|chega)\s*[.!]*\s*$/,
  /\bme\s+tir[ae]\s+(?:d[aeo]s?s[ae]\s+lista|da\s+lista|daqui|do\s+grupo|do\s+seu\s+cadastro)\b/,
  /\btir[ae]\s+(?:o\s+)?(?:meu|esse)\s+(?:numero|contato)\b/,
  /\bsair\s+da\s+lista\b/,
  /\bdescadastr\w*/,
  /\bpar[ae]\s+de\s+(?:mandar|enviar|me\s+(?:mandar|chamar|enviar|encher))\b/,
  /\b(?:nao|nem)\s+(?:tenho|temos)\s+(?:nenhum\s+)?interesse\b/,
  /\bsem\s+interesse\b/,
  /\bnao\s+(?:me\s+)?(?:mande|manda|chame|chama|procure|procura)\s+mais\b/,
  /\bnao\s+quero\s+(?:mais\s+)?receber\b/,
];

/** O lead pediu, sem dúvida nenhuma, para parar de receber mensagem. */
export function pedidoExplicitoDeParar(texto: string | null | undefined): boolean {
  const t = plano(limpo(String(texto ?? ''))).trim();
  if (!t) return false;
  return PARAR.some((r) => r.test(t));
}

/* ── o que vem do lead entra no pedido à IA como dado ─────────── */

/**
 * Neutraliza o que poderia fechar a marca de dados ("</conversa>") ou abrir uma seção
 * falsa: troca < e > por ‹ e ›, e # no começo de linha por ♯. Vale para o texto do lead,
 * transcrição, legenda, nome do WhatsApp, dados da loja e a memória escrita a partir deles.
 */
export function neutro(texto: string | null | undefined, max = 4000): string {
  return String(texto ?? '')
    .replace(/</g, '‹').replace(/>/g, '›')
    .replace(/^(\s*)#/gm, '$1♯')
    .slice(0, max);
}

/** Fallback do lado do servidor: Opus e Sonnet têm; o Haiku 5.5 não. */
export function temFallbackNoServidor(modelo: string | null | undefined): boolean {
  return /^claude-(?:opus|sonnet)-/.test(String(modelo ?? ''));
}

export function cortarMemoria(texto: string | null | undefined): string | null {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  return t.length <= LIMITES.MEMORIA_MAX ? t : t.slice(0, LIMITES.MEMORIA_MAX - 1).trimEnd() + '…';
}

/* ── o fiscal de saída ────────────────────────────────────────── */

export type RegraFiscal =
  | 'quantidade' | 'vazia' | 'tamanho' | 'linhas' | 'lista' | 'perguntas'
  | 'preco' | 'prazo' | 'percentual' | 'link' | 'proibida' | 'pedido_sensivel'
  | 'fingir_gente' | 'esquecimento' | 'meu_amigo' | 'apresentacao' | 'horario_cedo' | 'despejo' | 'palco' | 'markdown'
  | 'vendendo' | 'pergunta_de_ficha' | 'pergunta_depois_de_marcar';

export type Violacao = {
  regra: RegraFiscal;
  /** Índice do balão (0 = primeiro); null quando é do turno inteiro. */
  mensagem: number | null;
  trecho?: string;
  /** Em português, para a IA corrigir na segunda tentativa e para a tela mostrar. */
  explicacao: string;
};
export type ResultadoFiscal = { ok: boolean; violacoes: Violacao[] };

export type ContextoFiscal = {
  /** O link fixo da reunião (assistente_config.link_reuniao). */
  linkReuniao?: string | null;
  /** Ainda não se apresentou nesta conversa: o 1º balão tem de dizer quem fala. */
  precisaApresentar?: boolean;
  /** "meu amigo" já foi dito pelo assistente (ou pelo modelo) nesta conversa. */
  meuAmigoJaUsado?: boolean;
  /** false = ainda não é hora de oferecer horário (podeOferecerHorario); undefined não confere. */
  podeOferecerHorario?: boolean;
  /** O motivo, para a IA entender na segunda tentativa. */
  motivoDoHorario?: string;
  /** Reunião ainda não marcada: vale a regra de uma coisa do sistema por resposta. */
  antesDeMarcar?: boolean;
  /** Qualificação em andamento e ele não perguntou nada: só reconhecer e perguntar, sem vender (dono, 06/11). */
  soPerguntar?: boolean;
  /** Os valores liberados (valoresLiberados): só eles passam no conferente. */
  precoPermitido?: number | number[] | null;
  /** A reunião está marcada (ou é marcada neste turno): nada de pergunta (dono, 06/11). */
  reuniaoMarcada?: boolean;
  /** A reunião é marcada (ou remarcada) neste turno: o Marcado vai sem pergunta. */
  marcandoAgora?: boolean;
  /** A última mensagem do lead pergunta algo (perguntouAlgo). */
  leadPerguntou?: boolean;
  /** O nome da loja já se sabe: a cidade sozinha não se pergunta. */
  lojaConhecida?: boolean;
};

/*
 * Perguntas sobre a loja fora da qualificação curta (dono, 06/11): o Davi perguntou "têm
 * pátio ou trabalham intermediando?" a quem já tinha dito que tem 35 caminhões, e com a
 * reunião já marcada. Antes de marcar, só as três da qualificação; o resto o Xavier vê na
 * reunião. Vale só a última oração da pergunta ("35 no pátio já é bom, e você é o dono?").
 */
const FICHA_ANTES_DE_MARCAR: RegExp[] = [
  /\bpatios?\b/, /\bintermed\w*/, /\bloja\s+fisica\b/, /\bgalpao\b/, /\bde\s+terceiros\b/, /\bconsign\w*/,
  /\binsta(?:gram)?\b/, /@/, /\bonde\s+(?:voces\s+)?(?:ja\s+)?anunci\w*/, /\bvoces\s+(?:ja\s+)?anunciam\b/,
  /\bquem\s+(?:posta|anuncia|cuida\s+d[oa]s?\s+(?:anuncio|rede|insta))/, /\bdecide\w*/,
  /\batrapalha\w*/, /\bmais\s+te\s+(?:toma|da)\s+(?:tempo|trabalho)\b/, /\bdificuldade\b/,
];
/* A cidade sozinha, quando o nome da loja já se sabe (junto do nome ela é a pergunta 1). */
const SO_A_CIDADE = /\bcidade\b|\bde\s+onde\b|\bfica\s+onde\b|\bonde\s+(?:fica|voces\s+(?:sao|estao|ficam))\b/;
/* Depois de marcar, nada que fale da loja dele. */
const FALA_DA_LOJA: RegExp[] = [
  ...FICHA_ANTES_DE_MARCAR, SO_A_CIDADE,
  /\bvoces\b/, /\bloja\b/, /\bhoje\b/, /\baqui?\b\W*$/, /\bestoque\b/, /\bquant[oa]s\b/, /\bdono\b/, /\bvendedor\w*/,
  /\bcargo\b/, /\bgerente\b/, /\bsocio\w*/, /\bsistema\b/, /\bmercado\s+livre\b/, /\bface(?:book)?\b/, /\banunci\w*/,
  /\bpost\w*/, /\bfotos?\b/, /\bchamada\b/, /\bjunto\b/, /\bsegmento\b/, /\btrabalham\b/, /\bvendem\b/,
  /\bquer\s+ver\b/, /\bdor\b/, /\bfalta\b/, /\bduvida\b/,
];
/* Escolha de horário: só vale com o horário oferecido no turno (remarcar). */
const ESCOLHA_DE_HORARIO = /\bqual\b|\bpode\s+ser\b|\bprefere\b|\bfica\s+(?:bom|melhor)\b|\bconsegue\b|\bserve\b|\bmelhor\s+pra\s+voce\b/;
/* "tá?", "beleza?", "sabe?" no fim de uma afirmação não são pergunta. */
const MULETA = /(?:,\s*|\s+)(?:ta|ne|beleza|blz|sabe|entendeu|combinado|tranquilo|ok|ta\s+bom|fechou|certo)\s*\?+$/;

/** As frases que perguntam, no texto plano: as que terminam em "?" e os "me conta...". */
function frasesQuePerguntam(p: string): string[] {
  const t = p
    .replace(/[❓❔🤔]/gu, '?').replace(/!\?|\?!/g, '?')
    .replace(/\.{2,}|…/g, ' ');
  const frases: string[] = [];
  for (const bruta of t.split(/(?<=[.!?])\s+|\n+/)) {
    const f = bruta.trim();
    if (!f) continue;
    if (/\?\s*\W*$/.test(f)) {
      const semMuleta = f.replace(/\?[\s\W]*$/, '?').replace(MULETA, '').trim();
      if (/\?$/.test(semMuleta)) frases.push(semMuleta);
    } else if (/(?:^|[,:;]\s*|\b(?:e|agora)\s+)me\s+(?:conta|fala|passa|manda|diz)\s+\S+\s+\S+/.test(f)) frases.push(f);
    /* Pergunta sem o "?" no fim do balão: "E aí, vocês têm pátio ou trabalham intermediando". */
    else if (!/[.!]\W*$/.test(f) && /^(?:e\s+ai,?\s+|e\s+)?(?:voces\s+(?:ja\s+)?(?:tem|trabalham|usam|vendem|anunciam|postam|ficam|sao|estao)|quantos|quantas)\b/.test(f)) frases.push(`${f}?`);
  }
  return frases;
}

/** A última oração da pergunta (depois da última vírgula, ponto e vírgula ou dois-pontos). */
function ultimaOracao(f: string): string {
  const partes = f.split(/[,;:]\s*/);
  return partes[partes.length - 1] ?? f;
}

/** Tira do texto plano as menções aos valores liberados ("r$ 437", "437 reais", "587 por mes"). */
function semPrecoPermitido(p: string, valor: number | number[] | null | undefined): string {
  const valores = (Array.isArray(valor) ? valor : [valor]).filter((v): v is number => !!v && Number.isFinite(v));
  for (const v of valores) {
    const num = `${String(Math.round(v))}(?:,00)?`;
    p = p
      .replace(new RegExp(`r\\s*\\$\\s*${num}(?:\\s*(?:por|ao|\\/|no)\\s*mes)?`, 'g'), ' valor ')
      .replace(new RegExp(`\\b${num}\\s*(?:reais|real)?\\s*(?:por|ao|\\/|no)\\s*mes\\b`, 'g'), ' valor ')
      .replace(new RegExp(`\\b${num}\\s*(?:reais|mensais)\\b`, 'g'), ' valor ');
  }
  return p;
}

const NUM_EXTENSO =
  '(?:dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)';

/* Sobre o texto "plano" (minúsculo, sem acento). */
const PRECO: RegExp[] = [
  /r\s*\$/,                                                   // R$, r $, R＄
  /\$\s*\d/,                                                  // $400
  /\b\d[\d.,]*\s*(?:reais|real|conto|contos|pila|pilas|mil|k)\b/,  // 437 reais, 2 mil, 5k
  new RegExp(`\\b(?:${NUM_EXTENSO}|um|uma|mil)\\s+(?:e\\s+\\w+\\s+)?(?:reais|conto|contos|pila|pilas|mil)\\b`),
  /\b\d[\d.,]*\s*(?:\/|por|ao)\s*mes\b/,                      // 437/mês, 437 por mês
  /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/,                            // 437,00
  /\b\d{2,5}\s*(?:no|ao|por)\s+mes\b/,                         // 587 no mês
  /\b\d{3,5}\s+mensa\w*/,                                     // 587 mensais
  /\b(?:mensalidade|mensal|plano|valor|custa|custo|fica|ficaria|sai\s+por|a\s+partir\s+de|preco|investimento|paga|pagar|cobra|cobramos)\b\D{0,20}\b\d{3,5}\b/, // fica 587, a partir de 437
  /\b(?:437|587)\b/,                                           // os valores de hoje, em qualquer lugar
];
/* Frases de vendedor de palco, de pressão, de pedágio e de promessa que o assistente não
   cumpre (manual de vendas de 05/11, seção 5.3). Sobre o texto plano. */
const PALCO: [RegExp, string][] = [
  [/\bteste\b|\btestar\b|\btesta-lo\b/, 'teste (não é oferecido por enquanto)'],
  [/\bexcelente\s+pergunta\b|\bfaz\s+sentido\s+(?:pra|para)\s+(?:voce|vc)\b|\bseria\s+loucura\b|\bentendo\s+perfeitamente\b/, 'frase de vendedor de palco'],
  [/\binvestimento\b|\bcondicao\s+especial\b|\brisco\s+zero\b|\bgarantid[oa]s?\b|\bnao\s+perca\b|\bcorra\b|\bultimas\s+vagas\b|\bso\s+hoje\b|\bagenda\s+(?:esta\s+)?lotando\b/, 'pressão ou promessa'],
  [/\bvoce\s+(?:esta|ta)\s+perdendo\b|\bseu\s+concorrente\b|\bcaminhao\s+parado\b/, 'medo (pergunte, não acuse)'],
  [/\bo\s+(?:comeco|primeiro\s+passo)\s+e\b|\be\s+necessario\b/, 'reunião como pedágio'],
  [/\bcabe\s+no\s+bolso\b|\bdepende\s+do\s+plano\b|\brealidade\s+da\s+(?:sua\s+)?loja\b|\bdeixa\s+a\s+mao\b/, 'frase que o dono reprovou'],
  [/\bte\s+(?:mando|envio|passo)\s+(?:depois|mais\s+tarde|amanha)\b|\bte\s+chamo\s+(?:amanha|depois|semana)\b|\bte\s+lembro\b|\bconseguiu\s+(?:ver|falar)\b|\bso\s+passando\b/, 'promessa ou cobrança que você não cumpre'],
  [/\btenho\s+(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/, '"tenho [horário]" (o horário é do Xavier: "o Xavier pode...")'],
  /* Dono, 05/11: o Davi pergunta para entender e ajudar a loja, não para passar adiante. */
  [/\b(?:adiantar|passar|repassar|levar)\s+(?:isso\s+|tudo\s+)?(?:pro|pra|para\s+o)\s+xavier\b|\bpro\s+xavier\s+(?:ja\s+)?(?:saber|chegar|entender)\b/, 'pergunta "pro Xavier" (você pergunta para entender e ajudar a loja dele)'],
  /* Bancada de 05/11: o que irritou o lojista simulado. */
  [/\bsao\s+so\b|\bsem\s+rodeio\b|\bso\s+pra\s+(?:voce\s+saber|constar)\b|\bcontinua\s+com\s+voce\b/, 'pressão disfarçada ou promessa vaga'],
  [/\bem\s+tudo\b|\bem\s+todo\s+lugar\b/, '"em tudo" (diga os lugares: Mercado Livre, Insta, Face e site)'],
  [/\bcertinho\b|\bcompensa\b|\bse\s+achar\s+caro\b|\bsair\s+sabendo\s+o\s+valor\b/, 'o valor como isca ou promessa de resposta que não vem'],
  /* Dono, 06/11: "esse 'cês' não precisa, deixa menos forçado". */
  [/\bces\b|\bce\b|\bceis\b/, '"cê"/"cês" (escreva "você"/"vocês": o jeito do Xavier sem forçar)'],
];

/* Temas do sistema: antes de marcar, uma resposta fala de um só (uma dor, uma prova). Os
   fatos de risco (fidelidade, implantação, quem somos) não contam. */
const TEMAS_DO_SISTEMA: [RegExp, string][] = [
  [/\bmercado\s+livre\b|\binsta(?:gram)?\b|\bface(?:book)?\b|\btodos\s+os\s+canais\b|\bsai\s+de\s+todos\b/, 'anúncio nos canais'],
  [/\bfotos?\s+na\s+ordem\b|\bficha\b[^.]{0,40}\bwhatsapp\b|\bwhatsapp\s+do\s+cliente\b/, 'envio pelo WhatsApp'],
  [/\bcada\s+vendedor\b|\bconversa\s+fica\s+com\s+a\s+loja\b/, 'WhatsApp da equipe'],
  [/\bquem\s+(?:ja\s+)?procurou\s+um\s+igual\b/, 'vendas na base'],
  [/\bsimulador\b|\bparcela\b/, 'simulador'],
  [/\bfunil\b|\brelatorios?\b|\bfinanceiro\b|\bconsignac\w*|\bponto\s+eletronico\b/, 'gestão'],
];

/* Dia e hora no mesmo balão: é oferta (ou confirmação) de horário. */
const DIA_CITADO = /\b(?:domingo|segunda|terca|quarta|quinta|sexta|sabado|hoje|amanha)\b|\bdia\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b/;
const HORA_CITADA = /\b\d{1,2}\s*(?:h|:\s*\d{2})\b|\b\d{1,2}h\d{2}(?:min)?\b|\b\d{1,2}\s*h(?:s|oras?)\b|\b\d{1,2}\s+horas?\b|\b\d{1,2}\s+da\s+(?:manha|tarde|noite)\b/;

const PRAZO: RegExp[] = [
  /\b\d+\s*(?:dias?|semanas?|meses|mes|anos?)\b/,             // 60 dias, 2 meses
  new RegExp(`\\b${NUM_EXTENSO}\\s+(?:dias|semanas|meses|anos)\\b`),
  /\b(?:uma|um)\s+(?:semana|mes|ano)\b/,                      // um mês grátis ("um dia" fica livre: "se um dia quiser")
];
const PERCENTUAL = /\d\s*%|\bpor\s*cento\b/;

/* Nomes que nunca saem: lojas que não podem ser citadas, coisa que não existe no ar,
   assunto proibido, concorrentes do levantamento (mapa-oferta, seção 5), nomes internos. */
const PROIBIDAS: [RegExp, string][] = [
  [/\bitruck\b/, 'iTruck'],
  [/\brodolima\b/, 'Rodolima'],
  [/\bmarketplace\b/, 'marketplace'],
  [/\bmatch\b/, 'Match'],
  [/\bcomiss(?:ao|oes)\b/, 'comissão'],
  [/\bsolucao\b|\bsolucoes\b/, '"solução"'],
  /* Decisão do dono (05/11/2026): teste grátis fora da conversa por enquanto. */
  [/\bgratis\b|\bgratuit\w*|\bde\s+graca\b|\bperiodo\s+de\s+teste\b|\bteste\s+(?:sem\s+custo|liberado)\b/, 'teste grátis (fora por decisão do dono)'],
  [/\bconsulta\s+(?:pela|por|de)\s+placa\b/, 'consulta pela placa'],
  /* OLX e Webmotors são portais onde o lojista anuncia, não concorrentes do sistema: o Davi pode
     responder sobre eles (dono, 06/11). */
  [/\b(?:nstech|totvs|bsoft|ssw|brudam|truckpad)\b/, 'concorrente pelo nome'],
  [/\b(?:ycloud|z-?api|evolution\s*api|prompt|anthropic|openai|chatgpt|claude|gpt)\b/, 'nome interno'],
];

const TERMO_SENSIVEL = '(?:senha|senhas|cartao|cartoes|cpf|codigo\\s+de\\s+(?:verificacao|seguranca|acesso)|dados\\s+bancarios)';
const SENSIVEL = new RegExp(`\\b${TERMO_SENSIVEL}\\b`);
/* Verbo de pedir: "me passa a senha", "manda seu CPF". Só passa se a negação vier logo antes. */
const VERBO_DE_PEDIR = /\b(?:passa|passe|passar|manda|mande|mandar|envia|envie|enviar|informa|informe|informar|digita|digite|me\s+da|me\s+de)\b/g;
const NEGACAO_ANTES = /\b(?:nao|nunca|jamais|nem)\s+(?:\w+\s+){0,2}$/;
/* A frase que libera é a que NEGA O PEDIDO ("não peço", "nunca pedimos", "senha não precisa",
   "nunca a senha"), não qualquer "sem" solto ("sem compromisso: me passa a senha"). */
const NEGA_PEDIDO = /\b(?:nao|nunca|jamais|nem)\s+(?:\w+\s+){0,2}?(?:peco|pedimos|pede|pedem|pedir|precisa|precisamos|preciso|vai\s+precisar|solicit\w*)\b/;
const NEGA_TERMO = new RegExp(`\\b(?:nao|nunca|jamais|nem|sem)\\s+(?:\\w+\\s+)?${TERMO_SENSIVEL}\\b`);

/* "Não sou o Xavier, sou o assistente virtual dele" é a resposta honesta: o "não" antes libera. */
const FINGIR_GENTE: RegExp[] = [
  /(?<!\bnao\s)\bsou\s+o\s+xavier\b/,
  /\baqui\s+(?:e|eh)\s+o\s+xavier\b/,
  /\bnao\s+sou\s+(?:um\s+|o\s+)?(?:atendimento\s+automatico|automatico|atendente\s+virtual|virtual)\b/,
  /(?<!\bnao\s(?:e\s)?)\batendimento\s+humano\b/,
  /(?<!\bnao\s)\bsou\s+(?:um\s+|uma\s+)?(?:humano|humana|pessoa|gente|de\s+verdade|de\s+carne)\b/,
  /\bnao\s+sou\s+(?:um\s+|uma\s+)?(?:robo|bot|ia|inteligencia\s+artificial|maquina|assistente\s+virtual)\b/,
];
const ESQUECIMENTO = /\b(?:esqueci|esquecendo|me\s+esqueci)\b/;

const DOMINIO = /(?:https?:\/\/[^\s<>"']+|\b(?:www\.)?(?:[a-z0-9-]+\.)+(?:com|net|org|br|me|ly|io|app|link|site|info|co|gl|tv|biz|online|store|shop|xyz|ai|dev|page|to)\b(?:\/[^\s<>"']*)?)/g;
const HOSTS_LIBERADOS = new Set(['viapesados.com.br', 'www.viapesados.com.br']);

function semPontaFinal(u: string): string {
  return u.replace(/[.,;:!?)\]}>'"…]+$/, '');
}
function hostDe(u: string): string {
  return u.replace(/^https?:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '');
}
function chaveDoLink(u: string): string {
  return semPontaFinal(u.trim().toLowerCase()).replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/** Os links que aparecem num texto, como escritos (sem a pontuação do fim da frase). */
export function linksNoTexto(texto: string): string[] {
  return (plano(texto).match(DOMINIO) ?? []).map(semPontaFinal).filter(Boolean);
}

/** Link liberado: viapesados.com.br (com ou sem www, qualquer página) ou o link fixo da reunião. */
export function linkLiberado(link: string, linkReuniao?: string | null): boolean {
  const k = chaveDoLink(link);
  if (linkReuniao && k === chaveDoLink(linkReuniao)) return true;
  return HOSTS_LIBERADOS.has(hostDe(k));
}

/**
 * Confere o que o assistente vai mandar ANTES de sair. Nada de exceção: tudo que viola
 * entra na lista. Reprovou → uma nova tentativa com as explicações; reprovou de novo →
 * turno 'barrado' e chamar_xavier.
 *
 * "senha", "cartão" e "CPF" só passam numa frase que nega ("não peço senha, cartão nem
 * pagamento" é a resposta ao "é golpe?"); pedir, nunca.
 */
export function fiscal(mensagens: string[], ctx: ContextoFiscal = {}): ResultadoFiscal {
  const v: Violacao[] = [];
  const lista = Array.isArray(mensagens) ? mensagens : [];

  if (lista.length > LIMITES.MAX_MENSAGENS) {
    v.push({ regra: 'quantidade', mensagem: null, explicacao: `Mande no máximo ${LIMITES.MAX_MENSAGENS} balões; vieram ${lista.length}.` });
  }

  let perguntas = 0;
  let meuAmigo = 0;
  const temas = new Set<string>();

  lista.forEach((bruta, i) => {
    const m = limpo(String(bruta ?? ''));
    const p = plano(m);
    if (!m.trim()) {
      v.push({ regra: 'vazia', mensagem: i, explicacao: 'Balão vazio.' });
      return;
    }
    if (m.length > LIMITES.MAX_CARACTERES) {
      v.push({ regra: 'tamanho', mensagem: i, explicacao: `Balão com ${m.length} caracteres; o máximo é ${LIMITES.MAX_CARACTERES}. Encurte.` });
    }
    const linhas = m.split('\n').filter((l) => l.trim());
    if (linhas.length > LIMITES.MAX_LINHAS) {
      v.push({ regra: 'linhas', mensagem: i, explicacao: `Até ${LIMITES.MAX_LINHAS} linhas por balão; vieram ${linhas.length}.` });
    }
    const itens = linhas.filter((l) => /^\s*(?:[-*•·–]|\d+[.)])\s+/.test(l));
    if (itens.length > LIMITES.MAX_ITENS_DE_LISTA) {
      v.push({ regra: 'lista', mensagem: i, trecho: itens[0].trim(), explicacao: `Lista de no máximo ${LIMITES.MAX_ITENS_DE_LISTA} itens ("• "), curtos.` });
    }
    const md = m.match(/\*\*[^*]+\*\*|^\s*#{1,6}\s/m);
    if (md) {
      v.push({ regra: 'markdown', mensagem: i, trecho: md[0].trim(), explicacao: 'No WhatsApp o negrito é *um asterisco de cada lado*; nada de ** nem # título.' });
    }

    perguntas += (m.match(/\?+/g) ?? []).length;
    meuAmigo += (p.match(/\bmeu\s+amigo\b/g) ?? []).length;

    const pPreco = semPrecoPermitido(p, ctx.precoPermitido);
    for (const r of PRECO) {
      const achou = pPreco.match(r);
      if (achou) {
        const liberados = ([] as number[]).concat(ctx.precoPermitido ?? []);
        v.push({ regra: 'preco', mensagem: i, trecho: achou[0], explicacao: liberados.length
          ? `Só pode ${liberados.map((x) => `R$ ${x} por mês`).join(' ou ')}, escrito assim. Nada de desconto, outro valor ou número de dinheiro.`
          : 'Não diga valor nem número de dinheiro. O valor é mostrado na demonstração, junto com o sistema funcionando.' });
        break;
      }
    }
    for (const r of PRAZO) {
      const achou = p.match(r);
      if (achou) {
        v.push({ regra: 'prazo', mensagem: i, trecho: achou[0], explicacao: 'Não escreva número com dia, semana, mês ou ano, nem repetindo o que o lead disse: diga "uns dias", "esse tempo todo", "demora".' });
        break;
      }
    }
    const pct = p.match(PERCENTUAL);
    if (pct) v.push({ regra: 'percentual', mensagem: i, trecho: pct[0], explicacao: 'Sem porcentagem: não há número comprovado para citar.' });

    for (const link of linksNoTexto(m)) {
      if (!linkLiberado(link, ctx.linkReuniao)) {
        v.push({ regra: 'link', mensagem: i, trecho: link, explicacao: 'Só pode link de viapesados.com.br ou o link da reunião.' });
      }
    }

    for (const [r, nome] of PROIBIDAS) {
      const achou = p.match(r);
      if (achou) v.push({ regra: 'proibida', mensagem: i, trecho: achou[0], explicacao: `Não pode citar ${nome}.` });
    }

    for (const frase of p.split(/[.!?\n;:]+/)) {
      if (!SENSIVEL.test(frase)) continue;
      const pediu = [...frase.matchAll(VERBO_DE_PEDIR)].some((x) => !NEGACAO_ANTES.test(frase.slice(0, x.index)));
      if (pediu || !(NEGA_PEDIDO.test(frase) || NEGA_TERMO.test(frase))) {
        v.push({ regra: 'pedido_sensivel', mensagem: i, trecho: frase.trim(), explicacao: 'Nunca peça senha, cartão, CPF ou código. Só pode citar para dizer que NÃO pede ("não peço senha").' });
        break;
      }
    }

    for (const r of FINGIR_GENTE) {
      const achou = p.match(r);
      if (achou) {
        v.push({ regra: 'fingir_gente', mensagem: i, trecho: achou[0], explicacao: `Você é o ${PERSONA.nome}, atendente virtual do Via Pesados: nunca diga que é uma pessoa ou o Xavier. Se perguntarem, confirme que é virtual.` });
        break;
      }
    }
    const esq = p.match(ESQUECIMENTO);
    if (esq) v.push({ regra: 'esquecimento', mensagem: i, trecho: esq[0], explicacao: 'Não finja esquecimento.' });

    for (const [r, nome] of PALCO) {
      const achou = p.match(r);
      if (achou) v.push({ regra: 'palco', mensagem: i, trecho: achou[0], explicacao: `Tire isto: ${nome}.` });
    }
    /* Pergunta com opções ("o que mais te dá trabalho: anunciar, responder ou controlar?") não é
       lista de funções: só conta tema o balão que afirma. */
    if (!m.includes('?')) for (const [r, tema] of TEMAS_DO_SISTEMA) if (r.test(p)) temas.add(tema);
    if (ctx.podeOferecerHorario === false && DIA_CITADO.test(p) && HORA_CITADA.test(p)) {
      v.push({ regra: 'horario_cedo', mensagem: i, explicacao: `Ainda não é hora de oferecer horário: ${ctx.motivoDoHorario ?? 'falta entender a loja'}. Se ele pediu para comprar, fechar ou ver funcionando, registre o pedido (registrar: pedido) antes.` });
    }
  });
  if (ctx.soPerguntar) {
    const vendeu = lista.map((m) => plano(String(m ?? ''))).find((p) => /\bimagina\b/.test(p) || TEMAS_DO_SISTEMA.some(([r]) => r.test(p)));
    if (vendeu !== undefined) {
      v.push({ regra: 'vendendo', mensagem: null, explicacao: 'Ele está respondendo as perguntas e não perguntou nada: reconheça a resposta em poucas palavras e faça a próxima pergunta, num balão só. Nada de sistema, canal ou "imagina" agora; isso volta no convite.' });
    }
  }
  /* Perguntas fora de hora (dono, 06/11). Depois de marcar só passam: a escolha do horário
     novo (remarcar, com o horário oferecido no turno) e o esclarecimento do que ele
     perguntou, sem falar da loja. No turno da marcação, nenhuma. */
  /* Sem os links: um "?" dentro do link da reunião não é pergunta. */
  const planos = lista.map((b) => plano(String(b ?? '')).replace(/https?:\/\/\S+/g, ' '));
  const ofereceHorario = !ctx.marcandoAgora && planos.some((p) => HORA_CITADA.test(p));
  planos.forEach((p, i) => {
    for (const f of frasesQuePerguntam(p)) {
      if (ctx.reuniaoMarcada) {
        const daLoja = FALA_DA_LOJA.some((r) => r.test(f));
        const escolha = ofereceHorario && ESCOLHA_DE_HORARIO.test(f) && !FICHA_ANTES_DE_MARCAR.some((r) => r.test(f));
        const esclarece = !ctx.marcandoAgora && !!ctx.leadPerguntou && !daLoja;
        if (ctx.marcandoAgora || !(escolha || esclarece)) {
          v.push({ regra: 'pergunta_depois_de_marcar', mensagem: i, trecho: f.slice(0, 120), explicacao: ctx.marcandoAgora
            ? 'No Marcado não vai pergunta nenhuma: só o "Marcado!" e o link.'
            : 'A reunião já está marcada: não pergunte mais nada da loja (o Xavier vê o resto na reunião). Responda curto o que ele disse ou perguntou e se despeça ("Fechou, até segunda!"). Só cabe pergunta para remarcar, com os horários da lista.' });
          return;
        }
        continue;
      }
      const oracao = ultimaOracao(f);
      if (/\bquant[oa]s\b/.test(oracao)) continue; // "quantos caminhões no pátio?" é a pergunta do estoque
      if (FICHA_ANTES_DE_MARCAR.some((r) => r.test(oracao)) || (ctx.lojaConhecida && SO_A_CIDADE.test(oracao))) {
        v.push({ regra: 'pergunta_de_ficha', mensagem: i, trecho: f.slice(0, 120), explicacao: 'Antes da reunião, só as três perguntas da qualificação (nome da loja se não souber, estoque, dono ou vendedor). Pátio, cidade, Instagram, onde anuncia, quem decide e o que atrapalha o Xavier vê na reunião. Nunca pergunte o que dá para deduzir (quem tem 35 caminhões tem estoque).' });
        return;
      }
    }
  });
  if (ctx.antesDeMarcar && temas.size > 1) {
    v.push({ regra: 'despejo', mensagem: null, trecho: [...temas].join(' + '), explicacao: 'Uma coisa do sistema por resposta, a que resolve o que ele disse. Nada de lista: escolha uma.' });
  }

  if (perguntas > LIMITES.MAX_PERGUNTAS) {
    v.push({ regra: 'perguntas', mensagem: null, explicacao: `Uma pergunta por vez; vieram ${perguntas}.` });
  }
  if (meuAmigo > 1 || (meuAmigo > 0 && ctx.meuAmigoJaUsado)) {
    v.push({ regra: 'meu_amigo', mensagem: null, explicacao: '"Meu amigo" no máximo uma vez na conversa inteira, e já foi usado.' });
  }
  if (ctx.precisaApresentar && lista.length > 0) {
    const p0 = plano(String(lista[0] ?? ''));
    const avisa = /\batendimento\s+automatico\b|\b(?:atendente|assistente)\s+virtual\b|\binteligencia\s+artificial\b/.test(p0);
    if (!(avisa && new RegExp(`\\b${plano(PERSONA.nome)}\\b`).test(p0) && /\bvia\s+pesados\b/.test(p0))) {
      v.push({ regra: 'apresentacao', mensagem: 0, explicacao: `O primeiro balão precisa ter o cumprimento e "${PERSONA.apresentacao}"` });
    }
  }

  return { ok: v.length === 0, violacoes: v };
}

/** As violações num parágrafo, para a segunda tentativa da IA. */
export function explicarViolacoes(violacoes: Violacao[]): string {
  return violacoes
    .map((x) => `${x.mensagem === null ? 'No turno' : `No balão ${x.mensagem + 1}`}: ${x.explicacao}${x.trecho ? ` (trecho: "${x.trecho}")` : ''}`)
    .join('\n');
}

/* ── hora de São Paulo ────────────────────────────────────────── */

/* São Paulo é UTC-3 o ano inteiro (sem horário de verão desde 2019), como em regua.ts. */
const SP_MS = -3 * 60 * 60 * 1000;
const emSP = (d: Date) => new Date(d.getTime() + SP_MS);
/** Meia-noite de um dia de SP (ano, mês 0-11, dia) como instante UTC. */
const meiaNoiteSP = (a: number, m: number, d: number) => new Date(Date.UTC(a, m, d) - SP_MS);
const paraData = (x: Date | string) => (x instanceof Date ? x : new Date(x));

/** 08h–20h de São Paulo, qualquer dia da semana (fim de semana responde a quem escreveu). */
export function dentroDoHorario(agora = new Date()): boolean {
  return dentroDaJanela(agora);
}

/** O próximo instante dentro das 08h–20h (agora, se já está). */
export function proximoHorarioDeResposta(agora = new Date()): Date {
  return proximaAbertura(agora);
}

/** A última mensagem do lead foi há menos de 24h: texto livre ainda pode sair. */
export function janelaAberta(ultimaEntradaEm: Date | string | null | undefined, agora = new Date()): boolean {
  if (!ultimaEntradaEm) return false;
  const t = paraData(ultimaEntradaEm).getTime();
  if (Number.isNaN(t)) return false;
  return agora.getTime() - t < LIMITES.JANELA_META_MS;
}

export function podeResponderAgora(ultimaEntradaEm: Date | string | null | undefined, agora = new Date()): boolean {
  return dentroDoHorario(agora) && janelaAberta(ultimaEntradaEm, agora);
}

/** 00h de hoje em São Paulo, como instante (para somar o gasto do dia). */
export function inicioDoDiaSP(agora = new Date()): Date {
  const b = emSP(agora);
  return meiaNoiteSP(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
}

/**
 * Quanto esperar antes de pensar: 40 s desde a última mensagem, mas nunca além de
 * 2 min desde pendente_desde. 0 = pensar já.
 */
export function esperaDoAgrupamento(pendenteDesde: Date | string | null | undefined, agora = new Date()): number {
  if (!pendenteDesde) return LIMITES.ESPERA_AGRUPAMENTO_MS;
  const passou = agora.getTime() - paraData(pendenteDesde).getTime();
  return Math.max(0, Math.min(LIMITES.ESPERA_AGRUPAMENTO_MS, LIMITES.TETO_AGRUPAMENTO_MS - passou));
}

export type Pendente = { conversa_id: string; pendente_desde: string | Date; ultima_entrada_em: string | Date | null };

/**
 * A fila das pendentes (rotina das 08h e de 5 em 5 min): fora do horário ninguém é
 * respondido; dentro, a mais antiga primeiro, só com a janela de 24h aberta. As de
 * janela fechada saem em `expiradas` (não responder; registrar para o Xavier).
 */
export function filaDasPendentes<T extends Pendente>(lista: T[], agora = new Date()): { responder: T[]; expiradas: T[] } {
  if (!dentroDoHorario(agora)) return { responder: [], expiradas: [] };
  const ordenada = [...lista].sort((a, b) => paraData(a.pendente_desde).getTime() - paraData(b.pendente_desde).getTime());
  return {
    responder: ordenada.filter((p) => janelaAberta(p.ultima_entrada_em, agora)),
    expiradas: ordenada.filter((p) => !janelaAberta(p.ultima_entrada_em, agora)),
  };
}

/* ── agenda ───────────────────────────────────────────────────── */

export type Agenda = Pick<AssistenteConfig,
  'dias_semana' | 'hora_inicio' | 'hora_fim' | 'duracao_min' | 'folga_min_horas' | 'max_reunioes_dia'>;

export type ReuniaoMarcada = {
  id?: string | null;
  inicio: Date | string;
  duracao_min?: number | null;
  status?: string | null;
};

export type OpcoesDaAgenda = {
  /** Na remarcação, a própria reunião não conta como conflito nem no teto do dia. */
  ignorarReuniaoId?: string | null;
  /** De quanto em quanto tempo nasce um horário candidato (padrão 30 min). */
  passoMin?: number;
  /** Distância mínima entre dois horários sugeridos no mesmo dia (padrão 240 min), para variar. */
  espacoMin?: number;
  /** Quantos horários sugeridos por dia, no máximo (padrão 2: um cedo, um mais tarde). */
  maxPorDia?: number;
  /** Até quantos dias à frente procurar/aceitar (padrão 21). */
  diasAFrente?: number;
};

/** 'HH:MM' ou 'HH:MM:SS' → minutos do dia. */
export function minutosDoDia(hhmm: string): number {
  const [h, m] = String(hhmm ?? '').split(':').map((x) => Number(x));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** 1 = segunda … 7 = domingo, no dia de São Paulo (igual ao isodow do Postgres). */
export function diaDaSemanaSP(d: Date): number {
  const w = emSP(d).getUTCDay();
  return w === 0 ? 7 : w;
}

const OCUPA = (r: ReuniaoMarcada) => String(r.status ?? 'agendada') !== 'cancelada';
const dataSP = (d: Date) => { const b = emSP(d); return `${b.getUTCFullYear()}-${b.getUTCMonth()}-${b.getUTCDate()}`; };

function motivoDeRecusa(inicio: Date, agora: Date, agenda: Agenda, reunioes: ReuniaoMarcada[], op: OpcoesDaAgenda): string | null {
  if (Number.isNaN(inicio.getTime())) return 'data inválida';
  if (inicio.getUTCSeconds() !== 0 || inicio.getUTCMilliseconds() !== 0) return 'horário quebrado';
  const dias = (agenda.dias_semana ?? []).map((n) => (Number(n) === 0 ? 7 : Number(n)));
  if (!dias.includes(diaDaSemanaSP(inicio))) return 'dia sem reunião';
  const b = emSP(inicio);
  const ini = b.getUTCHours() * 60 + b.getUTCMinutes();
  const dur = Math.max(1, Number(agenda.duracao_min) || 15);
  if (ini < minutosDoDia(agenda.hora_inicio) || ini + dur > minutosDoDia(agenda.hora_fim)) return 'fora do expediente';
  if (inicio.getTime() < agora.getTime() + (Number(agenda.folga_min_horas) || 0) * 3_600_000) return 'em cima da hora';
  if (inicio.getTime() > agora.getTime() + (op.diasAFrente ?? 21) * 86_400_000) return 'longe demais';
  const fim = inicio.getTime() + dur * 60_000;
  const outras = reunioes.filter((r) => OCUPA(r) && !(op.ignorarReuniaoId && r.id === op.ignorarReuniaoId));
  for (const r of outras) {
    const s = paraData(r.inicio).getTime();
    const e = s + Math.max(1, Number(r.duracao_min) || dur) * 60_000;
    if (inicio.getTime() < e && s < fim) return 'conflito';
  }
  const doDia = outras.filter((r) => dataSP(paraData(r.inicio)) === dataSP(inicio)).length;
  if (doDia >= (Number(agenda.max_reunioes_dia) || 1)) return 'dia cheio';
  return null;
}

/**
 * O horário pode ser marcado? Confere tudo: dia da semana, expediente (a reunião inteira
 * cabe antes de hora_fim), folga mínima, até 21 dias à frente, conflito com reunião não
 * cancelada e teto do dia. É a trava do marcar_reuniao (aceita qualquer minuto cheio,
 * não só os sugeridos).
 */
export function horarioLivre(
  inicio: Date | string, agora: Date, agenda: Agenda, reunioes: ReuniaoMarcada[], opcoes: OpcoesDaAgenda = {},
): boolean {
  return motivoDeRecusa(paraData(inicio), agora, agenda, reunioes ?? [], opcoes) === null;
}

/** Igual a horarioLivre, mas diz por quê não (null = pode). */
export function porQueNaoPode(
  inicio: Date | string, agora: Date, agenda: Agenda, reunioes: ReuniaoMarcada[], opcoes: OpcoesDaAgenda = {},
): string | null {
  return motivoDeRecusa(paraData(inicio), agora, agenda, reunioes ?? [], opcoes);
}

/**
 * Os próximos n horários para oferecer, em ordem. Candidatos a cada 30 min desde
 * hora_inicio; por dia no máximo 2 sugeridos, a pelo menos 4h um do outro (variedade:
 * "amanhã 9h ou quinta 13h"). Todos passam por horarioLivre.
 */
export function horariosLivres(
  agora: Date, agenda: Agenda, reunioes: ReuniaoMarcada[], n: number = LIMITES.HORARIOS_OFERECIDOS, opcoes: OpcoesDaAgenda = {},
): Date[] {
  const passo = Math.max(5, opcoes.passoMin ?? 30);
  const espaco = Math.max(0, opcoes.espacoMin ?? 240);
  const porDia = Math.max(1, opcoes.maxPorDia ?? 2);
  const diasAFrente = opcoes.diasAFrente ?? 21;
  const saida: Date[] = [];
  const hoje = emSP(agora);
  const ini = minutosDoDia(agenda.hora_inicio);
  const fim = minutosDoDia(agenda.hora_fim);
  for (let d = 0; d <= diasAFrente && saida.length < n; d++) {
    const meia = meiaNoiteSP(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + d);
    let ultimoNoDia: number | null = null;
    let noDia = 0;
    for (let m = ini; m < fim && saida.length < n && noDia < porDia; m += passo) {
      const h = new Date(meia.getTime() + m * 60_000);
      if (ultimoNoDia !== null && m - ultimoNoDia < espaco) continue;
      if (motivoDeRecusa(h, agora, agenda, reunioes ?? [], opcoes) === null) {
        saida.push(h);
        ultimoNoDia = m;
        noDia++;
      }
    }
  }
  return saida;
}

const DIAS_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "terça, 04/11, 10h" / "quarta, 05/11, 16h30" — como o horário aparece para a IA e na tela. */
export function horarioFalado(d: Date): string {
  const b = emSP(d);
  const dd = String(b.getUTCDate()).padStart(2, '0');
  const mm = String(b.getUTCMonth() + 1).padStart(2, '0');
  const h = b.getUTCHours();
  const mi = b.getUTCMinutes();
  return `${DIAS_PT[b.getUTCDay()]}, ${dd}/${mm}, ${h}h${mi ? String(mi).padStart(2, '0') : ''}`;
}

/**
 * Quais horários livres aparecem nos textos do assistente. Em cada balão, cada hora
 * ("9h", "10:00", "10 horas", "16h30") se liga ao dia citado logo antes dela (nome do dia,
 * "hoje", "amanhã", "dia 5", "05/11") ou, sem dia antes, ao primeiro dia depois ("16h de
 * quarta"). "Amanhã 9h ou quinta 13h" → amanhã 9h e quinta 13h. Hora sem dia não conta.
 * Serve para saber que houve oferta; quem trava a marcação é horarioLivre.
 */
export function horariosCitados(textos: string[], livres: Date[], agora = new Date()): Date[] {
  const hojeSP = emSP(agora);
  const amanhaSP = emSP(new Date(inicioDoDiaSP(agora).getTime() + 36 * 3_600_000));
  const mesmoDia = (a: Date, b: Date) =>
    a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
  const NOMES = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const DIA = /\b(?:(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?|(hoje)|(amanha)|dia\s+(\d{1,2})|(\d{1,2})\/(\d{1,2}))\b/g;
  const HORA = /\b(\d{1,2})(?:\s*(?:h|:)\s*(\d{2})\b|\s*h(?:s|oras?)?\b|\s+horas?\b)/g;

  type DiaCitado = { pos: number; casa: (b: Date) => boolean };
  type Par = { casa: (b: Date) => boolean; h: number; mi: number };
  const pares: Par[] = [];
  for (const bruto of textos ?? []) {
    const p = plano(String(bruto ?? ''));
    const dias: DiaCitado[] = [];
    for (const m of p.matchAll(DIA)) {
      const pos = m.index ?? 0;
      if (m[1]) { const w = NOMES.indexOf(m[1]); dias.push({ pos, casa: (b) => b.getUTCDay() === w }); }
      else if (m[2]) dias.push({ pos, casa: (b) => mesmoDia(b, hojeSP) });
      else if (m[3]) dias.push({ pos, casa: (b) => mesmoDia(b, amanhaSP) });
      else if (m[4]) { const d = Number(m[4]); dias.push({ pos, casa: (b) => b.getUTCDate() === d }); }
      else if (m[5]) { const d = Number(m[5]), mo = Number(m[6]); dias.push({ pos, casa: (b) => b.getUTCDate() === d && b.getUTCMonth() + 1 === mo }); }
    }
    if (!dias.length) continue;
    for (const m of p.matchAll(HORA)) {
      const pos = m.index ?? 0;
      const h = Number(m[1]);
      const mi = m[2] ? Number(m[2]) : 0;
      if (h > 23 || mi > 59) continue;
      const antes = dias.filter((d) => d.pos < pos);
      const dia = antes.length ? antes[antes.length - 1] : dias.find((d) => d.pos > pos);
      if (dia) pares.push({ casa: dia.casa, h, mi });
    }
  }
  return livres.filter((slot) => {
    const b = emSP(slot);
    return pares.some((x) => x.casa(b) && x.h === b.getUTCHours() && x.mi === b.getUTCMinutes());
  });
}

/* ── etapa e card ─────────────────────────────────────────────── */

export type FatosDaConversa = {
  etapa: Etapa;
  dores?: unknown[] | null;
  prova_enviada?: boolean | null;
  horarios_oferecidos?: unknown[] | null;
  reuniao_id?: string | null;
};

const ORDEM_DA_ETAPA: Record<string, number> = { conversa: 0, dor: 1, prova: 2, compromisso: 3, agendado: 4, entregue: 5 };

export const ehLateral = (e: Etapa | string): boolean => (ETAPAS_LATERAIS as readonly string[]).includes(e);

/**
 * A etapa que o código calcula a partir do que foi registrado. Só anda para a frente.
 * Reunião gravada → agendado; horário oferecido → compromisso; prova → prova; dor → dor.
 * Estado lateral (pausa, frio, perdido, saiu, com_xavier) fica como está: só sai por
 * ação explícita. Para "Devolver ao assistente", chame com etapa 'conversa'.
 */
export function proximaEtapa(estado: FatosDaConversa): Etapa {
  const atual = estado.etapa ?? 'conversa';
  if (ehLateral(atual)) return atual;
  const calculada: Etapa = estado.reuniao_id ? 'agendado'
    : (estado.horarios_oferecidos?.length ?? 0) > 0 ? 'compromisso'
    : estado.prova_enviada ? 'prova'
    : (estado.dores?.length ?? 0) > 0 ? 'dor'
    : 'conversa';
  return (ORDEM_DA_ETAPA[calculada] ?? 0) > (ORDEM_DA_ETAPA[atual] ?? 0) ? calculada : atual;
}

export type EstagioDoCard = 'contato' | 'oportunidade' | 'reuniao' | 'perdido';

/**
 * Para onde o card vai (prospects.stage) em cada etapa; null = não cria nem mexe.
 * O card nasce na primeira dor ('contato'), vai a 'oportunidade' ao oferecer horário e
 * a 'reuniao' ao marcar. Perdido/saiu → 'perdido'. Teste e Fechado ficam com gente.
 */
export function estagioDoCard(etapa: Etapa): EstagioDoCard | null {
  switch (etapa) {
    case 'dor':
    case 'prova': return 'contato';
    case 'compromisso': return 'oportunidade';
    case 'agendado':
    case 'entregue': return 'reuniao';
    case 'perdido':
    case 'saiu': return 'perdido';
    default: return null;
  }
}

/* ── travas da conversa ───────────────────────────────────────── */

export type MensagemParaTrava = {
  direcao: 'entrada' | 'saida' | string;
  enviada_por?: string | null;
  turno_id?: string | null;
  created_at: string | Date;
};

/**
 * Alguém da equipe escreveu na conversa depois de `desde` (último turno do assistente,
 * ou quando ele foi ligado): o assistente sai (modo 'desligado', motivo 'voce_assumiu').
 * Conta só saída com enviada_por (gente) e sem turno_id (não é texto do assistente
 * aprovado). Modelo automático (enviada_por nulo) não conta.
 */
export function humanoAssumiu(mensagens: MensagemParaTrava[], desde: Date | string | null | undefined): boolean {
  const t0 = desde ? paraData(desde).getTime() : -Infinity;
  return (mensagens ?? []).some((m) =>
    m.direcao === 'saida' && !!m.enviada_por && !m.turno_id && paraData(m.created_at).getTime() > t0);
}

/** 25 mensagens do assistente sem reunião marcada: hora de chamar o Xavier. */
export function passouDoTeto(mensagensEnviadas: number, etapa: Etapa): boolean {
  if (ehLateral(etapa)) return false;
  return mensagensEnviadas >= LIMITES.MAX_MENSAGENS_SEM_AGENDAR && (ORDEM_DA_ETAPA[etapa] ?? 0) < ORDEM_DA_ETAPA.agendado;
}

/**
 * O que fazer quando pedem preço (contando o pedido atual).
 * 1º: teste grátis + "o valor o Xavier mostra nos 15 minutos"; 2º: oferecer o horário
 * mais cedo; 3º em diante: chamar_xavier. 0 → null.
 */
export function respostaAoPreco(pedidos: number): 'valor_com_o_xavier' | 'horario_mais_cedo' | 'chamar_xavier' | null {
  if (!pedidos || pedidos < 1) return null;
  if (pedidos === 1) return 'valor_com_o_xavier';
  if (pedidos === 2) return 'horario_mais_cedo';
  return 'chamar_xavier';
}

/** O gasto do dia bateu o teto (teto 0 = nada pode ser gasto). */
export function tetoDoDiaAtingido(gastoHoje: number, tetoUsdDia: number): boolean {
  return Number(gastoHoje) >= Math.max(0, Number(tetoUsdDia) || 0);
}

/* ── custo ────────────────────────────────────────────────────── */

export type Uso = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
};

type Preco = { entrada: number; saida: number; cacheLeitura: number };
/** Dólares por milhão de tokens. Escrita de cache: 1,25× a entrada (5 min) ou 2× (1 h). */
export const PRECOS: Record<string, Preco> = {
  'claude-opus-5-5': { entrada: 4, saida: 20, cacheLeitura: 0.2 },
  'claude-sonnet-5-5': { entrada: 2, saida: 10, cacheLeitura: 0.2 },
  'claude-haiku-5-5': { entrada: 0.1, saida: 0.5, cacheLeitura: 0.01 },
  /* Os modelos de reserva (fallback do lado do servidor) respondem a 5/25. */
  'claude-opus-5': { entrada: 5, saida: 25, cacheLeitura: 0.5 },
  'claude-opus-4-8': { entrada: 5, saida: 25, cacheLeitura: 0.5 },
};
/* Haiku 5.5 tem outra tabela quando o pedido passa de 100 mil tokens de entrada. */
const HAIKU_LONGO: Preco = { entrada: 0.5, saida: 2.5, cacheLeitura: 0.05 };

function precoDo(modelo: string, tokensDeEntrada: number): Preco {
  const m = String(modelo ?? '').toLowerCase();
  const chave = Object.keys(PRECOS).find((k) => m === k)
    ?? Object.keys(PRECOS).find((k) => m.startsWith(k + '-') || m.startsWith(k + '@') || m.endsWith(k));
  if (chave === 'claude-haiku-5-5' && tokensDeEntrada > 100_000) return HAIKU_LONGO;
  // Modelo desconhecido: conta pelo Opus (o mais caro da tabela), para o teto nunca subestimar.
  return PRECOS[chave ?? 'claude-opus-5-5'];
}

/**
 * Quanto custou, em dólares (6 casas). Aceita um `usage` ou a lista dos `usage` de cada
 * chamada do turno (cada chamada é tarifada por si: a faixa do Haiku depende do tamanho
 * de cada pedido).
 */
export function custo(usage: Uso | Uso[] | null | undefined, modelo: string): number {
  if (!usage) return 0;
  if (Array.isArray(usage)) return Math.round(usage.reduce((s, u) => s + custo(u, modelo), 0) * 1e6) / 1e6;
  const n = (x: number | null | undefined) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const entrada = n(usage.input_tokens);
  const saida = n(usage.output_tokens);
  const leitura = n(usage.cache_read_input_tokens);
  const escrita = n(usage.cache_creation_input_tokens);
  const umaHora = Math.min(escrita, n(usage.cache_creation?.ephemeral_1h_input_tokens));
  const cincoMin = escrita - umaHora;
  const p = precoDo(modelo, entrada + leitura + escrita);
  const total = (entrada * p.entrada + saida * p.saida + leitura * p.cacheLeitura
    + cincoMin * p.entrada * 1.25 + umaHora * p.entrada * 2) / 1_000_000;
  return Math.round(total * 1e6) / 1e6;
}

/** Soma os `usage` das chamadas de um turno (para gravar um só em assistente_turnos.usage). */
export function somarUso(usos: (Uso | null | undefined)[]): Uso {
  const n = (x: number | null | undefined) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  return (usos ?? []).reduce<Uso>((s, u) => ({
    input_tokens: n(s.input_tokens) + n(u?.input_tokens),
    output_tokens: n(s.output_tokens) + n(u?.output_tokens),
    cache_read_input_tokens: n(s.cache_read_input_tokens) + n(u?.cache_read_input_tokens),
    cache_creation_input_tokens: n(s.cache_creation_input_tokens) + n(u?.cache_creation_input_tokens),
    cache_creation: {
      ephemeral_5m_input_tokens: n(s.cache_creation?.ephemeral_5m_input_tokens) + n(u?.cache_creation?.ephemeral_5m_input_tokens),
      ephemeral_1h_input_tokens: n(s.cache_creation?.ephemeral_1h_input_tokens) + n(u?.cache_creation?.ephemeral_1h_input_tokens),
    },
  }), { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } });
}

/* ── números de teste ─────────────────────────────────────────── */

/**
 * O número como o sistema grava (só dígitos, com 55), ou null se não for telefone do Brasil.
 * Aceita o que se digita na tela: "(27) 99724-6060", "27997246060", "+55 27 99724-6060".
 */
export function telefoneDeTeste(bruto: string): string | null {
  let n = String(bruto ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (n.length === 10 || n.length === 11) n = '55' + n;
  return /^55\d{10,11}$/.test(n) ? n : null;
}

/** As duas grafias de um celular: o WhatsApp entrega alguns sem o 9 depois do DDD. */
function grafias(tel: string): string[] {
  if (tel.length === 13 && tel[4] === '9') return [tel, tel.slice(0, 4) + tel.slice(5)];
  if (tel.length === 12 && /[6-9]/.test(tel[4])) return [tel, tel.slice(0, 4) + '9' + tel.slice(4)];
  return [tel];
}

/**
 * A conversa é de um número de teste do dono? (com ou sem o 9). O telefone da conversa já
 * vem gravado com o código do país: 11 dígitos ali é número de fora, nunca ganha o 55.
 */
export function ehNumeroDeTeste(telefone: string | null | undefined, lista: readonly string[] | null | undefined): boolean {
  const t = String(telefone ?? '').replace(/\D/g, '');
  if (!/^55\d{10,11}$/.test(t) || !lista?.length) return false;
  const daConversa = new Set(grafias(t));
  return lista.some((x) => {
    const n = telefoneDeTeste(x);
    return !!n && grafias(n).some((g) => daConversa.has(g));
  });
}
