import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate, primeiroNome } from '../_shared/wa.ts';
import { tentarNotasPendentes } from '../_shared/nota-aviso.ts';

/**
 * Avisa o lojista de que o sistema está no ar.
 *
 * MANUAL DE PROPÓSITO, e é a única mensagem da régua que é. Pagamento
 * confirmado não quer dizer loja pronta — falta estoque importado, marca no
 * lugar, canais conectados. Quem sabe que chegou nesse ponto é a pessoa que
 * montou, não o webhook. Por isso nasce de um botão.
 *
 * Uma vez por cliente: a chave é o id dele, sem data. Um segundo clique não
 * manda a segunda mensagem.
 */
const LOJISTA_FUNCTIONS = 'https://ljjkerbczuwmxdbnxfes.supabase.co/functions/v1';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // Só membro ativo da equipe dispara: é uma mensagem em nome da Via
    // Pesados para um cliente pagante.
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user } } = await db.auth.getUser(auth);
    if (!user) return json(401, { error: 'não autenticado' });
    const { data: membro } = await db.from('team_members')
      .select('id, is_active').eq('id', user.id).maybeSingle();
    if (!membro || membro.is_active === false) return json(403, { error: 'acesso negado' });

    const { client_id } = await req.json();
    if (!client_id) return json(400, { error: 'client_id é obrigatório' });

    const { data: c } = await db.from('clients')
      .select('id, company_name, contact_name, whatsapp, admin_email, lojista_company_id')
      .eq('id', client_id).maybeSingle();
    if (!c) return json(404, { error: 'cliente não encontrado' });
    if (!c.whatsapp) return json(400, { error: 'Cliente sem WhatsApp cadastrado.' });
    if (!c.admin_email || !c.lojista_company_id) {
      return json(400, { error: 'Cliente ainda não tem sistema. Crie o sistema antes de avisar o acesso.' });
    }

    /* O convite nasce agora, não na venda: vale 24 horas, e um token criado
       no fechamento estaria morto quando alguém clicasse em avisar. */
    const conv = await fetch(`${LOJISTA_FUNCTIONS}/admin-provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify({
        action: 'criar_convite',
        company_id: c.lojista_company_id,
        admin_email: c.admin_email,
        admin_full_name: c.contact_name,
      }),
    });
    const convite = await conv.json();
    if (!conv.ok || convite.error) {
      return json(502, { error: `Não consegui gerar o link de primeiro acesso: ${convite.error ?? conv.status}` });
    }

    /* acesso_equipe em vez de acesso_liberado. Os dois estão aprovados, mas
       o botão do acesso_liberado tem URL fixa (/lojista) e a Meta só aceita
       variável no FIM da URL — ele levaria o cliente a uma tela de login sem
       senha. O acesso_equipe já foi aprovado com /entrar/{{1}}. */
    const r = await enviarTemplate(db, {
      para: c.whatsapp,
      template: 'acesso_equipe',
      client_id: c.id,
      // A chave continua sendo a de acesso_liberado: é ela que o portão da
      // primeira nota consulta, e o evento é o mesmo — o acesso saiu.
      chave: `acesso_liberado:${c.id}`,
      params: { body: [primeiroNome(c.contact_name), c.company_name], urlSuffix: convite.token },
    });
    /* Acesso liberado é o portão da PRIMEIRA nota. Se ela já foi emitida e
       estava esperando, sai agora — nesta ordem: primeiro o sistema, depois
       o documento fiscal dele. */
    let notas: unknown = null;
    if (r.ok) {
      try { notas = await tentarNotasPendentes(db, c.id); }
      catch (e) { notas = { erro: e instanceof Error ? e.message : 'falha' }; }
    }

    return json(200, { ...r, notas });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
