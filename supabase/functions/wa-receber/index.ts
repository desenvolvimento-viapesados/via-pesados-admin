import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { semSufixo } from '../_shared/evolution.ts';

/**
 * Entrada de mensagens, das TRÊS origens, no mesmo modelo.
 *
 *   ?origem=evolution  → números da equipe, no aplicativo (webhook da Evolution)
 *   ?origem=cloud      → número na API oficial direto na Meta (webhook da Meta)
 *   ?origem=ycloud     → número oficial pelo BSP (webhook da YCloud)
 *
 * O que faz este arquivo valer a pena é a normalização: cada provedor entrega
 * um formato diferente, e a interface não deveria saber disso. Daqui para
 * dentro, mensagem é mensagem.
 *
 * DUAS REGRAS QUE OS PROVEDORES IMPÕEM:
 *
 *  1. Entrega repetida. Todos reenviam o mesmo evento — a unique em
 *     provider_message_id é o que impede a conversa de encher de duplicatas.
 *
 *  2. Responder fora de 2xx faz reenviar em loop e, na Meta, chega a
 *     desabilitar o webhook. Por isso quase tudo aqui devolve 200, mesmo o
 *     que não soubemos tratar — inclusive a assinatura que não confere.
 *
 * A YCloud traz um terceiro assunto que os outros dois não tinham: além da
 * mensagem que chega, ela avisa o que aconteceu com a que saiu (entregue,
 * lida, falhou) e o veredito da Meta sobre cada modelo.
 */

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', };
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

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

const TIPO_YCLOUD: Record<string, string> = {
  text: 'texto', image: 'imagem', video: 'video', audio: 'audio',
  document: 'documento', sticker: 'figurinha', location: 'localizacao',
  contacts: 'contato', button: 'texto', interactive: 'texto', reaction: 'reacao',
};

/**
 * YCloud: o evento `whatsapp.inbound_message.received`.
 *
 * O objeto é plano — sem os três níveis de `entry/changes/value` da Meta —
 * e os telefones vêm em E.164 com o "+", que o resto do sistema não usa.
 */
function daYCloud(corpo: Record<string, any>): Normalizada | null {
  const m = corpo?.whatsappInboundMessage;
  if (!m) return null;
  const tipo = TIPO_YCLOUD[String(m.type ?? 'text')] ?? String(m.type ?? 'texto');
  const conteudo =
    m.text?.body ?? m.image?.caption ?? m.video?.caption ?? m.document?.caption ??
    m.button?.text ?? m.interactive?.buttonReply?.title ?? m.interactive?.listReply?.title ??
    m.reaction?.emoji ?? null;
  return {
    telefone: soDigitos(m.from),
    // O nome do perfil do WhatsApp — é o que aparece na lista antes de
    // alguém casar o telefone com um cliente.
    nome: m.customerProfile?.name ?? null,
    direcao: 'entrada',
    tipo,
    conteudo: conteudo ?? `[${tipo}]`,
    media_url: m.image?.link ?? m.video?.link ?? m.audio?.link ?? m.document?.link ?? null,
    provider_message_id: m.id ?? m.wamid ?? null,
    // Já vem em ISO 8601; converter de novo só arriscaria estragar.
    quando: typeof m.sendTime === 'string' ? m.sendTime : undefined,
  };
}

/** Comparação que não vaza, pelo tempo, quantos caracteres bateram. */
function mesmoTexto(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/**
 * A assinatura da YCloud: `YCloud-Signature: t={unix},s={hmac}`, onde o
 * HMAC-SHA256 é calculado sobre `{t}.{corpo cru}` com o segredo do
 * endpoint.
 *
 * O corpo tem de ser o texto EXATO recebido — `JSON.stringify` do objeto
 * já parseado muda espaços e ordem, e a conta nunca fecha.
 *
 * Não se confere a idade do carimbo. O reenvio legítimo da YCloud pode
 * chegar muito depois, e a unique em provider_message_id já barra o
 * evento repetido; rejeitar por tempo trocaria um risco pequeno por
 * mensagem de cliente perdida.
 */
async function assinaturaConfere(cru: string, cabecalho: string | null, segredo: string) {
  const m = /t=(\d+)\s*,\s*s=([0-9a-fA-F]+)/.exec(cabecalho ?? '');
  if (!m) return false;
  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`${m[1]}.${cru}`));
  const calculado = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return mesmoTexto(calculado, m[2].toLowerCase());
}

/* O status da mensagem que saiu. Ordem importa: a YCloud pode entregar
   `delivered` depois de `read` — sem esta escada, a tela voltaria a dizer
   "entregue" numa mensagem que o cliente já leu. */
const STATUS_YCLOUD: Record<string, string> = {
  accepted: 'enviada', sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou',
};
const DEGRAU: Record<string, number> = { enviada: 1, entregue: 2, lida: 3 };

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
    /* Texto cru primeiro: a assinatura da YCloud é calculada sobre ele. */
    const cru = await req.text();
    const corpo = JSON.parse(cru || '{}');

    if (origem === 'ycloud') {
      const { data: wh } = await db.from('wa_webhook')
        .select('segredo').eq('provedor', 'ycloud').maybeSingle();
      if (!wh?.segredo) {
        /* Sem segredo gravado a URL é pública e não dá para saber quem
           mandou. Aceitar aqui deixaria qualquer um escrever na caixa do
           número oficial. */
        console.error('wa-receber: evento da YCloud sem segredo gravado — ligue a entrega de eventos no painel');
        return ok({ ok: true, ignorado: 'sem segredo gravado' });
      }
      if (!await assinaturaConfere(cru, req.headers.get('YCloud-Signature'), wh.segredo)) {
        console.warn('wa-receber: assinatura da YCloud não confere');
        return ok({ ok: true, ignorado: 'assinatura inválida' });
      }
    }

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

    /* ── YCloud: o que aconteceu com a mensagem que saiu ─────────── */
    if (origem === 'ycloud' && corpo?.whatsappMessage) {
      const m = corpo.whatsappMessage;
      const novo = STATUS_YCLOUD[String(m.status ?? '')] ?? String(m.status ?? '');
      const ids = [m.id, m.wamid].filter(Boolean).map(String);
      if (!novo || !ids.length) return ok({ ok: true, ignorado: 'status sem id' });

      const { data: atual } = await db.from('wa_mensagens')
        .select('id, status').in('provider_message_id', ids).limit(1).maybeSingle();
      if (atual && (novo === 'falhou' || (DEGRAU[novo] ?? 0) > (DEGRAU[atual.status ?? ''] ?? 0))) {
        await db.from('wa_mensagens').update({ status: novo }).eq('id', atual.id);
      }

      /* Template que o provedor aceitou e a Meta depois recusou ficava
         marcado como enviado para sempre. Registrar o motivo em wa_envios
         não reabre a trava — a linha continua lá, e ninguém reenvia. */
      if (novo === 'falhou') {
        const motivo = m?.error?.message ?? m?.errorMessage ?? m?.error?.title ?? 'a Meta recusou a entrega';
        await db.from('wa_envios').update({ erro: String(motivo).slice(0, 400) }).in('message_id', ids);
      }
      return ok({ ok: true, evento: 'status', status: novo, conhecida: !!atual });
    }

    /* ── YCloud: veredito da Meta sobre um modelo ────────────────── */
    if (origem === 'ycloud' && corpo?.whatsappTemplate) {
      const t = corpo.whatsappTemplate;
      /* Não há tabela de modelos: a tela lê o status ao vivo da YCloud.
         O que falta é ficar sabendo da reprovação sem abrir a tela — e o
         log é onde isso aparece hoje. */
      console.log('wa-receber: modelo revisado —',
        JSON.stringify({ nome: t.name, idioma: t.language, status: t.status, motivo: t.rejectedReason ?? t.reason ?? null }));
      return ok({ ok: true, evento: 'modelo', status: t.status });
    }

    const n = origem === 'ycloud' ? daYCloud(corpo)
      : origem === 'cloud' ? daCloud(corpo)
      : daEvolution(corpo);
    if (!n || !n.telefone) return ok({ ok: true, ignorado: 'evento sem mensagem' });

    // Qual instância recebeu — é o que separa a caixa de cada número.
    let inst: { id: string } | null = null;
    if (origem === 'ycloud') {
      /* O destino é o NOSSO número. Casa pelo telefone; se o cadastro
         estiver com outra grafia, a única instância da YCloud resolve —
         melhor a caixa certa por dedução do que mensagem descartada. */
      const nosso = soDigitos(corpo?.whatsappInboundMessage?.to);
      const { data } = await db.from('wa_instancias').select('id').eq('telefone', nosso).maybeSingle();
      inst = data;
      if (!inst) {
        const { data: unica } = await db.from('wa_instancias').select('id').eq('origem', 'ycloud');
        inst = unica?.length === 1 ? unica[0] : null;
      }
    } else if (origem === 'cloud') {
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
