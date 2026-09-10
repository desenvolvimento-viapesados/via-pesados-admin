import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Adiciona o domínio do cliente ao projeto na Vercel.
 *
 * Era o único passo manual da conexão, e o pior deles: invisível. Ninguém
 * lembra de fazer, e o sintoma — "não abre" — é idêntico ao de um DNS
 * errado do cliente. Automatizar tira a etapa que só falha por esquecimento.
 *
 * Sem VERCEL_TOKEN a função responde 'nao_configurado' em vez de erro: o
 * fluxo continua manual, a tela avisa, e nada quebra.
 *
 * O projeto é descoberto sozinho — o que já serve viapesados.com.br — para
 * não haver um id a mais para configurar e errar.
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const API = 'https://api.vercel.com';
const DOMINIO_MATRIZ = 'viapesados.com.br';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const token = Deno.env.get('VERCEL_TOKEN');
  const time = Deno.env.get('VERCEL_TEAM_ID');
  const q = time ? `?teamId=${time}` : '';

  try {
    // Só membro ativo: isto mexe na infraestrutura de produção.
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user } } = await db.auth.getUser(auth);
    if (!user) return json(401, { error: 'não autenticado' });
    const { data: m } = await db.from('team_members').select('is_active').eq('id', user.id).maybeSingle();
    if (!m || m.is_active === false) return json(403, { error: 'acesso negado' });

    const { dominio } = await req.json();
    const d = String(dominio ?? '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!d.includes('.')) return json(400, { error: 'Domínio inválido.' });

    if (!token) {
      return json(200, {
        ok: false, estado: 'nao_configurado',
        mensagem: 'VERCEL_TOKEN não configurado — adicione o domínio na Vercel à mão.',
      });
    }

    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    /* Acha o projeto pelo domínio matriz. Um id fixo no código seria mais
       curto e quebraria calado no dia em que o projeto fosse recriado. */
    let projeto = Deno.env.get('VERCEL_PROJECT_ID') ?? '';
    if (!projeto) {
      const lista = await (await fetch(`${API}/v9/projects${q}`, { headers: h })).json();
      const achado = (lista?.projects ?? []).find((p: { alias?: Array<{ domain: string }> }) =>
        (p.alias ?? []).some((a) => a.domain?.endsWith(DOMINIO_MATRIZ)));
      projeto = achado?.id ?? (lista?.projects ?? [])[0]?.id ?? '';
      if (!projeto) return json(502, { ok: false, estado: 'projeto_nao_encontrado' });
    }

    const r = await fetch(`${API}/v10/projects/${projeto}/domains${q}`, {
      method: 'POST', headers: h, body: JSON.stringify({ name: d }),
    });
    const dados = await r.json();

    // Domínio já adicionado não é erro — é o estado que queríamos.
    const jaExistia = r.status === 409 || dados?.error?.code === 'domain_already_in_use';
    if (!r.ok && !jaExistia) {
      return json(502, { ok: false, estado: 'erro', detalhe: dados?.error?.message ?? dados });
    }

    // Confere a verificação: adicionado não é o mesmo que servindo.
    const st = await (await fetch(`${API}/v9/projects/${projeto}/domains/${d}${q}`, { headers: h })).json();
    return json(200, {
      ok: true,
      estado: jaExistia ? 'ja_estava' : 'adicionado',
      verificado: st?.verified ?? null,
      pendencias: st?.verification ?? null,
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
