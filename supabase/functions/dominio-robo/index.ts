import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Navegador } from '../_shared/cdp.ts';
import { CHAMAR_RB, LER_TELA, parecePainel, trabalhar, viaRegistroBr, type Plano } from '../_shared/robo-dns.ts';
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';

/**
 * O robô da conexão de domínio (23/11/2026). PÚBLICA: autentica pelo token do link
 * (clients.checkout_token), como a página de pagamento.
 *
 *   iniciar  {dominio}   → abre um navegador na nuvem (Browserbase) no painel de quem
 *                          cuida do DNS e devolve o id; o resto roda em segundo plano
 *   estado   {robo_id}   → a janela ao vivo, o que o robô está fazendo, o desfecho
 *   entrei   {robo_id}   → o cliente avisa que já entrou na conta
 *   parar    {robo_id}
 *
 * O cliente entra na própria conta pela janela ao vivo; o robô nunca vê senha.
 * No plano grátis da Browserbase a sessão acaba quando a conexão fecha, então tudo
 * acontece numa rodada só desta função (até ~6 minutos).
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const BB = 'https://api.browserbase.com/v1';
const PROPRIO = 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1';
const LIMITE_MS = 370_000;

/* Onde o cliente entra, por quem cuida do DNS. Sem endereço certo conhecido: a página
   inicial, com a barra de endereço visível para ele ir ao painel. */
const ENTRADA: Record<string, { url: string; barra?: boolean }> = {
  'Registro.br': { url: 'https://registro.br/painel/' },
  GoDaddy: { url: 'https://dcc.godaddy.com/control/portfolio' },
  Hostinger: { url: 'https://hpanel.hostinger.com/domains' },
  Cloudflare: { url: 'https://dash.cloudflare.com/' },
  KingHost: { url: 'https://painel.kinghost.com.br/login.php' },
  Locaweb: { url: 'https://centraldocliente.locaweb.com.br/' },
  HostGator: { url: 'https://cliente.hostgator.com.br/' },
  'UOL Host': { url: 'https://painelhost.uol.com.br/myProducts.html', barra: true },
  Namecheap: { url: 'https://ap.www.namecheap.com/domains/list/' },
  Wix: { url: 'https://manage.wix.com/account/domains' },
};

// deno-lint-ignore no-explicit-any
type Db = any;
const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function rodar(db: Db, id: string, token: string, plano: Plano) {
  const inicio = Date.now();
  const ate = inicio + LIMITE_MS;
  const gravar = (campos: Record<string, unknown>) =>
    db.from('dominio_robo').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', id);
  const chave = Deno.env.get('BROWSERBASE_API_KEY') ?? '';
  const projeto = Deno.env.get('BROWSERBASE_PROJECT_ID') ?? '';
  let nav: Navegador | null = null;
  let sessao = '';
  const passos: unknown[] = [];
  const passou = async (p: unknown) => { passos.push(p); await gravar({ passos: passos.slice(-40) }); };

  try {
    const h = { 'X-BB-API-Key': chave, 'Content-Type': 'application/json' };
    const s = await (await fetch(`${BB}/sessions`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ projectId: projeto, timeout: 900, browserSettings: { viewport: { width: 1280, height: 800 } }, region: 'us-east-1' }),
    })).json();
    if (!s?.id || !s?.connectUrl) throw new Error('Não consegui abrir o navegador na nuvem agora.');
    sessao = s.id;
    const entrada = (plano.provedor && ENTRADA[plano.provedor]) || { url: 'https://www.google.com/', barra: true };

    nav = await Navegador.conectar(s.connectUrl);
    await nav.prenderAba();
    await nav.ir(entrada.url);

    /* A janela ao vivo é por aba: quando o painel abre outra, a janela passa a mostrar a nova. */
    const atualizarJanela = async () => {
      const dbg = await (await fetch(`${BB}/sessions/${sessao}/debug`, { headers: h })).json().catch(() => null);
      const pagina = (dbg?.pages ?? []).find((p: { id: string }) => p.id === nav?.alvo);
      const base = String(pagina?.debuggerFullscreenUrl ?? dbg?.debuggerFullscreenUrl ?? '');
      const live = base && !entrada.barra ? `${base}${base.includes('?') ? '&' : '?'}navbar=false` : base;
      if (live) await gravar({ live_url: live });
    };
    await atualizarJanela();
    await gravar({
      sessao, estado: 'login',
      mensagem: plano.provedor
        ? `Entre na sua conta do ${plano.provedor} na janela abaixo. Depois toque em "Já entrei".`
        : 'Abra o site onde o seu domínio é administrado, entre na sua conta e toque em "Já entrei".',
    });

    const historico: string[] = [];
    for (;;) {
      /* Espera o cliente entrar (ou desistir). Percebe sozinho quando ele sai da tela de
         senha e cai no painel; o botão "Já entrei" adianta. */
      let viuSenha = false;
      let noPainel = 0;
      for (;;) {
        if (Date.now() > ate) throw new Error('O tempo da janela acabou. Tente de novo: é rapidinho.');
        const { data: r } = await db.from('dominio_robo').select('cliente_pronto, parar').eq('id', id).maybeSingle();
        if (r?.parar) { await gravar({ estado: 'parado', mensagem: 'Parado.' }); return; }
        if (r?.cliente_pronto) break;
        if (await nav.seguirAbaNova().catch(() => false)) await atualizarJanela();
        const temSenha = await nav.avaliar<boolean>(`!!document.querySelector('input[type=password]')`).catch(() => false);
        if (temSenha) viuSenha = true;
        noPainel = viuSenha && (await parecePainel(nav)) ? noPainel + 1 : 0;
        if (noPainel >= 3) break;
        await pausa(2000);
      }
      await gravar({ estado: 'trabalhando', mensagem: 'O robô está fazendo as mudanças. Não precisa mexer na janela.', cliente_pronto: false });
      /* Registro.br: o caminho direto (o mesmo do botão "Salvar alterações"); se algo
         não bater com o esperado, segue olhando a tela. */
      const direto = plano.provedor === 'Registro.br'
        ? await viaRegistroBr(nav, plano, ate, passou).catch(async (e) => {
          await passou({ quando: new Date().toISOString(), acao: 'erro', detalhe: `registro.br direto: ${e instanceof Error ? e.message : e}` });
          return null;
        })
        : null;
      const fim = direto ?? await trabalhar(nav, plano, ate, passou, atualizarJanela, historico);
      if (fim.tipo === 'precisa_cliente') {
        await gravar({ estado: 'login', mensagem: `${fim.mensagem} Depois toque em "Já entrei".`, cliente_pronto: false });
        continue;
      }
      if (fim.tipo === 'feito') {
        await gravar({ estado: 'feito', mensagem: 'Mudanças feitas. Agora é só a internet atualizar.' });
        /* Já começa a conferir: põe o domínio na Vercel e cutuca o certificado. */
        await fetch(`${PROPRIO}/dominio-cliente`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, acao: 'verificar', dominio: plano.dominio }),
        }).catch(() => null);
      } else {
        await gravar({ estado: 'falhou', mensagem: fim.motivo });
      }
      return;
    }
  } catch (e) {
    await gravar({ estado: 'falhou', mensagem: e instanceof Error ? e.message : 'Algo deu errado.' });
  } finally {
    nav?.fechar();
    if (sessao) {
      await fetch(`${BB}/sessions/${sessao}`, {
        method: 'POST', headers: { 'X-BB-API-Key': chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projeto, status: 'REQUEST_RELEASE' }),
      }).catch(() => null);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { token, acao, dominio, robo_id } = await req.json().catch(() => ({}));

    /* Diagnóstico (só com o segredo interno): abre uma janela no Registro.br, lê a tela,
       chama o painel e a IA uma vez, e devolve o que deu em cada parte. */
    if (acao === 'diagnostico') {
      if (!Deno.env.get('DOMINIO_SEGREDO') || req.headers.get('x-dominio-segredo') !== Deno.env.get('DOMINIO_SEGREDO')) return json(403, { error: 'não' });
      const out: Record<string, unknown> = {};
      const h = { 'X-BB-API-Key': Deno.env.get('BROWSERBASE_API_KEY') ?? '', 'Content-Type': 'application/json' };
      let sessao = '';
      let nav: Navegador | null = null;
      try {
        const s = await (await fetch(`${BB}/sessions`, { method: 'POST', headers: h, body: JSON.stringify({ projectId: Deno.env.get('BROWSERBASE_PROJECT_ID'), timeout: 120, browserSettings: { viewport: { width: 1280, height: 800 } }, region: 'us-east-1' }) })).json();
        sessao = s.id; out.sessao = !!s.id;
        nav = await Navegador.conectar(s.connectUrl);
        await nav.prenderAba();
        await nav.ir('https://registro.br/painel/');
        await pausa(5000);
        out.url = await nav.avaliar('location.href').catch((e) => `ERRO ${e}`);
        try { const t = await nav.avaliar<{ elementos: unknown[]; texto: string }>(LER_TELA); out.tela = { elementos: t?.elementos?.length, texto: t?.texto?.slice(0, 120) }; } catch (e) { out.tela = `ERRO ${e}`; }
        try { const r = await nav.avaliar(CHAMAR_RB('GET', '/v2/ajax/domains')); out.painel = r; } catch (e) { out.painel = `ERRO ${e}`; }
        try {
          const foto = await nav.foto();
          out.foto_kb = Math.round(foto.length * 0.75 / 1024);
          const ia = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
          const r = await ia.messages.create({
            model: 'claude-opus-5-5', max_tokens: 300, tools: [{ name: 'responder', description: 'responde', input_schema: { type: 'object', properties: { tela: { type: 'string' } }, required: ['tela'] } }],
            tool_choice: { type: 'auto' },
            messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: foto } }, { type: 'text', text: 'Que tela é esta?' }] }],
          // deno-lint-ignore no-explicit-any
          } as any);
          // deno-lint-ignore no-explicit-any
          out.ia = (r.content as any[]).find((b) => b.type === 'tool_use')?.input ?? r.content;
        } catch (e) { out.ia = `ERRO ${e instanceof Error ? e.message : e}`; }
      } catch (e) { out.erro = e instanceof Error ? e.message : String(e); }
      finally {
        nav?.fechar();
        if (sessao) await fetch(`${BB}/sessions/${sessao}`, { method: 'POST', headers: h, body: JSON.stringify({ projectId: Deno.env.get('BROWSERBASE_PROJECT_ID'), status: 'REQUEST_RELEASE' }) }).catch(() => null);
      }
      return json(200, out);
    }
    const t = String(token ?? '');
    if (t.length < 16) return json(404, { error: 'Link inválido.' });
    const { data: c } = await db.from('clients').select('id').eq('checkout_token', t).maybeSingle();
    if (!c) return json(404, { error: 'Link inválido ou vencido.' });

    if (acao === 'iniciar') {
      if (!Deno.env.get('BROWSERBASE_API_KEY') || !Deno.env.get('ANTHROPIC_API_KEY')) {
        return json(503, { error: 'A conexão automática está indisponível agora. Use "Prefiro fazer sozinho".' });
      }
      /* Uma de cada vez por loja. */
      await db.from('dominio_robo').update({ parar: true }).eq('client_id', c.id).in('estado', ['abrindo', 'login', 'trabalhando']);
      const p = await (await fetch(`${PROPRIO}/dominio-cliente`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t, acao: 'preparar', dominio }),
      })).json();
      if (!p?.ok) return json(400, { error: p?.error ?? 'Não consegui ler o domínio.' });
      const plano: Plano = { dominio: p.dominio, provedor: p.provedor, apagar: p.apagar, criar: p.criar, manter: p.manter };
      const { data: linha } = await db.from('dominio_robo')
        .insert({ client_id: c.id, dominio: plano.dominio, provedor: plano.provedor, mensagem: 'Abrindo a janela…' })
        .select('id').single();
      // @ts-ignore EdgeRuntime existe no Supabase
      EdgeRuntime.waitUntil(rodar(db, linha.id, t, plano));
      return json(200, { ok: true, robo_id: linha.id, provedor: plano.provedor, nada_a_fazer: !plano.apagar.length && !plano.criar.length });
    }

    if (!robo_id) return json(400, { error: 'robo_id obrigatório' });
    const { data: r } = await db.from('dominio_robo').select('*').eq('id', robo_id).eq('client_id', c.id).maybeSingle();
    if (!r) return json(404, { error: 'Não achei esta conexão.' });

    if (acao === 'estado') {
      const passos = (r.passos ?? []).filter((p: { acao: string }) => p.acao !== 'erro').slice(-8).map((p: { detalhe: string }) => p.detalhe).filter(Boolean);
      return json(200, { ok: true, estado: r.estado, mensagem: r.mensagem, live_url: r.live_url, provedor: r.provedor, passos });
    }
    if (acao === 'entrei') {
      await db.from('dominio_robo').update({ cliente_pronto: true }).eq('id', r.id);
      return json(200, { ok: true });
    }
    if (acao === 'parar') {
      await db.from('dominio_robo').update({ parar: true }).eq('id', r.id);
      return json(200, { ok: true });
    }
    return json(400, { error: 'Ação desconhecida' });
  } catch (e) {
    console.error('dominio-robo:', e);
    return json(500, { error: 'Algo deu errado do nosso lado.' });
  }
});
