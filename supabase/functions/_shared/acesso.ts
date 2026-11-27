/**
 * Quem está chamando esta função?
 *
 * Quase todas as funções do painel sobem sem verificação de JWT (as rotinas e
 * os webhooks chamam sem login). E mesmo com verificação, a chave anon é
 * pública. Então cada função confere quem chama no próprio código, por aqui.
 *
 * Passa quem tiver UMA destas provas:
 * - `cron`: o cabeçalho `x-cron` igual a CRON_SECRET (as rotinas do pg_cron);
 * - `interno`: o cabeçalho `x-interno` igual a WA_INTERNAL_SECRET (função chamando função);
 * - `servico`: a chave de serviço do projeto no Authorization (terminal da equipe);
 * - `membro` / `admin`: o login de um membro ativo da equipe (o painel).
 *
 * Sem segredo configurado, aquela prova não vale: falha fechada.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type Prova = 'cron' | 'interno' | 'servico' | 'membro' | 'admin';

/** Comparação que não vaza pelo tempo quantos caracteres bateram. */
export function confere(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (!x.length || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-frente',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function negar(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/**
 * Devolve `null` quando a chamada pode seguir, ou a Response de recusa.
 * `aceita` lista as provas que esta função aceita. `admin` exige papel admin;
 * `membro` aceita qualquer membro ativo (e admin também).
 */
export async function exigir(req: Request, aceita: Prova[]): Promise<Response | null> {
  const env = (k: string) => Deno.env.get(k) ?? '';

  if (aceita.includes('cron') && env('CRON_SECRET') && confere(req.headers.get('x-cron') ?? '', env('CRON_SECRET'))) return null;
  if (aceita.includes('interno') && env('WA_INTERNAL_SECRET') && confere(req.headers.get('x-interno') ?? '', env('WA_INTERNAL_SECRET'))) return null;

  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (aceita.includes('servico') && bearer && env('SUPABASE_SERVICE_ROLE_KEY') && confere(bearer, env('SUPABASE_SERVICE_ROLE_KEY'))) return null;

  if (aceita.includes('membro') || aceita.includes('admin')) {
    if (!bearer) return negar(401, 'não autenticado');
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: { user } } = await db.auth.getUser(bearer).catch(() => ({ data: { user: null } }));
    if (!user) return negar(401, 'não autenticado');
    const { data: m } = await db.from('team_members').select('role, is_active').eq('id', user.id).maybeSingle();
    if (!m || m.is_active === false) return negar(403, 'acesso negado');
    if (!aceita.includes('membro') && m.role !== 'admin') return negar(403, 'só administradores');
    return null;
  }
  return negar(401, 'não autorizado');
}

/** Cabeçalhos para o painel chamar uma função com o login de quem está nele. */
export const CORS_ACESSO = cors;
