/**
 * A senha do cliente passa do pop-up para o robô cifrada (AES-GCM, chave derivada do
 * DOMINIO_SEGREDO) e a linha é apagada assim que o robô lê. Nunca vai para log, passo
 * ou IA: só é digitada no campo de senha do painel (23/11/2026).
 */
async function chave(): Promise<CryptoKey> {
  const s = new TextEncoder().encode(Deno.env.get('DOMINIO_SEGREDO') ?? '');
  const h = await crypto.subtle.digest('SHA-256', s);
  return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const deb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function cifrar(dado: Record<string, string>): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chave(), new TextEncoder().encode(JSON.stringify(dado))));
  return `${b64(iv)}.${b64(c)}`;
}

export async function decifrar(texto: string): Promise<Record<string, string> | null> {
  try {
    const [iv, c] = texto.split('.');
    const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(iv) }, await chave(), deb64(c));
    return JSON.parse(new TextDecoder().decode(p));
  } catch { return null; }
}
