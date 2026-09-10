import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { semSufixo } from '../_shared/evolution.ts';

/**
 * Entrada de mensagens, das DUAS origens, no mesmo modelo.
 *
 *   ?origem=evolution  → números da equipe, no aplicativo (webhook da Evolution)
 *   ?origem=cloud      → número da Salvy, na API oficial (webhook da Meta)
 *
 * O que faz este arquivo valer a pena é a normalização: cada provedor entrega
 * um formato diferente, e a interface não deveria saber disso. Daqui para
 * dentro, mensagem é mensagem.
 *
 * DUAS REGRAS QUE OS DOIS PROVEDORES IMPÕEM:
 *
 *  1. Entrega repetida. Os dois reenviam o mesmo evento — a unique em
 *     provider_message_id é o que impede a conversa de encher de duplicatas.
 *
 *  2. Responder fora de 2xx faz reenviar em loop e, na Meta, chega a
 *     desabilitar o webhook. Por isso quase tudo aqui devolve 200, mesmo o
 *     que não soubemos tratar.
 */

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };
const ok = (b: unknown = { ok: true }) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

type Normalizada = {
  telefone: string;
  nome?: string | null;
  direcao: 'entrada' | 'saida';
  tipo: string;
  conteudo: string | null;
  media_url?: string | null;
  provider_message_id: string | null;
  foto_url?: string | null;
  quando?: string;
};

/** Evolution: MESSAGES_UPSERT. O texto muda de lugar conforme o tipo. */
function daEvolution(corpo: Record<string, any>): Normalizada | null {
  const d = corpo?.data;
  if (!d?.key) return null;
  const m = d.message ?? {};
  const conteudo =
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    null;
  const tipo = m.imageMessage ? 'imagem'
    : m.videoMessage ? 'video'
    : m.audioMessage ? 'audio'
    : m.documentMessage ? 'documento'
    : m.stickerMessage ? 'figurinha'
    : 'texto';
  return {
    telefone: semSufixo(d.key.remoteJid ?? ''),
    nome: d.pushName ?? null,
    // fromMe = mensagem que a própria loja mandou, do celular. Precisa
    // aparecer na thread, senão a conversa fica pela metade.
    direcao: d.key.fromMe ? 'saida' : 'entrada',
    tipo,
    conteudo: conteudo ?? (tipo === 'texto' ? null : `[${tipo}]`),
    provider_message_id: d.key.id ?? null,
    quando: d.messageTimestamp ? new Date(Number(d.messageTimestamp) * 1000).toISOString() : undefined,
  };
}

/** Cloud API: entry[].changes[].value.messages[] */
function daCloud(corpo: Record<string, any>): Normalizada | null {
  const v = corpo?.entry?.[0]?.changes?.[0]?.value;
  const msg = v?.messages?.[0];
  if (!msg) return null;
  const perfil = v?.contacts?.[0];
  const tipo = msg.type === 'text' ? 'texto'
    : msg.type === 'image' ? 'imagem'
    : msg.type === 'video' ? 'video'
    : msg.type === 'audio' ? 'audio'
    : msg.type === 'document' ? 'documento'
    : String(msg.type ?? 'texto');
  const conteudo =
    msg.text?.body ?? msg.image?.caption ?? msg.video?.caption ??
    msg.document?.caption ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? null;
  return {
    telefone: String(msg.from ?? ''),
    nome: perfil?.profile?.name ?? null,
    direcao: 'entrada',
    tipo,
    conteudo: conteudo ?? `[${tipo}]`,
    provider_message_id: msg.id ?? null,
    quando: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const origem = url.searchParams.get('origem') ?? 'evolution';

  /* A Meta valida o webhook com um GET e espera o hub.challenge de volta,
     em texto puro. Sem isto ela nem chega a mandar mensagem. */
  if (req.method === 'GET') {
    const desafio = url.searchParams.get('hub.challenge');
    const token = url.searchParams.get('hub.verify_token');
    const esperado = Deno.env.get('WA_CLOUD_VERIFY_TOKEN');
    if (desafio && esperado && token === esperado) {
      return new Response(desafio, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('forbidden', { status: 403 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const corpo = await req.json();

    /* Estado da conexão da Evolution: mantém a instância em dia sem
       depender do cron de religar. */
    if (corpo?.event === 'connection.update' || corpo?.event === 'CONNECTION_UPDATE') {
      const estado = corpo?.data?.state ?? corpo?.data?.connection;
      const instancia = url.searchParams.get('instancia') ?? corpo?.instance;
      if (instancia && estado) {
        await db.from('wa_instancias').update({
          connection_state: estado,
          connected_at: estado === 'open' ? new Date().toISOString() : null,
          precisa_qr: estado === 'close' ? undefined : false,
          updated_at: new Date().toISOString(),
        }).eq('evolution_instance', instancia);
      }
      return ok({ ok: true, evento: 'conexao', estado });
    }

    const n = origem === 'cloud' ? daCloud(corpo) : daEvolution(corpo);
    if (!n || !n.telefone) return ok({ ok: true, ignorado: 'evento sem mensagem' });

    // Qual instância recebeu — é o que separa a caixa de cada número.
    let inst: { id: string } | null = null;
    if (origem === 'cloud') {
      const id = corpo?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      const { data } = await db.from('wa_instancias').select('id').eq('cloud_phone_number_id', id).maybeSingle();
      inst = data;
    } else {
      const nome = url.searchParams.get('instancia') ?? corpo?.instance;
      const { data } = await db.from('wa_instancias').select('id').eq('evolution_instance', nome).maybeSingle();
      inst = data;
    }
    if (!inst) return ok({ ok: true, ignorado: 'instância desconhecida' });

    /* Conversa: acha ou cria. O upsert na unique (instancia, telefone) evita
       que duas mensagens chegando juntas criem duas conversas do mesmo
       contato — que é o bug clássico dessa tela. */
    const { data: conversa } = await db.from('wa_conversas')
      .upsert({
        instancia_id: inst.id,
        telefone: n.telefone,
        nome: n.nome ?? undefined,
        ultima_mensagem: n.conteudo,
        ultima_mensagem_em: n.quando ?? new Date().toISOString(),
        ultima_direcao: n.direcao,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'instancia_id,telefone' })
      .select('id, nao_lidas')
      .maybeSingle();
    if (!conversa) return ok({ ok: true, ignorado: 'conversa não gravada' });

    const { error } = await db.from('wa_mensagens').insert({
      conversa_id: conversa.id,
      instancia_id: inst.id,
      direcao: n.direcao,
      tipo: n.tipo,
      conteudo: n.conteudo,
      media_url: n.media_url ?? null,
      provider_message_id: n.provider_message_id,
      status: 'recebida',
      created_at: n.quando ?? new Date().toISOString(),
    });
    // 23505 = já tínhamos esta mensagem. É o esperado, não erro.
    if (error && error.code !== '23505') console.error('wa-receber:', error);

    if (n.direcao === 'entrada' && !error) {
      await db.from('wa_conversas')
        .update({ nao_lidas: (conversa.nao_lidas ?? 0) + 1 })
        .eq('id', conversa.id);
    }

    return ok({ ok: true, conversa: conversa.id, repetida: error?.code === '23505' });
  } catch (e) {
    console.error('wa-receber:', e);
    // 200 mesmo no erro: reenvio em loop é pior que um evento perdido.
    return ok({ ok: false, erro: e instanceof Error ? e.message : 'erro' });
  }
});
