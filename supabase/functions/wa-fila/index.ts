import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate, type Condicao } from '../_shared/wa.ts';
import { dentroDaJanela } from '../_shared/regua.ts';
import { tentarNotasPendentes } from '../_shared/nota-aviso.ts';

/**
 * Solta as mensagens que caíram fora do horário (08h–20h de Brasília).
 *
 * Roda a cada 10 minutos pelo pg_cron. Fora da janela não faz nada; dentro
 * dela, manda o que já pode sair — conferindo de novo, na hora, se a
 * mensagem ainda faz sentido: cobrança paga não recebe aviso de atraso,
 * reunião cancelada não recebe lembrete.
 *
 * Cada item é "pego" com um update condicional antes de mandar: duas
 * rodadas ao mesmo tempo não mandam a mesma mensagem duas vezes. A trava
 * de wa_envios continua valendo por baixo.
 */

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

async function aindaFazSentido(db: { from: (t: string) => any }, c: Condicao | null): Promise<string | null> {
  if (!c) return null;
  if (c.tipo === 'cobranca_aberta') {
    const { data } = await db.from('payments').select('status').eq('asaas_payment_id', c.asaas_payment_id).maybeSingle();
    return data && (data.status === 'pendente' || data.status === 'atrasado') ? null : `cobrança ${data?.status ?? 'sumiu'}`;
  }
  if (c.tipo === 'reuniao_agendada') {
    const { data } = await db.from('meetings').select('status').eq('id', c.meeting_id).maybeSingle();
    return data?.status === 'agendada' ? null : `reunião ${data?.status ?? 'sumiu'}`;
  }
  return null;
}

Deno.serve(async () => {
  if (!dentroDaJanela()) return json(200, { ok: true, fora_do_horario: true });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const agora = new Date().toISOString();

  const { data: fila, error } = await db.from('wa_fila')
    .select('id, template, chave, client_id, para, params, valido_ate, condicao')
    .is('processado_em', null)
    .lte('enviar_apos', agora)
    .order('enviar_apos')
    .limit(40);
  if (error) return json(500, { error: error.message });

  const resultados: unknown[] = [];
  for (const item of fila ?? []) {
    const { data: pego } = await db.from('wa_fila')
      .update({ processado_em: new Date().toISOString() })
      .eq('id', item.id).is('processado_em', null)
      .select('id').maybeSingle();
    if (!pego) continue;

    let resultado: string;
    if (item.valido_ate && new Date(item.valido_ate) < new Date()) {
      resultado = 'perdeu o sentido antes de abrir o horário';
    } else {
      const motivo = await aindaFazSentido(db, item.condicao as Condicao | null);
      if (motivo) {
        resultado = `não enviado: ${motivo}`;
      } else {
        const r = await enviarTemplate(db, {
          para: item.para, template: item.template, params: item.params ?? {}, chave: item.chave, client_id: item.client_id,
        });
        resultado = r.ok ? 'enviado' : `não enviado: ${r.motivo}`;
        /* Acesso liberado e pagamento confirmado são os portões da nota
           fiscal: se um deles esperou as 08h, a nota esperou junto. */
        if (r.ok && item.client_id && (item.template === 'acesso_equipe' || item.template === 'pagamento_confirmado')) {
          try { await tentarNotasPendentes(db, item.client_id); } catch { /* a nota tenta de novo no próximo portão */ }
        }
      }
    }
    await db.from('wa_fila').update({ resultado: resultado.slice(0, 400) }).eq('id', item.id);
    resultados.push({ id: item.id, template: item.template, resultado });
  }

  return json(200, { ok: true, processados: resultados.length, resultados });
});
