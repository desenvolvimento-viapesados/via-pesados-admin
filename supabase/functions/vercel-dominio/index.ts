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

    const { dominio, acao } = await req.json();
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

    /* Os dois, sempre. Registrar só a raiz deixava www.cliente.com.br
       fora do projeto: quem digitasse com www batia em erro da Vercel, e
       metade das pessoas digita com www. */
    const adicionar = async (nome: string) => {
      const r = await fetch(`${API}/v10/projects/${projeto}/domains${q}`, {
        method: 'POST', headers: h, body: JSON.stringify({ name: nome }),
      });
      const dados = await r.json();
      const jaExistia = r.status === 409 || dados?.error?.code === 'domain_already_in_use';
      if (!r.ok && !jaExistia) {
        return { nome, ok: false, detalhe: dados?.error?.message ?? dados };
      }
      const st = await (await fetch(`${API}/v9/projects/${projeto}/domains/${nome}${q}`, { headers: h })).json();
      return { nome, ok: true, jaExistia, verificado: st?.verified ?? null, pendencias: st?.verification ?? null };
    };

    /* O que a VERCEL diz que este domínio precisa, em vez de uma constante
       nossa. 76.76.21.21 é o IP legado: ainda atende, mas a conta já usa
       alvos por projeto (…vercel-dns-0NN.com) e um número chumbado no
       código envelhece sem avisar — o sintoma seria um domínio que não
       sobe, sem erro em lugar nenhum. */
    const config = async (nome: string) => {
      try {
        /* /v6/domains/{d}/config — o caminho é este. Eu tinha inventado um
           dentro de /projects/, que devolvia 404 e caía no fallback sem
           ninguém perceber: exatamente o tipo de falha silenciosa que esta
           função existe para evitar. */
        const r = await fetch(`${API}/v6/domains/${nome}/config${q}`, { headers: h });
        const c = await r.json();
        if (!r.ok) return { erro: c?.error?.message ?? `HTTP ${r.status}` };
        /* rank=1 é o preferido; a API devolve uma lista ordenada. */
        const melhor = (lista: unknown) =>
          Array.isArray(lista)
            ? (lista.find((x: { rank?: number }) => x?.rank === 1) ?? lista[0])?.value ?? null
            : null;
        return {
          mal_configurado: c?.misconfigured ?? null,
          ipv4: melhor(c?.recommendedIPv4),
          cname: melhor(c?.recommendedCNAME),
        };
      } catch (e) { return { erro: e instanceof Error ? e.message : 'falha' }; }
    };

    if (acao === 'config') {
      return json(200, { ok: true, raiz: await config(d), www: await config(`www.${d}`) });
    }

    const raiz = await adicionar(d);
    if (!raiz.ok) return json(502, { ok: false, estado: 'erro', detalhe: raiz.detalhe });
    // Falhar no www não invalida a raiz, que é a que serve o site.
    const www = await adicionar(`www.${d}`);

    return json(200, {
      ok: true,
      estado: raiz.jaExistia ? 'ja_estava' : 'adicionado',
      verificado: raiz.verificado,
      pendencias: raiz.pendencias,
      www: { ok: www.ok, verificado: www.ok ? www.verificado : null, detalhe: www.ok ? null : www.detalhe },
      // Os valores que o cliente tem de criar, ditos pela Vercel.
      config: { raiz: await config(d), www: await config(`www.${d}`) },
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
