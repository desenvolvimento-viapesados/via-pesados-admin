import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarNotaFiscal, tentarNotasPendentes } from '../_shared/nota-aviso.ts';

/**
 * Envio manual da nota fiscal pelo WhatsApp.
 *
 * Existe por causa de uma assimetria da trava anti-duplicata: ela impede o
 * disparo repetido gravando ANTES de falar com a Meta, o que é certo para
 * cobrança — melhor não avisar do que avisar duas vezes. Mas para a nota
 * fiscal isso deixa um beco sem saída: se a Meta recusar uma vez (link do
 * PDF fora do ar, mídia grande demais), a trava fica queimada e aquela nota
 * nunca mais tenta sozinha.
 *
 *   { nota_id }             → tenta uma nota, respeitando os portões
 *   { nota_id, forcar }     → ignora os portões E limpa a trava queimada
 *   { client_id }           → varre as notas pendentes de um cliente
 *
 * `forcar` é decisão humana, e por isso não tem gatilho automático.
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { nota_id, client_id, forcar } = await req.json().catch(() => ({})) as
    { nota_id?: string; client_id?: string; forcar?: boolean };

  try {
    if (client_id) return json(200, { resultados: await tentarNotasPendentes(db, client_id) });
    if (!nota_id) return json(400, { error: 'informe nota_id ou client_id' });

    if (forcar) {
      /* Limpa a trava SÓ do envio que falhou. `enviado_em is null` é a
         garantia de que não estamos reabrindo um envio bem-sucedido — isso
         mandaria a mesma nota duas vezes para o lojista. */
      const { data: n } = await db.from('notas_fiscais')
        .select('asaas_invoice_id').eq('id', nota_id).maybeSingle();
      if (n?.asaas_invoice_id) {
        await db.from('wa_envios').delete()
          .eq('template', 'nota_fiscal_emitida')
          .eq('chave', `nota:${n.asaas_invoice_id}`)
          .is('enviado_em', null);
      }
    }

    return json(200, await enviarNotaFiscal(db, nota_id, !!forcar));
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'falha' });
  }
});
