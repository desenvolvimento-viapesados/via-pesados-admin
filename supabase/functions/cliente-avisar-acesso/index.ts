import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate, primeiroNome } from '../_shared/wa.ts';

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
      .select('id, company_name, contact_name, whatsapp').eq('id', client_id).maybeSingle();
    if (!c) return json(404, { error: 'cliente não encontrado' });
    if (!c.whatsapp) return json(400, { error: 'Cliente sem WhatsApp cadastrado.' });

    const r = await enviarTemplate(db, {
      para: c.whatsapp,
      template: 'acesso_liberado',
      client_id: c.id,
      chave: `acesso_liberado:${c.id}`,
      params: { body: [primeiroNome(c.contact_name), c.company_name] },
    });
    return json(200, r);
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
