/**
 * As peças do agente de prospecção que falam com o mundo: Google (achar a
 * loja), Evolution (conferir o WhatsApp e mandar), Claude (escrever a
 * mensagem e ler a resposta) e o CRM (a conversa aparece na caixa do número).
 *
 * As regras puras (janela, cadência, quem pediu para sair) estão em
 * prospeccao-regras.ts, que os testes do painel conferem.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { evolution, paraEnvio } from './evolution.ts';
import { BUSCAS, nomeFalado, pareceLojaDePesados, telefoneBR, textoDeReserva, variantes } from './prospeccao-regras.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export const REMETENTE_AGENTE = 'Agente de prospecção';
export const MODELO = 'claude-opus-5-5';

/* ── o que o agente sabe da Via Pesados ───────────────────────── */

/* Só o que está na página /conheca. O agente não inventa recurso, preço nem
   prazo: o que não está aqui, ele passa para o Xavier. */
export const PRODUTO = `
A Via Pesados é um sistema de gestão feito só para lojas de caminhões, carretas, implementos e máquinas.
- Cadastra o caminhão uma vez e publica direto na conta da loja no Mercado Livre, Instagram e Facebook (pela conexão oficial de cada canal), e o anúncio se atualiza sozinho quando muda preço ou foto.
- Site próprio com a marca da loja, incluso (não se paga site à parte): cadastrou, aparece; vendeu, sai sozinho. Simulador de financiamento em cada caminhão, com PDF da parcela de 12 a 60 vezes.
- Fluxo de fotos: o vendedor escolhe o caminhão e com um clique as fotos na ordem, a ficha, o preço e o link do site chegam no WhatsApp do cliente.
- WhatsApp de cada vendedor dentro do sistema (conecta lendo um QR code em 90 segundos); as conversas ficam com a loja mesmo quando o vendedor sai. Funil de vendas com o valor de cada etapa.
- Mostra quem procura um caminhão igual ao que acabou de chegar e quem comprou há meses e está na hora de trocar.
- Estoque com custo, despesas por caminhão e margem; financeiro; relatórios de lucro, marcas que compensam e vendas perdidas; agenda; equipe com acesso por pessoa.
- Para ver: em 15 minutos o Xavier mostra o sistema rodando com os caminhões da própria loja. Também dá para montar uma AMOSTRA do site da loja com os caminhões dela, sem custo e sem compromisso.
- Existe teste grátis. Preço, prazo do teste e condições: quem fala é o Xavier.
`.trim();

/* ── Claude ───────────────────────────────────────────────────── */

let cliente: Anthropic | null = null;
export function claudeConfigurado() { return !!Deno.env.get('ANTHROPIC_API_KEY'); }
function claude() {
  if (!cliente) cliente = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  return cliente;
}

/**
 * Uma chamada que devolve JSON no formato pedido. Fallback do lado do
 * servidor ligado: se a classificação de segurança recusar, a própria API
 * refaz em outro modelo. Recusou mesmo assim, devolve null e quem chamou usa
 * o plano B (texto de reserva ou passar para o Xavier).
 */
async function pedirJSON<T>(sistema: string, conteudo: string, schema: Record<string, unknown>, esforco: 'low' | 'medium'): Promise<T | null> {
  if (!claudeConfigurado()) return null;
  try {
    const r = await claude().beta.messages.create({
      model: MODELO,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: sistema,
      messages: [{ role: 'user', content: conteudo }],
      output_config: { effort: esforco, format: { type: 'json_schema', schema } },
    });
    if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') {
      console.warn('prospeccao: Claude não concluiu —', r.stop_reason);
      return null;
    }
    const bloco = r.content.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined;
    return bloco ? JSON.parse(bloco.text) as T : null;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn('prospeccao: limite da API do Claude');
    else if (e instanceof Anthropic.APIError) console.error('prospeccao: API do Claude', e.status, e.message);
    else console.error('prospeccao: Claude', e);
    return null;
  }
}

/* ── escrever o contato ───────────────────────────────────────── */

export type Loja = {
  id: string; nome: string; cidade: string | null; uf: string | null; telefone: string;
  telefone_whatsapp: string | null; site: string | null; dados: Record<string, unknown>;
  status: string; contatos: number; conversa_id: string | null; humano_assumiu: boolean;
  respostas_do_agente: number; responder_token: string | null; primeiro_contato_em: string | null;
};

const SISTEMA_CONTATO = `Você escreve mensagens de WhatsApp em nome do Xavier, da Via Pesados, para donos de lojas de caminhões e carretas que ainda não conhecem a empresa.

${PRODUTO}

Como escrever:
- Português do Brasil, do jeito que um vendedor do interior escreve no WhatsApp: direto, educado, sem formalidade de e-mail, sem gíria forçada.
- Curto: no máximo 3 frases e 450 caracteres. Um emoji no máximo, e só se couber naturalmente.
- Sem link, sem preço, sem promessa que não está na descrição acima, sem "solução", "ferramenta inovadora" ou jargão de marketing.
- Use só os fatos da loja que forem dados. Nunca invente estoque, marca, nota ou qualquer detalhe da loja.
- Contato 1: apresente-se ("Aqui é o Xavier, da Via Pesados"), diga em uma frase o que o sistema faz para a loja e termine com UMA pergunta fácil de responder (ex.: se pode mostrar em 15 minutos com os caminhões dela).
- Contato 2: lembrete leve, ofereça montar a amostra do site da loja com os caminhões dela, sem custo, e diga que se não fizer sentido é só avisar que você não chama mais.
- Contato 3: o último. Diga que não vai mais insistir e deixe a porta aberta. Sem pergunta.
- Escreva diferente das mensagens anteriores (se houver) e de um texto padrão: cada loja recebe uma mensagem própria.`;

const SCHEMA_TEXTO = {
  type: 'object',
  properties: { texto: { type: 'string', description: 'A mensagem, pronta para enviar' } },
  required: ['texto'],
  additionalProperties: false,
};

/** Confere o que a IA escreveu antes de mandar. Fora do combinado, vale o texto de reserva. */
export function textoAceitavel(texto: string, contato: number): boolean {
  const t = texto.trim();
  if (t.length < 40 || t.length > 600) return false;
  if (/https?:\/\/|www\.|R\$\s?\d/i.test(t)) return false;
  if (contato === 3 && t.includes('?')) return false;
  return true;
}

export async function escreverContato(loja: Loja, contato: number, anteriores: string[]): Promise<{ texto: string; por: 'ia' | 'reserva' }> {
  const fatos = [
    `Nome da loja: ${nomeFalado(loja.nome)}`,
    loja.cidade ? `Cidade: ${loja.cidade}${loja.uf ? `/${loja.uf}` : ''}` : null,
    typeof loja.dados?.nota === 'number' ? `Nota no Google: ${loja.dados.nota} (${loja.dados.avaliacoes ?? 0} avaliações)` : null,
    loja.site ? 'A loja tem site próprio.' : 'Não achamos site da loja.',
  ].filter(Boolean).join('\n');
  const pedido = `Escreva o contato ${contato} de 3.\n\nFatos da loja:\n${fatos}\n\n${
    anteriores.length ? `Mensagens que já mandamos para esta loja (sem resposta):\n${anteriores.map((a, i) => `${i + 1}. ${a}`).join('\n')}` : 'É a primeira mensagem para esta loja.'}`;
  const r = await pedirJSON<{ texto: string }>(SISTEMA_CONTATO, pedido, SCHEMA_TEXTO, 'low');
  if (r?.texto && textoAceitavel(r.texto, contato)) return { texto: r.texto.trim(), por: 'ia' };
  return { texto: textoDeReserva(loja, contato), por: 'reserva' };
}

/* ── responder quem respondeu ─────────────────────────────────── */

export type Decisao = {
  acao: 'responder' | 'passar_para_xavier' | 'encerrar';
  texto: string;
  motivo: string;
};

const SISTEMA_RESPOSTA = `Você é o assistente do Xavier, da Via Pesados, no WhatsApp de vendas dele. A loja abaixo recebeu uma mensagem de prospecção e respondeu. Seu trabalho: responder as primeiras dúvidas e chegar à AMOSTRA (montamos o site da loja com os caminhões dela, sem custo) ou à demonstração de 15 minutos com o Xavier.

${PRODUTO}

Regras:
- Português do Brasil, curto (até 3 frases), do jeito que se fala no WhatsApp. Sem link, sem lista, sem markdown.
- Na primeira resposta sua nesta conversa, diga que é o assistente do Xavier. Se perguntarem se é robô ou pessoa, diga a verdade: é o assistente virtual, e o Xavier assume a conversa.
- Responda só com o que está na descrição acima. Não sabe, não está lá, ou a pessoa pediu preço, valor, contrato, prazo, desconto, reunião marcada, ligação, áudio, ou quer falar com uma pessoa: acao = "passar_para_xavier", com um texto curto avisando que o Xavier vai continuar por aqui ainda hoje.
- A pessoa topou a amostra ou a demonstração: peça o Instagram ou o site da loja (se ainda não tiver) e use acao = "passar_para_xavier" — quem monta e marca é ele.
- A pessoa não quer, já tem sistema e não quer conhecer, pediu para não chamar mais, ou é engano (não é loja de pesados): acao = "encerrar", com um agradecimento curto e sem insistir.
- Mensagem sem texto (só figurinha, áudio, imagem): acao = "passar_para_xavier".
- Nunca prometa o que não está na descrição. Nunca fale mal de concorrente. Nunca insista depois de um não.
- "motivo": uma frase para a equipe dizendo o que a pessoa quer.`;

const SCHEMA_DECISAO = {
  type: 'object',
  properties: {
    acao: { type: 'string', enum: ['responder', 'passar_para_xavier', 'encerrar'] },
    texto: { type: 'string', description: 'A mensagem para a loja' },
    motivo: { type: 'string', description: 'Uma frase para a equipe' },
  },
  required: ['acao', 'texto', 'motivo'],
  additionalProperties: false,
};

export async function decidirResposta(loja: Loja, conversa: { direcao: string; conteudo: string | null; tipo: string; por_agente: boolean }[]): Promise<Decisao | null> {
  const linhas = conversa.map((m) => {
    const quem = m.direcao === 'entrada' ? 'LOJA' : (m.por_agente ? 'NÓS (agente)' : 'NÓS');
    const txt = m.conteudo?.trim() || `[${m.tipo} sem texto]`;
    return `${quem}: ${txt}`;
  }).join('\n');
  const pedido = `Loja: ${nomeFalado(loja.nome)}${loja.cidade ? ` (${loja.cidade}${loja.uf ? `/${loja.uf}` : ''})` : ''}\nRespostas suas até agora nesta conversa: ${loja.respostas_do_agente}\n\nConversa (a mais recente por último):\n${linhas}`;
  const d = await pedirJSON<Decisao>(SISTEMA_RESPOSTA, pedido, SCHEMA_DECISAO, 'medium');
  if (!d || !d.texto?.trim() || d.texto.length > 700 || /https?:\/\//i.test(d.texto)) return null;
  return d;
}

/* ── Google Maps ──────────────────────────────────────────────── */

export function googleConfigurado() { return !!Deno.env.get('GOOGLE_MAPS_API_KEY'); }

export type Achada = {
  nome: string; telefone: string; cidade: string | null; uf: string | null; endereco: string | null;
  site: string | null; fonte_ref: string; dados: Record<string, unknown>;
};

const CAMPOS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.websiteUri',
  'places.googleMapsUri', 'places.businessStatus', 'places.rating', 'places.userRatingCount', 'nextPageToken',
].join(',');

// deno-lint-ignore no-explicit-any
function componente(p: any, tipo: string, curto = false): string | null {
  // deno-lint-ignore no-explicit-any
  const c = (p.addressComponents ?? []).find((x: any) => (x.types ?? []).includes(tipo));
  return c ? (curto ? c.shortText : c.longText) ?? null : null;
}

/**
 * Lojas de pesados numa cidade, pela Places API (New) do Google — a via
 * oficial e paga (centavos por loja). Quatro buscas por cidade, até 3
 * páginas cada; o que se repete entre buscas vira uma linha só.
 */
export async function buscarNoGoogle(cidade: string, uf: string): Promise<{ achadas: Achada[]; descartadas: number }> {
  const chave = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!chave) throw new Error('A chave do Google Maps ainda não foi cadastrada.');
  const porId = new Map<string, Achada>();
  let descartadas = 0;
  for (const termo of BUSCAS) {
    let pagina: string | undefined;
    for (let i = 0; i < 3; i++) {
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': CAMPOS },
        body: JSON.stringify({ textQuery: `${termo} em ${cidade} ${uf}`, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, pageToken: pagina }),
        signal: AbortSignal.timeout(20_000),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error?.message ?? `Google respondeu ${r.status}`);
      for (const p of d?.places ?? []) {
        if (porId.has(p.id)) continue;
        const nome = p.displayName?.text ?? '';
        const tel = telefoneBR(p.internationalPhoneNumber ?? p.nationalPhoneNumber);
        if (!nome || !tel || p.businessStatus === 'CLOSED_PERMANENTLY' || !pareceLojaDePesados(nome)) { descartadas++; continue; }
        porId.set(p.id, {
          nome, telefone: tel,
          cidade: componente(p, 'administrative_area_level_2') ?? cidade,
          uf: componente(p, 'administrative_area_level_1', true) ?? uf,
          endereco: p.formattedAddress ?? null,
          site: p.websiteUri ?? null,
          fonte_ref: p.id,
          dados: { nota: p.rating ?? null, avaliacoes: p.userRatingCount ?? 0, mapa: p.googleMapsUri ?? null, busca: termo },
        });
      }
      pagina = d?.nextPageToken;
      if (!pagina) break;
    }
  }
  return { achadas: [...porId.values()], descartadas };
}

/* ── quem já conhecemos ───────────────────────────────────────── */

/** Telefones de clientes, prospects e de quem já conversou com qualquer número nosso. */
export async function telefonesConhecidos(db: Db): Promise<Set<string>> {
  const set = new Set<string>();
  const add = (t: string | null) => { const n = telefoneBR(t); if (n) variantes(n).forEach((v) => set.add(v)); };
  const [c, p, w] = await Promise.all([
    db.from('clients').select('whatsapp').not('whatsapp', 'is', null),
    db.from('prospects').select('whatsapp').not('whatsapp', 'is', null),
    db.from('wa_conversas').select('telefone'),
  ]);
  (c.data ?? []).forEach((x: { whatsapp: string }) => add(x.whatsapp));
  (p.data ?? []).forEach((x: { whatsapp: string }) => add(x.whatsapp));
  (w.data ?? []).forEach((x: { telefone: string }) => add(x.telefone));
  return set;
}

/* ── WhatsApp ─────────────────────────────────────────────────── */

/**
 * Pergunta ao WhatsApp quais números existem. Devolve, para cada número
 * conferido, o número como o WhatsApp o conhece (ou null se não tem conta).
 * Lotes pequenos: consulta em massa também é sinal que a Meta observa.
 */
export async function conferirWhatsApp(instancia: string, telefones: string[]): Promise<Map<string, string | null>> {
  const r = new Map<string, string | null>();
  if (!telefones.length) return r;
  const d = await evolution('chat/whatsappNumbers', instancia, 'POST', { numbers: telefones }) as
    { exists?: boolean; jid?: string; number?: string }[] | null;
  for (const item of d ?? []) {
    const pedido = telefones.find((t) => variantes(t).includes(String(item.number ?? '').replace(/\D/g, ''))) ?? String(item.number ?? '');
    r.set(pedido, item.exists && item.jid ? item.jid.split('@')[0] : null);
  }
  for (const t of telefones) if (!r.has(t)) r.set(t, null);
  return r;
}

/** Manda pelo número da equipe e grava na caixa do CRM, como se tivesse saído da tela. */
export async function enviarEGravar(db: Db, inst: { id: string; evolution_instance: string }, telefone: string, texto: string, nomeLoja: string):
  Promise<{ conversa_id: string; provider_id: string | null }> {
  const d = await evolution('message/sendText', inst.evolution_instance, 'POST', { number: paraEnvio(telefone), text: texto }) as { key?: { id?: string } };
  const providerId = d?.key?.id ?? null;
  const agora = new Date().toISOString();
  const { data: conversa } = await db.from('wa_conversas').upsert({
    instancia_id: inst.id, telefone, nome: nomeLoja,
    ultima_mensagem: texto, ultima_mensagem_em: agora, ultima_direcao: 'saida', updated_at: agora,
  }, { onConflict: 'instancia_id,telefone' }).select('id').maybeSingle();
  if (conversa) {
    const { error } = await db.from('wa_mensagens').insert({
      conversa_id: conversa.id, instancia_id: inst.id, direcao: 'saida', tipo: 'texto', conteudo: texto,
      provider_message_id: providerId, status: 'enviada', enviada_por_nome: REMETENTE_AGENTE, created_at: agora,
    });
    /* O eco da Evolution às vezes chega antes desta gravação e entra sem
       remetente. Marcar como do agente evita confundir com o Xavier
       escrevendo do celular (o que tiraria o agente da conversa). */
    if (error?.code === '23505' && providerId) {
      await db.from('wa_mensagens').update({ enviada_por_nome: REMETENTE_AGENTE }).eq('provider_message_id', providerId);
    }
  }
  return { conversa_id: conversa?.id, provider_id: providerId };
}

/** A instância que o agente usa, se estiver ligada e conectada. */
export async function instanciaDoAgente(db: Db, instanciaId: string | null) {
  if (!instanciaId) return { inst: null, motivo: 'Nenhum número escolhido para a prospecção.' };
  const { data: inst } = await db.from('wa_instancias')
    .select('id, nome, origem, evolution_instance, connection_state, is_active').eq('id', instanciaId).maybeSingle();
  if (!inst || !inst.is_active) return { inst: null, motivo: 'O número escolhido não está mais no CRM.' };
  if (inst.origem !== 'evolution' || !inst.evolution_instance) return { inst: null, motivo: 'A prospecção só sai por número conectado pelo QR code.' };
  if (inst.connection_state !== 'open') return { inst: null, motivo: `O WhatsApp ${inst.nome} está desconectado.` };
  return { inst, motivo: null };
}
