/**
 * Acesso à Evolution API, através do projeto do lojista.
 *
 * As credenciais da Evolution moram só lá, e continuam lá de propósito: o
 * servidor é o mesmo, e ter a chave em dois projetos significaria dois
 * lugares para girá-la e dois de onde ela pode vazar. Aqui só existe o
 * segredo interno que os dois já compartilham.
 *
 * A passagem do outro lado aceita apenas os caminhos que este arquivo usa.
 */
const PASSAGEM = 'https://ljjkerbczuwmxdbnxfes.supabase.co/functions/v1/evolution-proxy';

export async function evolution(
  caminho: string,
  instancia: string | undefined,
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  corpo?: unknown,
) {
  const segredo = Deno.env.get('WA_INTERNAL_SECRET');
  if (!segredo) throw new Error('WA_INTERNAL_SECRET ausente');
  /* Teto explícito: a Evolution às vezes fica pendurada, e sem isto a nossa
     função morre por tempo e devolve 5xx sem corpo — erro que não explica
     nada para quem está olhando a tela. */
  const corta = AbortSignal.timeout(20_000);
  const r = await fetch(PASSAGEM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-interno': segredo },
    body: JSON.stringify({ caminho, instancia, metodo, corpo }),
    signal: corta,
  }).catch(() => { throw new Error('A Evolution não respondeu a tempo.'); });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.ok) throw new Error(d?.error ?? `passagem respondeu ${r.status}`);
  return d.dados;
}

export const webhookDaInstancia = (instancia: string) =>
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/wa-receber?origem=evolution&instancia=${encodeURIComponent(instancia)}`;

/* Confirmado contra o servidor v2.1.1: o corpo precisa vir embrulhado numa
   chave "webhook" de primeiro nível, ao contrário do que a maioria dos
   exemplos publicados mostra. */
export async function garantirWebhook(instancia: string) {
  try {
    await evolution('webhook/set', instancia, 'POST', {
      webhook: {
        enabled: true,
        url: webhookDaInstancia(instancia),
        webhookByEvents: false,
        webhookBase64: true,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    });
  } catch (e) {
    console.warn('webhook/set falhou:', e);
  }
}

export async function criarInstancia(instancia: string) {
  try {
    return await evolution('instance/create', undefined, 'POST', {
      instanceName: instancia, qrcode: true, integration: 'WHATSAPP-BAILEYS',
    });
  } catch (e) {
    // Dois pedidos de QR quase simultâneos faziam os dois verem "não existe" e
    // os dois tentarem criar; o segundo estourava e a tela ficava sem QR
    // nenhum. Instância já existir é sucesso, não erro.
    if (/already in use|already exists|\[403\]/i.test(String(e))) return null;
    throw e;
  }
}

/** Número cru para envio. LID não é telefone e precisa do sufixo explícito. */
export function paraEnvio(bruto: string): string {
  const n = String(bruto).replace(/\D/g, '');
  if (/^(55|1|44|34|49|33|39|351|54|56|57|58|52|51|595|598)\d{7,13}$/.test(n)) return n;
  if (bruto.includes('@g.us') || bruto.includes('-group')) return bruto;
  return `${n}@lid`;
}

/** Tira os sufixos de JID e devolve o telefone puro. */
export const semSufixo = (bruto: string) =>
  String(bruto).replace('@s.whatsapp.net', '').replace('@c.us', '')
    .replace('@g.us', '').replace(/@lid$/i, '').trim();
