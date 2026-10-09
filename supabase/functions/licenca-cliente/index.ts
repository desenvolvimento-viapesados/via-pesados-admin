import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { alinharCiclo } from '../_shared/ciclo.ts';
import { pedirAoLojista } from '../_shared/licenca.ts';
import { hojeBRT, somarDias, DIAS_DE_TOLERANCIA } from '../_shared/regua.ts';

/**
 * O que a equipe faz na mão com a licença de um cliente, pela ficha:
 *
 *   alinhar  { client_id, implantado_em }  → muda a data de implantação e
 *            move os vencimentos em aberto no Asaas para contar dela.
 *   liberar  { client_id }                 → devolve o acesso antes de o
 *            pagamento cair (promessa de pagamento, erro do banco...). Vale
 *            pela mesma tolerância de 2 dias: sem isso a rotina das 9h
 *            cortaria de novo na manhã seguinte.
 *
 * Só membro ativo da equipe. O corte automático não passa por aqui — é da
 * rotina diária (cobranca-lembrete).
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user } } = await db.auth.getUser(auth);
    if (!user) return json(401, { error: 'não autenticado' });
    const { data: membro } = await db.from('team_members').select('id, is_active').eq('id', user.id).maybeSingle();
    if (!membro || membro.is_active === false) return json(403, { error: 'acesso negado' });

    const { acao, client_id, implantado_em } = await req.json();
    const { data: c } = await db.from('clients')
      .select('id, company_name, lojista_company_id, asaas_subscription_id, acesso_suspenso_em')
      .eq('id', client_id).maybeSingle();
    if (!c) return json(404, { error: 'cliente não encontrado' });

    if (acao === 'alinhar') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(implantado_em ?? ''))) return json(400, { error: 'Informe a data de implantação' });
      const r = await alinharCiclo(db, c, implantado_em);
      await db.from('activities').insert({
        client_id: c.id, kind: 'nota', author_id: user.id,
        content: `Data de implantação definida em ${implantado_em.split('-').reverse().join('/')}`
          + (r.mudancas.length ? ` — vencimentos movidos: ${r.mudancas.map((m) => `${m.de.split('-').reverse().join('/')} → ${m.para.split('-').reverse().join('/')}`).join(', ')}.` : '.'),
      });
      return json(200, { ok: true, ...r });
    }

    if (acao === 'liberar') {
      if (!c.lojista_company_id) return json(400, { error: 'Cliente sem sistema' });
      const r = await pedirAoLojista({ acao: 'liberar', company_id: c.lojista_company_id });
      if (!r.ok) return json(502, { error: r.motivo });
      const ate = somarDias(hojeBRT(), DIAS_DE_TOLERANCIA);
      await db.from('clients').update({ acesso_suspenso_em: null, acesso_liberado_ate: ate }).eq('id', c.id);
      await db.from('activities').insert({
        client_id: c.id, kind: 'nota', author_id: user.id,
        content: `Acesso ao sistema liberado manualmente pela equipe, até ${ate.split('-').reverse().join('/')}.`,
      });
      return json(200, { ok: true, liberado_ate: ate });
    }

    return json(400, { error: 'ação desconhecida' });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
