import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ligarNotaFiscal } from '../_shared/nota.ts';

/**
 * Liga (ou reaplica) a emissão automática de nota fiscal em TODAS as
 * assinaturas.
 *
 * Serve a três momentos, e é por isso que é reaplicável:
 *
 *  1. conserto — o checkout tenta configurar na hora da venda, mas não
 *     derruba a compra se falhar. Aqui é onde a falha vira conserto.
 *  2. alíquota nova — a efetiva do Simples muda com a receita acumulada.
 *     Trocar o segredo e rodar isto atualiza todo mundo de uma vez.
 *  3. conferência — releitura de cada assinatura, para saber se o Asaas
 *     guardou de verdade e não só aceitou o POST.
 *
 * Idempotente: rodar de novo não duplica nada, só reescreve a mesma coisa.
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) return json(500, { error: 'ASAAS_API_KEY ausente' });
  const base = chave.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  /* Permite mirar num cliente só. É como a primeira nota deve ser ligada:
     um cliente, um ciclo, conferir — e só então valer para todos. */
  const { client_id } = await req.json().catch(() => ({})) as { client_id?: string };

  let q = db.from('clients')
    .select('id, company_name, plan, asaas_subscription_id')
    .not('asaas_subscription_id', 'is', null);
  if (client_id) q = q.eq('id', client_id);
  const { data: clientes, error } = await q;
  if (error) return json(500, { error: error.message });

  if (!clientes?.length) {
    return json(200, { ok: true, total: 0, aviso: 'Nenhuma assinatura para configurar ainda.' });
  }

  const saida: unknown[] = [];
  for (const c of clientes) {
    const r = await ligarNotaFiscal(
      base, chave, c.asaas_subscription_id!,
      `Assinatura mensal do sistema Via Pesados${c.plan ? ` — plano ${c.plan}` : ''}.`,
      true,
    );
    saida.push({ cliente: c.company_name, assinatura: c.asaas_subscription_id, ...r });
  }

  const falhas = saida.filter((x) => !(x as { ok: boolean }).ok).length;
  return json(200, { ok: falhas === 0, total: saida.length, falhas, resultados: saida });
});
