/**
 * API de Conversões da Meta — o clique no WhatsApp da landing, pelo servidor.
 *
 * O pixel avisa a Meta pelo navegador, e o navegador às vezes não deixa:
 * Safari, iPhone e bloqueador de anúncio derrubam o fbevents.js, e o clique
 * que era a conversão some da campanha. Aqui o mesmo evento chega pelo
 * servidor, com o MESMO event_id do pixel — a Meta junta os dois e conta um.
 *
 * Pública (a landing não tem login), então desconfia de tudo que chega:
 * só o evento Contact, só de páginas do viapesados.com.br, com teto por IP.
 * O token da Meta mora no segredo META_CAPI_TOKEN e nunca sai daqui.
 */

const PIXEL = '1439814911458702';
const VERSAO_GRAPH = 'v21.0';
const ORIGENS = ['https://viapesados.com.br', 'https://www.viapesados.com.br'];

const cors = (origem: string | null) => ({
  'Access-Control-Allow-Origin': origem && ORIGENS.includes(origem) ? origem : ORIGENS[0],
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

/* Teto por IP, na memória da instância: o bastante para um curioso não
   encher a campanha de conversão falsa num laço. */
const LIMITE = 20; // por minuto
const vistos = new Map<string, number[]>();
function passouDoLimite(ip: string): boolean {
  const agora = Date.now();
  const recentes = (vistos.get(ip) ?? []).filter((t) => agora - t < 60_000);
  recentes.push(agora);
  vistos.set(ip, recentes);
  if (vistos.size > 5000) vistos.clear();
  return recentes.length > LIMITE;
}

const texto = (v: unknown, max: number) =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined;

Deno.serve(async (req) => {
  const origem = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origem) });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: cors(origem) });

  /* sendBeacon manda Origin; um curl sem Origin não passa. */
  if (!origem || !ORIGENS.includes(origem)) return new Response(null, { status: 403, headers: cors(origem) });

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (ip && passouDoLimite(ip)) return new Response(null, { status: 429, headers: cors(origem) });

  let corpo: Record<string, unknown>;
  try { corpo = JSON.parse(await req.text()); } catch { return new Response(null, { status: 400, headers: cors(origem) }); }

  const eventId = texto(corpo.event_id, 64);
  const url = texto(corpo.url, 500);
  if (corpo.event_name !== 'Contact' || !eventId || !url || !ORIGENS.some((o) => url.startsWith(o + '/'))) {
    return new Response(null, { status: 400, headers: cors(origem) });
  }

  const token = Deno.env.get('META_CAPI_TOKEN');
  if (!token) {
    console.warn('[meta-conversao] sem META_CAPI_TOKEN — evento descartado', eventId);
    return new Response(null, { status: 503, headers: cors(origem) });
  }

  const userData: Record<string, string> = {};
  if (ip) userData.client_ip_address = ip;
  const ua = req.headers.get('user-agent');
  if (ua) userData.client_user_agent = ua.slice(0, 500);
  const fbp = texto(corpo.fbp, 200);
  const fbc = texto(corpo.fbc, 500);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const evento = {
    event_name: 'Contact',
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: 'website',
    event_source_url: url,
    user_data: userData,
    custom_data: { content_name: texto(corpo.content_name, 200) ?? new URL(url).pathname },
  };
  /* Código de teste do Gerenciador de Eventos ("TEST12345"): só para
     conferir a instalação na aba Eventos de teste. */
  const teste = texto(corpo.test_event_code, 20);
  const payload: Record<string, unknown> = { data: [evento] };
  if (teste && /^TEST\d+$/.test(teste)) payload.test_event_code = teste;

  const res = await fetch(`https://graph.facebook.com/${VERSAO_GRAPH}/${PIXEL}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const resposta = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[meta-conversao] a Meta recusou', res.status, JSON.stringify(resposta?.error ?? resposta).slice(0, 500));
    return new Response(null, { status: 502, headers: cors(origem) });
  }
  console.log('[meta-conversao] ok', eventId, resposta?.events_received);
  return new Response(null, { status: 204, headers: cors(origem) });
});
