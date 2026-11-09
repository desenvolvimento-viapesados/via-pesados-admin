/**
 * As peças do assistente de vendas que falam com o mundo: banco, WhatsApp (YCloud,
 * Evolution, Meta), transcrição de áudio, Claude e o CRM (card, reunião, nota).
 *
 * Quem usa: assistente-responder (o motor), assistente-acao (os botões da tela) e
 * assistente-pendentes (a rotina das 08h e de 5 em 5 minutos).
 *
 * As regras puras (fiscal, agenda, etapa, custo, janela) estão em assistente-regras.ts,
 * que os testes do painel conferem. O roteiro e as ferramentas, em assistente-roteiro.ts.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { evolution, paraEnvio } from './evolution.ts';
import { baixarMidiaYCloud, configYCloud, enviarTextoPorYCloud } from './ycloud.ts';
import {
  type AcaoDoTurno, type Agenda, type AssistenteConfig, type AssistenteConversa, type AssistenteFato,
  type ItemCitado, type ReuniaoMarcada, type Situacao, type Uso,
  conferirCitacoes, cortarMemoria, custo, dentroDoHorario, estagioDoCard, horarioFalado, horarioLivre,
  horariosCitados, horariosLivres, janelaAberta, LIMITES, normalizarTexto, porQueNaoPode, proximaEtapa,
  neutro, respostaAoPreco, ROTULO_DA_ETAPA, temFallbackNoServidor, textoDaMensagem, citacaoConfere,
  PEDIDOS, pedidoMaisQuente, type Pedido, falaDoPreco, precoDeHoje,
} from './assistente-regras.ts';
import { INSTRUCOES_DOSSIE, SCHEMA_DOSSIE } from './assistente-roteiro.ts';
import { enviarTemplate, statusDoModelo } from './wa.ts';
import { BUCKET, extensaoDe, guardarMidia, paraBase64, tipoBase } from './assistente-midia.ts';

// deno-lint-ignore no-explicit-any
export type Db = any;

/** Como as mensagens do assistente aparecem na caixa do CRM. */
export const REMETENTE = 'Assistente';
/** Quem assina na caixa as mensagens automáticas da prospecção (prospeccao.ts, REMETENTE_AGENTE). */
export const REMETENTE_PROSPECCAO = 'Agente de prospecção';
const GRAPH = 'https://graph.facebook.com/v21.0';

const agoraISO = () => new Date().toISOString();
export const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── linhas do banco ─────────────────────────────────────────────── */

export type Mensagem = {
  id: string;
  conversa_id: string;
  direcao: 'entrada' | 'saida';
  tipo: string;
  conteudo: string | null;
  transcricao: string | null;
  media_url: string | null;
  media_salva: string | null;
  metadata: Record<string, unknown> | null;
  enviada_por: string | null;
  enviada_por_nome: string | null;
  turno_id: string | null;
  provider_message_id: string | null;
  created_at: string;
};
export type Instancia = { id: string; nome: string; origem: string; evolution_instance: string | null; cloud_phone_number_id: string | null };
export type Conversa = {
  id: string; telefone: string; nome: string | null; instancia_id: string; prospect_id: string | null;
  frente: 'lojista' | 'transportadora'; fixada: boolean;
};
export type Loja = { id: string; nome: string; cidade: string | null; uf: string | null; dados: Record<string, unknown> | null; status: string };

const CAMPOS_MSG =
  'id, conversa_id, direcao, tipo, conteudo, transcricao, media_url, media_salva, metadata, enviada_por, enviada_por_nome, turno_id, provider_message_id, created_at';

/** Numeric chega como texto pelo PostgREST; aqui tudo vira número. */
export async function lerConfig(db: Db): Promise<AssistenteConfig | null> {
  const { data } = await db.from('assistente_config').select('*').eq('id', 1).maybeSingle();
  if (!data) return null;
  return {
    ...data,
    teto_usd_dia: Number(data.teto_usd_dia),
    duracao_min: Number(data.duracao_min),
    folga_min_horas: Number(data.folga_min_horas),
    max_reunioes_dia: Number(data.max_reunioes_dia),
    dias_semana: (data.dias_semana ?? []).map(Number),
    telefones_teste: (data.telefones_teste ?? []).map(String),
    preco_mensal: data.preco_mensal == null ? null : Number(data.preco_mensal),
    preco_cheio: data.preco_cheio == null ? null : Number(data.preco_cheio),
  } as AssistenteConfig;
}

export async function lerEstado(db: Db, conversaId: string): Promise<AssistenteConversa | null> {
  const { data } = await db.from('assistente_conversas').select('*').eq('conversa_id', conversaId).maybeSingle();
  if (!data) return null;
  return { ...data, custo_usd: Number(data.custo_usd ?? 0) } as AssistenteConversa;
}

export async function salvarEstado(db: Db, conversaId: string, patch: Partial<AssistenteConversa>) {
  const { error } = await db.from('assistente_conversas').update(patch).eq('conversa_id', conversaId);
  if (error) throw new Error(`assistente_conversas: ${error.message}`);
}

/**
 * A conversa, o número por onde ela fala e as mensagens (as últimas 400, em ordem). Teste
 * recomeçado do zero: só as mensagens de depois do recomeço (historico_desde).
 */
export async function carregarConversa(db: Db, conversaId: string):
  Promise<{ conversa: Conversa; inst: Instancia; msgs: Mensagem[] } | null> {
  const { data: conversa } = await db.from('wa_conversas')
    .select('id, telefone, nome, instancia_id, prospect_id, frente, fixada').eq('id', conversaId).maybeSingle();
  if (!conversa) return null;
  const { data: inst } = await db.from('wa_instancias')
    .select('id, nome, origem, evolution_instance, cloud_phone_number_id').eq('id', conversa.instancia_id).maybeSingle();
  if (!inst) return null;
  const { data: est } = await db.from('assistente_conversas').select('historico_desde').eq('conversa_id', conversaId).maybeSingle();
  let consulta = db.from('wa_mensagens').select(CAMPOS_MSG).eq('conversa_id', conversaId);
  if (est?.historico_desde) consulta = consulta.gte('created_at', est.historico_desde);
  const { data: msgs } = await consulta.order('created_at', { ascending: false }).limit(400);
  return { conversa, inst, msgs: ((msgs ?? []) as Mensagem[]).reverse() };
}

export async function lerLoja(db: Db, lojaId: string | null): Promise<Loja | null> {
  if (!lojaId) return null;
  const { data } = await db.from('prospeccao_lojas').select('id, nome, cidade, uf, dados, status').eq('id', lojaId).maybeSingle();
  return data ?? null;
}

export async function lerFatos(db: Db): Promise<AssistenteFato[]> {
  const { data } = await db.from('assistente_fatos').select('*').eq('ativo', true)
    .order('ordem', { ascending: true }).order('tema', { ascending: true });
  return (data ?? []) as AssistenteFato[];
}

export function ultimaEntradaEm(msgs: Mensagem[]): string | null {
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].direcao === 'entrada') return msgs[i].created_at;
  return null;
}

/* ── chaves (a tela pergunta se existem; nunca vê o valor) ───────── */

export function chaveDaIA(): boolean {
  return !!Deno.env.get('ANTHROPIC_API_KEY');
}

type Transcritor = { nome: 'groq' | 'openai'; url: string; chave: string; modelo: string };
export function transcritor(): Transcritor | null {
  const groq = Deno.env.get('GROQ_API_KEY');
  if (groq) return { nome: 'groq', url: 'https://api.groq.com/openai/v1/audio/transcriptions', chave: groq, modelo: 'whisper-large-v3-turbo' };
  const openai = Deno.env.get('OPENAI_API_KEY');
  if (openai) return { nome: 'openai', url: 'https://api.openai.com/v1/audio/transcriptions', chave: openai, modelo: 'gpt-4o-mini-transcribe' };
  return null;
}

/* ── mídia: baixar na hora, guardar, transcrever ─────────────────── */

/** Os bytes de um áudio ou foto: do bucket, se já guardado; senão do provedor (e guarda). */
export async function bytesDaMensagem(db: Db, m: Mensagem, inst: Instancia): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const mimeGravado = typeof m.metadata?.mime === 'string' ? String(m.metadata.mime) : null;
  if (m.media_salva) {
    const { data } = await db.storage.from(BUCKET).download(m.media_salva);
    if (data) return { bytes: new Uint8Array(await data.arrayBuffer()), mime: tipoBase(mimeGravado ?? data.type) };
  }
  let baixado: { bytes: Uint8Array; tipo: string } | null = null;
  try {
    if (inst.origem === 'ycloud' && m.media_url) {
      const cfg = configYCloud();
      if (cfg) baixado = await baixarMidiaYCloud(cfg, m.media_url);
    } else if (inst.origem === 'cloud_api' && typeof m.metadata?.media_id === 'string') {
      const token = Deno.env.get('META_WABA_TOKEN');
      if (token) {
        const meta = await fetch(`${GRAPH}/${encodeURIComponent(String(m.metadata.media_id))}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
        }).then((r) => r.json()).catch(() => null);
        if (meta?.url) {
          const r = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25_000) });
          if (r.ok) baixado = { bytes: new Uint8Array(await r.arrayBuffer()), tipo: meta.mime_type ?? r.headers.get('content-type') ?? '' };
        }
      }
    }
    /* Evolution: o arquivo vem em base64 dentro do próprio evento e o wa-receber já
       guarda na hora — o link do WhatsApp é cifrado e não serve para baixar depois. */
  } catch (e) {
    console.warn('assistente: mídia não baixou', m.id, e instanceof Error ? e.message : e);
  }
  if (!baixado) return null;
  const mime = tipoBase(mimeGravado ?? baixado.tipo);
  await guardarMidia(db, m.conversa_id, m.id, baixado.bytes, mime);
  return { bytes: baixado.bytes, mime };
}

/** Uma transcrição, pela API compatível com a da OpenAI. Null se não tem chave ou falhou. */
export async function transcrever(bytes: Uint8Array, mime: string): Promise<string | null> {
  const t = transcritor();
  if (!t) return null;
  const form = new FormData();
  form.append('file', new Blob([bytes as Uint8Array<ArrayBuffer>], { type: tipoBase(mime) || 'audio/ogg' }), `audio.${extensaoDe(mime) === 'bin' ? 'ogg' : extensaoDe(mime)}`);
  form.append('model', t.modelo);
  form.append('language', 'pt');
  form.append('response_format', 'json');
  try {
    const r = await fetch(t.url, { method: 'POST', headers: { Authorization: `Bearer ${t.chave}` }, body: form, signal: AbortSignal.timeout(45_000) });
    const d = await r.json().catch(() => null);
    if (!r.ok) { console.warn('assistente: transcrição recusada', r.status, d?.error?.message ?? ''); return null; }
    const texto = String(d?.text ?? '').trim();
    return texto || null;
  } catch (e) {
    console.warn('assistente: transcrição falhou', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Transcreve os áudios de entrada que ainda não têm transcrição (os 10 mais recentes).
 * Grava em wa_mensagens.transcricao (a tela mostra) e atualiza a lista em memória.
 * Devolve os ids que ficaram sem transcrição.
 */
export async function transcreverAudios(db: Db, msgs: Mensagem[], inst: Instancia, prazo = Infinity): Promise<string[]> {
  const faltam = msgs.filter((m) => m.direcao === 'entrada' && m.tipo === 'audio' && !m.transcricao).slice(-10);
  const sem: string[] = [];
  for (const m of faltam) {
    /* A função tem limite de relógio: o que não deu tempo fica para o próximo turno. */
    if (Date.now() > prazo) { sem.push(m.id); continue; }
    const midia = await bytesDaMensagem(db, m, inst);
    const texto = midia ? await transcrever(midia.bytes, midia.mime) : null;
    if (texto) {
      m.transcricao = texto;
      await db.from('wa_mensagens').update({ transcricao: texto }).eq('id', m.id);
    } else sem.push(m.id);
  }
  return sem;
}

const IMAGEM_ACEITA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const IMAGEM_MAX_BYTES = 3_700_000; // o limite da API é 5 MB em base64

/** As até 3 fotos de entrada mais recentes, prontas para a IA ver. */
export async function imagensRecentes(db: Db, msgs: Mensagem[], inst: Instancia):
  Promise<{ mensagemId: string; quando: string; legenda: string | null; base64: string; mime: string }[]> {
  const fotos = msgs.filter((m) => m.direcao === 'entrada' && m.tipo === 'imagem').slice(-LIMITES.MAX_IMAGENS);
  const saida = [];
  for (const m of fotos) {
    const midia = await bytesDaMensagem(db, m, inst);
    if (!midia || !IMAGEM_ACEITA.has(midia.mime) || midia.bytes.length > IMAGEM_MAX_BYTES) continue;
    const legenda = m.conteudo && !/^\[[a-z_]+\]$/i.test(m.conteudo.trim()) ? m.conteudo : null;
    saida.push({ mensagemId: m.id, quando: m.created_at, legenda, base64: paraBase64(midia.bytes), mime: midia.mime });
  }
  return saida;
}

/* ── enviar ──────────────────────────────────────────────────────── */

/**
 * Manda texto livre pelo número da conversa e grava na caixa do CRM como mensagem do
 * assistente (turno_id + remetente "Assistente"). Quem chama confere antes a janela
 * das 08h–20h e as 24h da Meta.
 */
export async function enviarTexto(db: Db, conversa: Conversa, inst: Instancia, texto: string, turnoId: string): Promise<string | null> {
  let providerId: string | null = null;
  if (inst.origem === 'ycloud') {
    const cfg = configYCloud();
    if (!cfg) throw new Error('O número oficial está sem as credenciais da YCloud.');
    providerId = (await enviarTextoPorYCloud(cfg, { para: conversa.telefone, texto })).id || null;
  } else if (inst.origem === 'evolution') {
    if (!inst.evolution_instance) throw new Error('Este número não tem instância conectada.');
    const d = await evolution('message/sendText', inst.evolution_instance, 'POST', { number: paraEnvio(conversa.telefone), text: texto }) as { key?: { id?: string } };
    providerId = d?.key?.id ?? null;
  } else {
    const token = Deno.env.get('META_WABA_TOKEN');
    if (!token || !inst.cloud_phone_number_id) throw new Error('O número da API antiga está sem credenciais.');
    const r = await fetch(`${GRAPH}/${inst.cloud_phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: conversa.telefone, type: 'text', text: { body: texto } }),
      signal: AbortSignal.timeout(25_000),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(String(d?.error?.message ?? 'A Meta recusou o envio.'));
    providerId = d?.messages?.[0]?.id ?? null;
  }

  const agora = agoraISO();
  const { error } = await db.from('wa_mensagens').insert({
    conversa_id: conversa.id, instancia_id: inst.id, direcao: 'saida', tipo: 'texto', conteudo: texto,
    provider_message_id: providerId, status: 'enviada', enviada_por_nome: REMETENTE, turno_id: turnoId, created_at: agora,
  });
  /* O eco da Evolution às vezes chega antes desta gravação e entra sem remetente.
     Marcar como do assistente evita confundir com o Xavier escrevendo do celular
     (o que tiraria o assistente da conversa). */
  if (error?.code === '23505' && providerId) {
    await db.from('wa_mensagens').update({ enviada_por_nome: REMETENTE, turno_id: turnoId }).eq('provider_message_id', providerId);
  } else if (error) {
    console.error('assistente: mensagem enviada mas não gravada', error.message);
  }
  await db.from('wa_conversas').update({
    ultima_mensagem: texto, ultima_mensagem_em: agora, ultima_direcao: 'saida', updated_at: agora,
  }).eq('id', conversa.id);
  return providerId;
}

/* ── travas da conversa ──────────────────────────────────────────── */


/**
 * Alguém da equipe escreveu depois de `desde`? Pela tela, a mensagem tem enviada_por
 * (regra de assistente-regras). Pela Evolution, quem escreve do celular entra como
 * saída SEM remetente nenhum — isso também é gente.
 */
export function equipeEscreveu(msgs: Mensagem[], inst: Instancia, desde: string | null): boolean {
  const t0 = desde ? new Date(desde).getTime() : -Infinity;
  return msgs.some((m) => {
    if (m.direcao !== 'saida' || m.turno_id || new Date(m.created_at).getTime() <= t0) return false;
    if (m.enviada_por) return true;
    return inst.origem === 'evolution' && !m.enviada_por_nome;
  }) || false;
}

/** Fixa a conversa no topo para o Xavier e, se for loja da prospecção, marca "com você". */
export async function fixarParaOXavier(db: Db, conversaId: string, lojaId: string | null, motivo: string) {
  const agora = agoraISO();
  await db.from('wa_conversas').update({ fixada: true, updated_at: agora }).eq('id', conversaId);
  if (lojaId) {
    await db.from('prospeccao_lojas').update({ status: 'com_voce', motivo, conversa_id: conversaId, atualizada_em: agora })
      .eq('id', lojaId).in('status', ['em_contato', 'sem_resposta', 'conversando', 'com_voce']);
  }
}

/* ── agenda ──────────────────────────────────────────────────────── */

export const agendaDe = (cfg: AssistenteConfig): Agenda => ({
  dias_semana: cfg.dias_semana, hora_inicio: cfg.hora_inicio, hora_fim: cfg.hora_fim,
  duracao_min: cfg.duracao_min, folga_min_horas: cfg.folga_min_horas, max_reunioes_dia: cfg.max_reunioes_dia,
});

/** As reuniões do responsável (todas as frentes: a agenda dele é uma só). */
export async function reunioesDoResponsavel(db: Db, responsavelId: string | null, agora = new Date()): Promise<ReuniaoMarcada[]> {
  if (!responsavelId) return [];
  const { data } = await db.from('meetings').select('id, scheduled_at, duration_min, status')
    .eq('owner_id', responsavelId)
    .gte('scheduled_at', new Date(agora.getTime() - 86_400_000).toISOString())
    .lte('scheduled_at', new Date(agora.getTime() + 23 * 86_400_000).toISOString());
  return (data ?? []).map((r: { id: string; scheduled_at: string; duration_min: number; status: string }) =>
    ({ id: r.id, inicio: r.scheduled_at, duracao_min: r.duration_min, status: r.status }));
}

export async function horariosParaOferecer(db: Db, cfg: AssistenteConfig, estado: AssistenteConversa, agora = new Date(), n: number = LIMITES.HORARIOS_OFERECIDOS): Promise<Date[]> {
  if (!cfg.responsavel_id) return [];
  const reunioes = await reunioesDoResponsavel(db, cfg.responsavel_id, agora);
  return horariosLivres(agora, agendaDe(cfg), reunioes, n, { ignorarReuniaoId: estado.reuniao_id });
}

/** O horário pode ser marcado agora? Motivo em português quando não. */
export async function validarMarcacao(db: Db, cfg: AssistenteConfig, estado: AssistenteConversa, inicio: string, agora = new Date()):
  Promise<{ ok: true; inicio: Date } | { ok: false; motivo: string; chamarXavier: boolean }> {
  if (!cfg.link_reuniao) return { ok: false, motivo: 'O link da reunião ainda não foi configurado no painel.', chamarXavier: true };
  if (!cfg.responsavel_id) return { ok: false, motivo: 'Ninguém foi escolhido para receber as reuniões no painel.', chamarXavier: true };
  const d = new Date(inicio);
  const reunioes = await reunioesDoResponsavel(db, cfg.responsavel_id, agora);
  const motivo = porQueNaoPode(d, agora, agendaDe(cfg), reunioes, { ignorarReuniaoId: estado.reuniao_id });
  if (motivo || !horarioLivre(d, agora, agendaDe(cfg), reunioes, { ignorarReuniaoId: estado.reuniao_id })) {
    return { ok: false, motivo: `Esse horário não pode (${motivo ?? 'indisponível'}). Ofereça outro da lista de horários livres.`, chamarXavier: false };
  }
  return { ok: true, inicio: d };
}

/* ── o que a IA registra ─────────────────────────────────────────── */

export type ArgsRegistrar = {
  dores?: { texto: string; citacao: string }[];
  objecoes?: { texto: string; citacao: string; resposta?: string }[];
  situacao?: Situacao;
  decisor_vem?: 'sim' | 'nao' | 'nao_sei';
  decisor_citacao?: string;
  quem_vem?: string;
  memoria?: string;
  pediu_preco?: boolean;
  prova_enviada?: boolean;
  /** O que ele pediu agora: fechar já, comprar, ver funcionando, como funciona. */
  pedido?: Pedido;
  /** Disse "sim" a ver funcionando. */
  interesse?: boolean;
  /** Recusou vídeo ou reunião, ou condicionou ao preço: a frase dele. */
  recusou_reuniao?: string;
  /** Depois de ter recusado, ele mesmo pediu para marcar. */
  reabriu_reuniao?: boolean;
};

/** As mensagens de entrada como fonte de citação (texto + transcrição). */
export const fontesDeCitacao = (msgs: Mensagem[]) =>
  msgs.filter((m) => m.direcao === 'entrada').map((m) => ({ id: m.id, texto: textoDaMensagem(m) }));

const lista = <T>(x: unknown): T[] => (Array.isArray(x) ? x as T[] : []);
const textoOuNada = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 500) : null);

/**
 * Aplica o registrar: confere cada citação contra a conversa, junta ao que já havia e
 * recalcula etapa e card. `prova_enviada` NÃO entra aqui: vale quando a mensagem sai
 * (quem chama aplica depois). Devolve o texto que volta para a IA.
 */
export async function aplicarRegistro(db: Db, estado: AssistenteConversa, args: ArgsRegistrar, msgs: Mensagem[], conversa: Conversa):
  Promise<{ estado: AssistenteConversa; resposta: string }> {
  const fontes = fontesDeCitacao(msgs);
  const avisos: string[] = [];
  const patch: Partial<AssistenteConversa> = {};

  const jaTem = (itens: ItemCitado[], c: string) => itens.some((i) => normalizarTexto(i.citacao) === normalizarTexto(c));

  const dores = lista<{ texto: string; citacao: string }>(args.dores).filter((d) => textoOuNada(d?.citacao) && textoOuNada(d?.texto));
  if (dores.length) {
    const { aceitos, recusados } = conferirCitacoes(dores, fontes);
    const novas = aceitos.filter((a) => !jaTem(estado.dores, a.citacao))
      .map((a) => ({ texto: String(a.texto).slice(0, 300), citacao: String(a.citacao).slice(0, 500), mensagem_id: a.mensagem_id }));
    if (novas.length) patch.dores = [...estado.dores, ...novas];
    for (const r of recusados) avisos.push(`Dor recusada: a citação "${r.citacao}" não está na conversa. Copie a frase do lead ao pé da letra.`);
  }

  const objecoes = lista<{ texto: string; citacao: string; resposta?: string }>(args.objecoes).filter((o) => textoOuNada(o?.citacao) && textoOuNada(o?.texto));
  if (objecoes.length) {
    const { aceitos, recusados } = conferirCitacoes(objecoes, fontes);
    const novas = aceitos.filter((a) => !jaTem(estado.objecoes, a.citacao)).map((a) => ({
      texto: String(a.texto).slice(0, 300), citacao: String(a.citacao).slice(0, 500), mensagem_id: a.mensagem_id,
      resposta: textoOuNada(a.resposta),
    }));
    if (novas.length) patch.objecoes = [...estado.objecoes, ...novas];
    for (const r of recusados) avisos.push(`Objeção recusada: a citação "${r.citacao}" não está na conversa.`);
  }

  if (args.situacao && typeof args.situacao === 'object') {
    const s: Situacao = { ...estado.situacao };
    let mudou = false;
    for (const k of ['estoque', 'canais', 'sistema_atual', 'cidade', 'quem_fala', 'loja', 'cargo', 'estrutura', 'quem_anuncia', 'como_manda',
      'equipe', 'epoca_boa', 'motivo', 'o_que_quer_ver', 'prazo', 'nao_e_o_momento'] as const) {
      const v = textoOuNada(args.situacao[k]);
      if (v) { s[k] = v; mudou = true; }
    }
    const seg = args.situacao.segmento;
    if (seg && ['caminhoes', 'implementos', 'maquinas', 'onibus', 'outro'].includes(seg)) { s.segmento = seg; mudou = true; }
    if (mudou) patch.situacao = s;
  }
  /* O pedido só esquenta (quem pediu para comprar e depois perguntou como funciona continua
     querendo comprar); o "sim" a ver funcionando não volta atrás. */
  if (textoOuNada(args.recusou_reuniao) || args.reabriu_reuniao === true) {
    const s: Situacao = { ...(patch.situacao ?? estado.situacao) };
    if (args.reabriu_reuniao === true) s.recusou_reuniao = null;
    else s.recusou_reuniao = textoOuNada(args.recusou_reuniao);
    patch.situacao = s;
  }
  if ((args.pedido && PEDIDOS.includes(args.pedido)) || args.interesse === true) {
    const s: Situacao = { ...(patch.situacao ?? estado.situacao) };
    const quente = pedidoMaisQuente(s.pedido ?? null, args.pedido ?? null);
    if (quente) s.pedido = quente;
    if (args.interesse === true) s.interesse = 'sim';
    patch.situacao = s;
  }

  if (args.decisor_vem && ['sim', 'nao', 'nao_sei'].includes(args.decisor_vem)) patch.decisor_vem = args.decisor_vem;
  const cit = textoOuNada(args.decisor_citacao);
  if (cit) {
    if (citacaoConfere(cit, fontes.map((f) => f.texto))) patch.decisor_citacao = cit;
    else avisos.push(`A frase sobre quem decide ("${cit}") não está na conversa: não foi gravada.`);
  }
  const quem = textoOuNada(args.quem_vem);
  if (quem) patch.quem_vem = quem;
  if (textoOuNada(args.memoria)) patch.memoria = cortarMemoria(args.memoria);

  /* O pedido de preço só conta quando a resposta sai (concluirTurno): rascunho descartado
     ou turno refeito não podem somar a mesma pergunta duas vezes. Aqui só orienta a IA. */
  let preco = '';
  const { data: cfgPreco } = args.pediu_preco === true
    ? await db.from('assistente_config').select('preco_mensal, preco_cheio, oferta_ate').eq('id', 1).maybeSingle()
    : { data: null };
  const hoje = precoDeHoje(cfgPreco);
  if (args.pediu_preco === true && hoje) {
    /* Dono, 06/11: o Davi diz o valor (e a oferta do mês). A demonstração passa a ser para ver o sistema. */
    preco = (estado.pedidos_preco ?? 0) === 0
      ? `Pedido de preço: diga o valor direto, no primeiro balão: "${falaDoPreco(hoje)}" Se ele respondeu algo na mesma mensagem, reconheça em meia frase antes. Depois, se a porta deixar, o convite ("Na demonstração de *15 minutos* o Xavier te mostra tudo funcionando na sua loja."); se não, a próxima pergunta da qualificação (a do estado). Nunca desconto, outro valor ou porcentagem.`
      : `Ele perguntou de novo: repita o valor sem rodeio ("${falaDoPreco(hoje)}") e responda o que mais ele quis saber (o que está incluso, como paga). Nunca desconto nem outro valor; condição diferente, só o Xavier: chame o Xavier se ele pedir desconto.`;
  } else if (args.pediu_preco === true) {
    const r = respostaAoPreco((estado.pedidos_preco ?? 0) + 1);
    preco = r === 'valor_com_o_xavier'
      ? 'Primeiro pedido de preço: sem número. Se ele respondeu algo na mesma mensagem, reconheça em meia frase antes. Se ele ainda não sabe o que é o Via Pesados, uma frase do que é. Depois: "É mensal, sem fidelidade e sem multa pra cancelar. O valor quem te passa é o Xavier, dono do Via Pesados, numa demonstração de 15 minutos por vídeo; se preferir, ele te responde aqui mesmo na conversa." Se ele já disse a dor, termine com a escolha ("Prefere ver com ele [horário mais cedo], por vídeo, ou que eu chame ele aqui?"); se não, com a próxima pergunta da qualificação (a do estado). Nunca uma pergunta de outro assunto. Com a reunião já marcada: sem pergunta; diga que o Xavier mostra o valor na reunião.'
      : r === 'horario_mais_cedo'
        ? 'Segundo pedido de preço: sem número, sem repetir a frase de antes e sem fato do sistema. Se a escolha ainda não foi dada: "Justo." / "O Xavier te mostra [1º horário da lista], em 15 minutos, por vídeo, ou eu chamo ele pra te responder aqui na conversa. Qual você prefere?" Se a escolha já foi dada, ou ele recusou vídeo: a passagem ("Fechado, já chamei o Xavier, dono do Via Pesados. Ele te responde sobre o valor aqui mesmo, nesta conversa." e chamar_xavier).'
        : 'Terceiro pedido de preço (ou mais): chame o Xavier (chamar_xavier) e diga "Vou chamar o Xavier, dono do Via Pesados, pra falar disso com você por aqui."';
  }

  if (Object.keys(patch).length) await salvarEstado(db, estado.conversa_id, patch);
  const novo = await atualizarEtapaECard(db, estado.conversa_id, conversa);
  const partes = ['Registrado.'];
  if (preco) partes.push(preco);
  if (avisos.length) partes.push(...avisos);
  partes.push(`Etapa agora: ${ROTULO_DA_ETAPA[novo.etapa]}.`);
  return { estado: novo, resposta: partes.join('\n') };
}

/**
 * A etapa é do código: recalcula pelos fatos gravados e leva o card junto (cria na
 * primeira dor, oportunidade ao oferecer horário, reunião ao marcar). Card só anda
 * para a frente; teste e fechado ficam com gente.
 */
export async function atualizarEtapaECard(db: Db, conversaId: string, conversa?: Conversa): Promise<AssistenteConversa> {
  const e = await lerEstado(db, conversaId);
  if (!e) throw new Error('estado do assistente sumiu');
  const nova = proximaEtapa(e);
  if (nova !== e.etapa) await salvarEstado(db, conversaId, { etapa: nova });
  const estagio = estagioDoCard(nova);
  if (estagio && estagio !== 'perdido') {
    const { data: prospectId, error } = await db.rpc('assistente_criar_card', {
      p_conversa: conversaId,
      p_contact_name: e.situacao?.quem_fala ?? conversa?.nome ?? null,
      p_city: e.situacao?.cidade ?? null,
      p_stage: estagio,
    });
    if (error) console.warn('assistente: card não andou', error.message);
    else if (prospectId && prospectId !== e.prospect_id) e.prospect_id = prospectId;
  }
  return { ...e, etapa: nova };
}

/* ── ações com efeito ────────────────────────────────────────────── */

export async function chamarXavier(db: Db, conversaId: string, motivo: string) {
  const e = await lerEstado(db, conversaId);
  /* Conversa encerrada (pediu para sair, não quer) continua encerrada: só fixa para ele ver. */
  if (e && (e.etapa === 'saiu' || e.etapa === 'perdido')) {
    await salvarEstado(db, conversaId, { pendente_desde: null, token: null });
    await db.from('wa_conversas').update({ fixada: true }).eq('id', conversaId);
    return;
  }
  await salvarEstado(db, conversaId, { etapa: 'com_xavier', pausado_motivo: motivo.slice(0, 500), pendente_desde: null, token: null });
  await fixarParaOXavier(db, conversaId, e?.loja_id ?? null, `Assistente chamou você: ${motivo}`.slice(0, 500));
}

const MOTIVO_FALADO: Record<string, string> = {
  nao_quer: 'Disse que não quer.', saiu: 'Pediu para não receber mais mensagens.', engano: 'Engano: não é loja de pesados.',
  xingou: 'Xingou: conversa encerrada.', ja_cliente: 'Já é cliente.',
};

/** Encerra para sempre: etapa perdido ou saiu, loja sem interesse, card perdido (se houver card). */
export async function encerrarConversa(db: Db, conversaId: string, motivo: string, lostReason?: string | null) {
  const e = await lerEstado(db, conversaId);
  const etapa = motivo === 'saiu' || motivo === 'xingou' ? 'saiu' : 'perdido';
  const texto = MOTIVO_FALADO[motivo] ?? 'Encerrada pelo assistente.';
  await salvarEstado(db, conversaId, { etapa, pausado_motivo: motivo, pendente_desde: null, token: null });
  if (e?.loja_id) {
    await db.from('prospeccao_lojas').update({ status: 'sem_interesse', motivo: texto, proximo_contato_em: null, atualizada_em: agoraISO() }).eq('id', e.loja_id);
  }
  if (motivo === 'xingou') await db.from('wa_conversas').update({ fixada: true }).eq('id', conversaId);
  if (e?.prospect_id && motivo !== 'ja_cliente') {
    const { error } = await db.rpc('assistente_mover_card', {
      p_prospect: e.prospect_id, p_stage: 'perdido', p_motivo: (textoOuNada(lostReason) ?? texto).slice(0, 300),
    });
    if (error) console.warn('assistente: card não foi para perdido', error.message);
  }
}

/**
 * Marca (ou remarca) a reunião: card, reunião em `meetings` com o link fixo e o dono
 * configurado, estado da conversa. Remarcar = mesma reunião, horário novo.
 */
export async function marcarReuniao(db: Db, cfg: AssistenteConfig, conversa: Conversa, args: { inicio: string; quem_vem?: string; decisor_vem?: string }, agora = new Date()):
  Promise<{ ok: true; reuniao_id: string; inicio: Date; remarcou: boolean; antes: { reuniao_id: string | null; scheduled_at: string | null; etapa: AssistenteConversa['etapa'] } } | { ok: false; motivo: string; chamarXavier: boolean }> {
  const e = await lerEstado(db, conversa.id);
  if (!e) return { ok: false, motivo: 'conversa sem estado', chamarXavier: true };
  const v = await validarMarcacao(db, cfg, e, args.inicio, agora);
  if (!v.ok) return v;

  const { data: prospectId, error: errCard } = await db.rpc('assistente_criar_card', {
    p_conversa: conversa.id, p_contact_name: e.situacao?.quem_fala ?? conversa.nome ?? null,
    p_city: e.situacao?.cidade ?? null, p_stage: 'oportunidade',
  });
  if (errCard || !prospectId) {
    console.warn('assistente: card da reunião', errCard?.message);
    return { ok: false, motivo: 'O card do funil não foi criado.', chamarXavier: true };
  }

  const loja = await lerLoja(db, e.loja_id);
  const { data: card } = await db.from('prospects').select('company_name').eq('id', prospectId).maybeSingle();
  const titulo = `Via Pesados · ${card?.company_name ?? loja?.nome ?? conversa.nome ?? conversa.telefone}`.slice(0, 200);

  let reuniaoId: string | null = null;
  let remarcou = false;
  const antes = { reuniao_id: e.reuniao_id ?? null, scheduled_at: null as string | null, etapa: e.etapa };
  if (e.reuniao_id) {
    const { data: atual } = await db.from('meetings').select('id, status, scheduled_at').eq('id', e.reuniao_id).maybeSingle();
    antes.scheduled_at = atual?.scheduled_at ?? null;
    if (atual && atual.status !== 'cancelada' && atual.status !== 'realizada') {
      const { error } = await db.from('meetings').update({
        scheduled_at: v.inicio.toISOString(), status: 'agendada', meet_link: cfg.link_reuniao,
        owner_id: cfg.responsavel_id, duration_min: cfg.duracao_min, title: titulo, prospect_id: prospectId,
      }).eq('id', atual.id);
      if (error) { console.warn('assistente: remarcar', error.message); return { ok: false, motivo: 'A reunião não foi remarcada na agenda.', chamarXavier: true }; }
      reuniaoId = atual.id;
      remarcou = true;
    }
  }
  if (!reuniaoId) {
    const { data: nova, error } = await db.from('meetings').insert({
      prospect_id: prospectId, title: titulo, scheduled_at: v.inicio.toISOString(), duration_min: cfg.duracao_min,
      kind: 'demo', status: 'agendada', meet_link: cfg.link_reuniao, owner_id: cfg.responsavel_id,
      notes: 'Marcada pelo assistente de vendas no WhatsApp.', frente: conversa.frente,
    }).select('id').single();
    if (error || !nova) { console.warn('assistente: gravar reunião', error?.message); return { ok: false, motivo: 'A reunião não foi gravada na agenda.', chamarXavier: true }; }
    reuniaoId = nova.id;
  }

  /* dossie = null: a rotina assistente-pendentes refaz o resumo para o Xavier (fora do
     relógio apertado de quem acabou de mandar a mensagem). */
  const patch: Partial<AssistenteConversa> = { reuniao_id: reuniaoId, prospect_id: prospectId, dossie: null };
  if (args.decisor_vem && ['sim', 'nao', 'nao_sei'].includes(args.decisor_vem)) patch.decisor_vem = args.decisor_vem as 'sim' | 'nao' | 'nao_sei';
  if (textoOuNada(args.quem_vem)) patch.quem_vem = textoOuNada(args.quem_vem);
  await salvarEstado(db, conversa.id, patch);
  await atualizarEtapaECard(db, conversa.id, conversa);
  return { ok: true, reuniao_id: reuniaoId!, inicio: v.inicio, remarcou, antes };
}

/**
 * A mensagem com o link não saiu: a reunião volta a ser o que era (a nova é cancelada; a
 * remarcada volta ao horário antigo), para o lembrete não ir a quem nunca recebeu o link.
 */
async function desfazerMarcacao(db: Db, conversaId: string, r: { reuniao_id: string; remarcou: boolean; antes: { reuniao_id: string | null; scheduled_at: string | null; etapa: AssistenteConversa['etapa'] } }) {
  if (r.remarcou && r.antes.scheduled_at) {
    await db.from('meetings').update({ scheduled_at: r.antes.scheduled_at }).eq('id', r.reuniao_id);
    return;
  }
  await db.from('meetings').update({ status: 'cancelada', notes: 'Cancelada sozinha: a mensagem com o link não saiu.' }).eq('id', r.reuniao_id);
  const e = await lerEstado(db, conversaId);
  if (e) await salvarEstado(db, conversaId, { reuniao_id: r.antes.reuniao_id, etapa: r.antes.etapa });
}

/* ── Claude ──────────────────────────────────────────────────────── */

let cliente: Anthropic | null = null;
export function claude() {
  if (!cliente) cliente = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  return cliente;
}

/**
 * Uma chamada à IA. Fallback do lado do servidor ligado (`fallbacks: 'default'`): se a
 * classificação de segurança recusar, a API refaz noutro modelo dentro da mesma chamada
 * — o custo se conta pelo `model` que respondeu.
 */
// deno-lint-ignore no-explicit-any
export async function chamarClaude(params: Record<string, unknown>, opcoes: { timeoutMs?: number } = {}): Promise<any> {
  /* O Haiku 5.5 não tem fallback do lado do servidor: mandar o parâmetro daria 400. */
  const reserva = temFallbackNoServidor(String(params.model ?? ''))
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
    : {};
  // deno-lint-ignore no-explicit-any
  return await (claude().beta.messages as any).create(
    { ...params, ...reserva },
    { timeout: Math.max(5_000, Math.round(opcoes.timeoutMs ?? 90_000)), maxRetries: 1 },
  );
}

/* ── dossiê ──────────────────────────────────────────────────────── */

export const quemFalou = (m: Mensagem) =>
  m.direcao === 'entrada' ? 'LEAD'
    : m.turno_id || m.enviada_por_nome === REMETENTE ? 'ASSISTENTE'
      : m.enviada_por_nome === REMETENTE_PROSPECCAO ? 'MENSAGEM AUTOMÁTICA DA PROSPECÇÃO'
        : m.enviada_por_nome ? `EQUIPE (${m.enviada_por_nome})`
          : 'NÓS (mensagem automática ou do celular)';

const dataHoraSP = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}h${p(d.getUTCMinutes())}`;
};

/** Uma linha por mensagem: hora, quem falou, texto (com a transcrição do áudio). */
export function linhaDaConversa(m: Mensagem, novaDesde?: string | null): string {
  const quem = quemFalou(m);
  const util = m.conteudo && !/^\[[a-z_]+\]$/i.test(m.conteudo.trim()) ? neutro(m.conteudo.trim()) : '';
  let corpo: string;
  if (m.tipo === 'audio') {
    corpo = m.transcricao ? `(áudio) "${neutro(m.transcricao.trim())}"` : '(áudio que não deu para ouvir: sem transcrição)';
  } else if (m.tipo === 'imagem') {
    corpo = `(foto${m.direcao === 'entrada' ? '' : ' enviada'})${util ? ` legenda: ${util}` : ''}`;
  } else if (m.tipo !== 'texto' && !util) {
    corpo = `(${m.tipo})`;
  } else corpo = util || '(vazia)';
  const nova = novaDesde !== undefined && m.direcao === 'entrada' && (!novaDesde || m.created_at > novaDesde) ? ' ► NOVA' : '';
  return `[${dataHoraSP(m.created_at)}] ${quem}: ${corpo}${nova}`;
}

/**
 * O resumo para o Xavier antes da reunião. O que é do código (dores com citação,
 * decisor, horário, link) vem do estado; a IA só escreve o que é leitura da conversa
 * (situação, objeções, promessas ao pé da letra — conferidas —, perguntas, abertura,
 * fechamento, risco). Sem IA, o dossiê sai só com a parte do código.
 * Também grava uma nota na ficha do prospect. Devolve o `usage` para somar no custo.
 */
export async function gerarDossie(db: Db, cfg: AssistenteConfig, conversaId: string): Promise<{ usage: Uso | null; modelo: string | null }> {
  const e = await lerEstado(db, conversaId);
  const c = await carregarConversa(db, conversaId);
  if (!e || !c) return { usage: null, modelo: null };
  const loja = await lerLoja(db, e.loja_id);
  const { data: reuniao } = e.reuniao_id
    ? await db.from('meetings').select('id, scheduled_at, meet_link').eq('id', e.reuniao_id).maybeSingle()
    : { data: null };
  const { data: card } = e.prospect_id
    ? await db.from('prospects').select('id, company_name, city, state').eq('id', e.prospect_id).maybeSingle()
    : { data: null };

  const nomeLoja = card?.company_name ?? loja?.nome ?? c.conversa.nome ?? c.conversa.telefone;
  const cidade = e.situacao?.cidade ?? [loja?.cidade ?? card?.city, loja?.uf ?? card?.state].filter(Boolean).join('/');
  const segmento = e.situacao?.segmento ?? (typeof loja?.dados?.tipo === 'string' ? loja.dados.tipo : null);

  // deno-lint-ignore no-explicit-any
  let ia: any = null;
  let usage: Uso | null = null;
  let modelo: string | null = null;
  if (chaveDaIA()) {
    const conversaTexto = c.msgs.slice(-80).map((m) => linhaDaConversa(m)).join('\n');
    const pedido = [
      `Loja: ${nomeLoja}${cidade ? ` (${cidade})` : ''}${segmento ? ` · ${segmento}` : ''}`,
      `Estado gravado: ${JSON.stringify({ memoria: e.memoria, situacao: e.situacao, dores: e.dores, objecoes: e.objecoes, decisor_vem: e.decisor_vem, decisor_citacao: e.decisor_citacao, quem_vem: e.quem_vem, pedidos_preco: e.pedidos_preco })}`,
      reuniao ? `Reunião: ${horarioFalado(new Date(reuniao.scheduled_at))}` : '',
      `<conversa>\n${conversaTexto}\n</conversa>`,
    ].filter(Boolean).join('\n\n');
    try {
      const r = await chamarClaude({
        model: cfg.modelo,
        max_tokens: 6000,
        system: INSTRUCOES_DOSSIE,
        messages: [{ role: 'user', content: pedido }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_DOSSIE } },
      }, { timeoutMs: 40_000 });
      usage = r.usage ?? null;
      modelo = r.model ?? cfg.modelo;
      if (r.stop_reason !== 'refusal' && r.stop_reason !== 'max_tokens') {
        // deno-lint-ignore no-explicit-any
        const bloco = (r.content ?? []).find((b: any) => b.type === 'text');
        if (bloco?.text) ia = JSON.parse(bloco.text);
      }
    } catch (err) {
      console.warn('assistente: dossiê sem IA', err instanceof Error ? err.message : err);
    }
  }

  /* Promessa só entra se estiver, ao pé da letra, numa mensagem do assistente. */
  const doAssistente = c.msgs.filter((m) => m.direcao === 'saida' && (m.turno_id || m.enviada_por_nome === REMETENTE)).map((m) => m.conteudo ?? '');
  const promessas = lista<string>(ia?.promessas).filter((p) => typeof p === 'string' && citacaoConfere(p, doAssistente));

  /* No formato que a tela mostra (AssistenteNaConversa › Dossie), na língua do dono.
     Ids e carimbos ficam em `_interno`, que a tela não mostra. */
  const SEGMENTO: Record<string, string> = { caminhoes: 'Caminhões', implementos: 'Implementos e carretas', maquinas: 'Máquinas', onibus: 'Ônibus', outro: 'Outro' };
  const DECISOR: Record<string, string> = { sim: 'Sim, vem junto', nao: 'Não vem', nao_sei: 'Não se sabe' };
  const s = e.situacao ?? {};
  const situacaoTexto = textoOuNada(ia?.situacao) ?? ([
    s.estoque ? `Estoque: ${s.estoque}.` : '', s.canais ? `Anuncia em: ${s.canais}.` : '', s.sistema_atual ? `Usa hoje: ${s.sistema_atual}.` : '',
  ].filter(Boolean).join(' ') || null);
  const objecoesGravadas = e.objecoes.map((o) => ({ texto: o.texto, citacao: o.citacao, resposta: o.resposta ?? null }));
  const objecoesDaIA = lista<{ objecao: string; resposta: string }>(ia?.objecoes)
    .filter((o) => o && typeof o.objecao === 'string')
    .map((o) => ({ texto: o.objecao, citacao: null, resposta: typeof o.resposta === 'string' ? o.resposta : null }));
  const reuniaoFalada = reuniao ? horarioFalado(new Date(reuniao.scheduled_at)) : null;

  const dossie = {
    loja: nomeLoja,
    cidade_uf: cidade || null,
    segmento: segmento ? (SEGMENTO[segmento] ?? segmento) : null,
    reuniao: reuniaoFalada,
    com_quem_falou: textoOuNada(ia?.com_quem_falou) ?? s.quem_fala ?? c.conversa.nome ?? null,
    quem_vem: e.quem_vem,
    decisor: `${DECISOR[e.decisor_vem ?? 'nao_sei']}${e.decisor_citacao ? `: “${e.decisor_citacao}”` : ''}`,
    situacao: situacaoTexto,
    dores: e.dores.map((d) => ({ texto: d.texto, citacao: d.citacao })),
    objecoes: objecoesGravadas.length ? objecoesGravadas : objecoesDaIA,
    promessas,
    perguntas: lista<string>(ia?.perguntas_para_o_xavier).filter((x) => typeof x === 'string'),
    abertura: textoOuNada(ia?.abertura),
    fechamento: textoOuNada(ia?.fechamento),
    risco: textoOuNada(ia?.risco),
    _interno: {
      gerado_em: agoraISO(), conversa_id: conversaId, prospect_id: e.prospect_id,
      reuniao_id: reuniao?.id ?? null, inicio: reuniao?.scheduled_at ?? null, link: reuniao?.meet_link ?? null,
      pedidos_de_preco: e.pedidos_preco, sem_ia: !ia,
    },
  };
  await salvarEstado(db, conversaId, { dossie });

  if (e.prospect_id) {
    const linhas = [
      `Reunião marcada pelo assistente${reuniaoFalada ? `: ${reuniaoFalada}` : ''}.`,
      `Com quem falou: ${dossie.com_quem_falou ?? '—'}. Quem vem: ${e.quem_vem ?? '—'}. Quem decide: ${dossie.decisor}.`,
      e.dores.length ? `Dores: ${e.dores.map((d) => `"${d.citacao}"`).join('; ')}.` : '',
      dossie.situacao ? `A loja hoje: ${dossie.situacao}` : '',
      dossie.objecoes.length ? `Objeções: ${dossie.objecoes.map((o) => `${o.citacao ? `"${o.citacao}"` : o.texto}${o.resposta ? ` → ${o.resposta}` : ''}`).join('; ')}.` : '',
      promessas.length ? `O assistente prometeu: ${promessas.map((p) => `"${p}"`).join('; ')}.` : '',
      dossie.perguntas.length ? `Perguntas para fazer: ${dossie.perguntas.join(' / ')}` : '',
      dossie.abertura ? `Abertura sugerida: ${dossie.abertura}` : '',
      dossie.fechamento ? `Fechamento sugerido: ${dossie.fechamento}` : '',
      dossie.risco ? `Risco: ${dossie.risco}` : '',
    ].filter(Boolean).join('\n');
    const { error } = await db.from('activities').insert({ prospect_id: e.prospect_id, kind: 'nota', content: linhas, frente: c.conversa.frente });
    if (error) console.warn('assistente: nota do dossiê não gravou', error.message);
  }
  return { usage, modelo };
}

/**
 * Os dossiês que faltam (reunião marcada ou remarcada, resumo ainda não feito): UM por
 * rodada, com tempo limite na IA. O custo entra numa linha própria de assistente_turnos
 * (criada agora), para contar no teto do dia em que foi gasto. Dossiê que falha fica
 * marcado (`_erro`) e não volta em toda rodada.
 */
export async function dossiesPendentes(db: Db, cfg: AssistenteConfig, max = 1): Promise<number> {
  const { data } = await db.from('assistente_conversas').select('conversa_id')
    .not('reuniao_id', 'is', null).is('dossie', null).in('etapa', ['agendado', 'entregue'])
    .order('atualizado_em', { ascending: true }).limit(max);
  let feitos = 0;
  for (const { conversa_id } of data ?? []) {
    try {
      const d = await gerarDossie(db, cfg, conversa_id);
      feitos++;
      const valor = d.usage ? custo(d.usage, d.modelo ?? cfg.modelo) : 0;
      if (!valor) continue;
      await db.from('assistente_turnos').insert({
        conversa_id, entrada_ids: [], mensagens: [], mensagens_finais: [], acoes: [],
        ferramentas: [{ nome: 'dossie', entrada: null, saida: 'dossiê da reunião' }],
        modelo: d.modelo ?? cfg.modelo, usage: d.usage, custo_usd: valor, status: 'enviado',
      });
      const e = await lerEstado(db, conversa_id);
      if (e) await salvarEstado(db, conversa_id, { custo_usd: Number(e.custo_usd ?? 0) + valor });
    } catch (err) {
      console.warn('assistente: dossiê falhou', conversa_id, err instanceof Error ? err.message : err);
      await db.from('assistente_conversas')
        .update({ dossie: { _erro: 'o resumo não saiu', _interno: { tentado_em: agoraISO() } } })
        .eq('conversa_id', conversa_id);
    }
  }
  return feitos;
}

/* ── concluir um turno: mandar as mensagens e executar as ações ─── */

export type MotivoDaFalha = 'conversa' | 'fora_do_horario' | 'janela' | 'voce_assumiu' | 'reuniao' | 'envio';
export type Conclusao =
  | { ok: true; enviadas: number; acoes: AcaoDoTurno[] }
  | { ok: false; motivo: string; tipo: MotivoDaFalha; chamarXavier: boolean; enviadas: number; acoes: AcaoDoTurno[] };

/**
 * O fim de um turno que vai sair (sozinho, ou aprovado na tela):
 *   1. confere 08h–20h, a janela de 24h e (no motor) se a equipe escreveu enquanto a IA
 *      pensava — se escreveu, nada sai;
 *   2. encerrar pendente roda ANTES da despedida: se o envio falhar, a conversa já está
 *      encerrada e o assistente nunca mais escreve;
 *   3. marcar_reuniao pendente: valida e grava ANTES de mandar (se o horário caiu, nada
 *      sai); se depois nada sair, a marcação é desfeita;
 *   4. manda as mensagens em sequência, 1,5 s entre elas; marcou e nenhuma mensagem tem
 *      o link: o link vai como último balão;
 *   5. grava o que saiu (apresentou, contagem, horários oferecidos, prova, pedido de preço);
 *   6. chamar_xavier depois das mensagens;
 *   7. recalcula etapa e card (o dossiê da reunião sai na rotina assistente-pendentes).
 * Atualiza a linha do turno (status, mensagens_finais, ações, quem decidiu). O motivo
 * devolvido é para a tela (português, sem nome interno); o técnico fica em turno.erro.
 */
export async function concluirTurno(db: Db, args: {
  turnoId: string; conversaId: string; mensagens: string[]; acoes: AcaoDoTurno[]; cfg: AssistenteConfig;
  status: 'enviado' | 'aprovado'; decididoPor?: string | null; agora?: Date;
  /** Aprovação pela tela: se nada saiu, o rascunho continua de pé (dá para tentar de novo). */
  rascunhoSeNadaSair?: boolean;
  /** Motor: o início do turno. Mensagem da equipe depois disso = "você assumiu", nada sai. */
  equipeDesde?: string | null;
}): Promise<Conclusao> {
  const agora = args.agora ?? new Date();
  const acoes: AcaoDoTurno[] = args.acoes.map((a) => ({ ...a }));
  let marcada: Awaited<ReturnType<typeof marcarReuniao>> | null = null;
  let marcadaAcao: AcaoDoTurno | null = null;

  const falhar = async (motivo: string, tipo: MotivoDaFalha, chamar: boolean, enviadas: number, finais: string[], tecnico?: string): Promise<Conclusao> => {
    if (enviadas === 0 && marcada?.ok && marcadaAcao) {
      await desfazerMarcacao(db, args.conversaId, marcada).catch((e) => console.warn('assistente: desfazer marcação', e));
      marcadaAcao.estado = 'pendente';
      delete marcadaAcao.resultado;
    }
    const erro = (tecnico ? `${motivo} (${tecnico})` : motivo).slice(0, 500);
    if (enviadas === 0 && args.rascunhoSeNadaSair) {
      await db.from('assistente_turnos').update({ erro, acoes }).eq('id', args.turnoId);
      return { ok: false, motivo, tipo, chamarXavier: false, enviadas, acoes };
    }
    /* Fora do horário ou a equipe escreveu: não é erro do assistente, o turno só não vale. */
    const semCulpa = enviadas === 0 && (tipo === 'fora_do_horario' || tipo === 'voce_assumiu');
    await db.from('assistente_turnos').update({
      status: enviadas > 0 ? args.status : semCulpa ? 'descartado' : 'erro', erro, acoes,
      mensagens_finais: enviadas > 0 ? finais : null,
      decidido_por: args.decididoPor ?? null, decidido_em: args.decididoPor ? agoraISO() : null,
    }).eq('id', args.turnoId);
    return { ok: false, motivo, tipo, chamarXavier: chamar, enviadas, acoes };
  };

  const c = await carregarConversa(db, args.conversaId);
  if (!c) return await falhar('A conversa não foi encontrada.', 'conversa', false, 0, []);
  if (!dentroDoHorario(agora)) return await falhar('Fora do horário: nada automático sai fora das 08h às 20h.', 'fora_do_horario', false, 0, []);
  const ultima = ultimaEntradaEm(c.msgs);
  if (args.mensagens.length && !janelaAberta(ultima, agora)) {
    return await falhar(
      c.inst.origem === 'evolution'
        ? 'Passaram 24h desde a última mensagem dele: o assistente não retoma conversa parada.'
        : 'Passaram 24h desde a última mensagem dele: nesse número só sai modelo aprovado.',
      'janela', false, 0, [],
    );
  }
  if (args.equipeDesde !== undefined && equipeEscreveu(c.msgs, c.inst, args.equipeDesde)) {
    return await falhar('Alguém da equipe escreveu enquanto o assistente pensava: nada saiu.', 'voce_assumiu', false, 0, []);
  }

  /* 2. encerrar antes da despedida */
  for (const a of acoes) {
    if (a.tipo !== 'encerrar' || a.estado !== 'pendente') continue;
    const x = a.args as { motivo?: string; lost_reason?: string };
    await encerrarConversa(db, args.conversaId, String(x.motivo ?? 'nao_quer'), x.lost_reason ?? null);
    a.estado = 'executada';
  }

  /* 3. a reunião antes das mensagens */
  for (const a of acoes) {
    if (a.tipo !== 'marcar_reuniao' || a.estado !== 'pendente') continue;
    const r = await marcarReuniao(db, args.cfg, c.conversa, a.args as { inicio: string }, agora);
    if (!r.ok) {
      a.estado = 'recusada';
      a.resultado = r.motivo;
      return await falhar(`A reunião não foi marcada: ${r.motivo}`, 'reuniao', true, 0, []);
    }
    a.estado = 'executada';
    a.resultado = { reuniao_id: r.reuniao_id, inicio: r.inicio.toISOString(), remarcou: r.remarcou };
    marcada = r;
    marcadaAcao = a;
  }

  /* 4. as mensagens (com o link garantido quando marcou) */
  const textos = args.mensagens.map((m) => String(m ?? '').trim()).filter(Boolean);
  const link = args.cfg.link_reuniao?.trim();
  if (marcada?.ok && link) {
    const chave = link.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    if (!textos.some((t) => t.toLowerCase().includes(chave))) textos.push(link);
  }
  const finais: string[] = [];
  for (const texto of textos) {
    if (finais.length) await dormir(1500);
    try {
      await enviarTexto(db, c.conversa, c.inst, texto, args.turnoId);
      finais.push(texto);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const foraDaJanela = /24|re-?engagement|outside|session/i.test(msg);
      return await falhar(
        foraDaJanela ? 'Passaram 24h desde a última mensagem dele: o WhatsApp recusou o texto livre.' : 'A mensagem não saiu pelo WhatsApp.',
        foraDaJanela ? 'janela' : 'envio', !foraDaJanela, finais.length, finais, msg,
      );
    }
  }

  /* 5. o que saiu */
  const e = await lerEstado(db, args.conversaId);
  if (e && finais.length) {
    const livres = await horariosParaOferecer(db, args.cfg, e, agora, 20);
    const citados = horariosCitados(finais, livres, agora).map((d) => d.toISOString());
    const oferecidos = [...new Set([...(e.horarios_oferecidos ?? []), ...citados])];
    const registrou = (campo: 'prova_enviada' | 'pediu_preco') =>
      acoes.some((a) => a.tipo === 'registrar' && (a.args as Record<string, unknown>)[campo] === true);
    await salvarEstado(db, args.conversaId, {
      apresentou: true,
      mensagens_enviadas: (e.mensagens_enviadas ?? 0) + finais.length,
      horarios_oferecidos: oferecidos,
      ...(registrou('prova_enviada') ? { prova_enviada: true } : {}),
      ...(registrou('pediu_preco') ? { pedidos_preco: (e.pedidos_preco ?? 0) + 1 } : {}),
    });
  }

  /* 6. chamar o Xavier, depois das mensagens */
  for (const a of acoes) {
    if (a.estado !== 'pendente' || a.tipo !== 'chamar_xavier') continue;
    await chamarXavier(db, args.conversaId, String((a.args as { motivo?: string }).motivo ?? 'o assistente pediu'));
    a.estado = 'executada';
  }

  /* 7. etapa e card */
  await atualizarEtapaECard(db, args.conversaId, c.conversa);

  /* 8. o aviso ao dono: só depois que o Marcado (com o link) saiu para o lead */
  if (marcada?.ok && finais.length) await avisarReuniaoMarcada(db, args.cfg, c.conversa, marcada);

  await db.from('assistente_turnos').update({
    status: args.status, mensagens_finais: finais, acoes,
    decidido_por: args.decididoPor ?? null, decidido_em: args.decididoPor ? agoraISO() : null,
  }).eq('id', args.turnoId);
  return { ok: true, enviadas: finais.length, acoes };
}

/** Parâmetro de modelo: uma linha só, sem espaço sobrando (a Meta recusa quebra de linha). */
function umaLinha(t: string, max = 80): string {
  return t.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Avisa o dono no WhatsApp que o Davi marcou ou remarcou uma reunião (dono, 09/11/2026),
 * pelo modelo aviso_reuniao_marcada. Sem o modelo aprovado não manda (e não queima a trava);
 * falhar aqui nunca derruba o turno: a reunião já está na Agenda.
 */
export async function avisarReuniaoMarcada(db: Db, cfg: AssistenteConfig, conversa: Conversa, r: { reuniao_id: string; inicio: Date; remarcou: boolean }) {
  try {
    const para = String(cfg.aviso_whatsapp ?? '').replace(/\D/g, '');
    if (!para) return;
    if ((await statusDoModelo('aviso_reuniao_marcada')) !== 'APPROVED') {
      console.warn('assistente: aviso de reunião não saiu: o modelo aviso_reuniao_marcada ainda não foi aprovado');
      return;
    }
    const e = await lerEstado(db, conversa.id);
    const loja = await lerLoja(db, e?.loja_id ?? null);
    const { data: card } = e?.prospect_id
      ? await db.from('prospects').select('company_name, city').eq('id', e.prospect_id).maybeSingle()
      : { data: null };
    const nome = card?.company_name || e?.situacao?.loja || loja?.nome || conversa.nome || conversa.telefone || 'sem nome';
    const cidade = e?.situacao?.cidade || card?.city || (loja?.cidade ? `${loja.cidade}${loja.uf ? `/${loja.uf}` : ''}` : '');
    const res = await enviarTemplate(db, {
      para,
      template: 'aviso_reuniao_marcada',
      params: {
        body: [r.remarcou ? 'remarcou' : 'marcou', umaLinha(cidade ? `${nome}, ${cidade}` : String(nome)), horarioFalado(r.inicio)],
        urlSuffix: conversa.id,
      },
      chave: `aviso_reuniao:${r.reuniao_id}:${r.inicio.toISOString()}`,
      validoAte: r.inicio.toISOString(),
    });
    if (!res.ok) console.warn('assistente: aviso de reunião não saiu', res.motivo);
  } catch (err) {
    console.warn('assistente: aviso de reunião falhou', err instanceof Error ? err.message : err);
  }
}

/* ── chamar o motor ──────────────────────────────────────────────── */

/** Pede ao assistente-responder para pensar nesta conversa (em segundo plano). */
export function chamarMotor(conversaId: string, token: string, esperar: boolean): Promise<unknown> {
  return fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/assistente-responder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-interno': Deno.env.get('WA_INTERNAL_SECRET') ?? '' },
    body: JSON.stringify({ conversa_id: conversaId, token, esperar }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => console.warn('assistente: não chamou o motor', e));
}

/** Comparação que não vaza pelo tempo quantos caracteres bateram. */
export function segredoConfere(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (!x.length || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
