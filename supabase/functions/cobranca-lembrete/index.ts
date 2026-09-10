import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate, diaMes, brl, primeiroNome } from '../_shared/wa.ts';

/**
 * Lembrete de vencimento — roda de manhã e avisa quem vence AMANHÃ.
 *
 * A regra que define este arquivo: só sai para quem ainda não pagou, e a
 * conferência é feita no momento do envio, não ao montar a fila. Uma
 * cobrança paga às 8h50 não pode gerar aviso às 9h — é assim que o lojista
 * aprende a não ler os próximos.
 *
 * O status vem de `payments`, que o asaas-webhook mantém em dia. Se o
 * webhook estiver atrasado, o pior caso é um aviso a mais; por isso o texto
 * aprovado não acusa ninguém de nada, só informa o vencimento.
 */

const cors = { 'Access-Control-Allow-Origin': '*' };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Data de amanhã em Brasília (UTC-3), no formato 'YYYY-MM-DD' de `due_date`. */
function amanhaBRT(): string {
  const agora = new Date();
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const amanha = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + 1));
  return amanha.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const cron = Deno.env.get('CRON_SECRET');
  if (cron && req.headers.get('Authorization') !== `Bearer ${cron}`) {
    return json(401, { error: 'não autorizado' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const vencimento = amanhaBRT();

  const { data: fila, error } = await db
    .from('payments')
    .select('id, client_id, amount, due_date, status, asaas_payment_id')
    .eq('due_date', vencimento)
    .eq('status', 'pendente');
  if (error) return json(500, { error: error.message });

  const resultados: unknown[] = [];
  for (const cobranca of fila ?? []) {
    // Reconferência: entre a consulta e este ponto o pagamento pode ter caído.
    const { data: atual } = await db
      .from('payments').select('status').eq('id', cobranca.id).maybeSingle();
    if (atual?.status !== 'pendente') {
      resultados.push({ payment: cobranca.id, pulado: `status ${atual?.status ?? '?'}` });
      continue;
    }

    const { data: c } = await db
      .from('clients')
      .select('id, contact_name, whatsapp, checkout_token')
      .eq('id', cobranca.client_id).maybeSingle();
    if (!c) { resultados.push({ payment: cobranca.id, pulado: 'sem cliente' }); continue; }

    const r = await enviarTemplate(db, {
      para: c.whatsapp,
      template: 'cobranca_vence_amanha',
      client_id: c.id,
      // Uma vez por cobrança, para sempre: se o cron rodar duas vezes no
      // mesmo dia, a segunda não manda nada.
      chave: `vence:${cobranca.asaas_payment_id ?? cobranca.id}`,
      params: {
        body: [primeiroNome(c.contact_name), diaMes(cobranca.due_date), brl(Number(cobranca.amount))],
        urlSuffix: c.checkout_token ?? '',
      },
    });
    resultados.push({ payment: cobranca.id, ...r });
  }

  return json(200, { ok: true, vencimento, na_fila: fila?.length ?? 0, resultados });
});
