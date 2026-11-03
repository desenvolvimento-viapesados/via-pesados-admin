/**
 * Áudio e foto guardados no bucket privado `wa-midia` ({conversa_id}/{mensagem_id}.{ext}).
 *
 * Arquivo leve de propósito (sem a IA): o wa-receber importa daqui para guardar na hora
 * a mídia da Evolution, que só existe dentro do evento.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

/** O bucket privado onde áudio e foto ficam guardados (o link do provedor expira). */
export const BUCKET = 'wa-midia';

const EXTENSAO: Record<string, string> = {
  'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
  'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};
export const tipoBase = (mime: string | null | undefined) => String(mime ?? '').split(';')[0].trim().toLowerCase();
export const extensaoDe = (mime: string | null | undefined) => EXTENSAO[tipoBase(mime)] ?? 'bin';

export function deBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]+,/, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function paraBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Guarda o arquivo no bucket privado e marca a mensagem. Devolve o caminho. */
export async function guardarMidia(db: Db, conversaId: string, mensagemId: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const caminho = `${conversaId}/${mensagemId}.${extensaoDe(mime)}`;
  const { error } = await db.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipoBase(mime) || 'application/octet-stream', upsert: true });
  if (error) { console.warn('assistente: não guardou a mídia', error.message); return null; }
  await db.from('wa_mensagens').update({ media_salva: caminho }).eq('id', mensagemId);
  return caminho;
}

