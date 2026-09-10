import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate, primeiroNome } from '../_shared/wa.ts';

/**
 * Confirmação e lembrete de reunião, pelo número oficial.
 *
 * Dois caminhos numa função só porque compartilham tudo — a busca do
 * prospecto, do atendente e a formatação da data:
 *
 *   acao 'confirmada' : chamada logo depois de agendar, com meeting_id.
 *   acao 'lembretes'  : cron, pega o que começa daqui a ~2h.
 *
 * Regra que vale para os dois: SEM ATENDENTE, NÃO MANDA. O template
 * aprovado diz "com {{4}}, da Via Pesados", e variável vazia vira "com  " —
 * que a Meta trata como template quebrado e que, para quem lê, parece
 * descuido. Melhor a reunião ir sem confirmação.
 */

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Brasília, sem depender do fuso do runtime (que é UTC). */
function emBRT(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return {
    // "quinta, 17/09" — igual à amostra aprovada.
    data: `${DIAS[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    // "14h30" e "14h" — o zero à direita não acrescenta nada.
    hora: d.getUTCMinutes() === 0 ? `${d.getUTCHours()}h` : `${d.getUTCHours()}h${String(d.getUTCMinutes()).padStart(2, '0')}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const corpo = await req.json().catch(() => ({}));
  const acao = corpo?.acao ?? 'lembretes';

  /** Junta reunião + prospecto + atendente, e devolve o que falta se faltar. */
  async function montar(m: Record<string, any>) {
    const { data: p } = await db.from('prospects')
      .select('contact_name, whatsapp, owner_id').eq('id', m.prospect_id).maybeSingle();
    if (!p) return { erro: 'prospecto não encontrado' };
    if (!p.whatsapp) return { erro: 'prospecto sem WhatsApp' };

    // O dono da reunião manda; o do prospecto é o reserva.
    const dono = m.owner_id ?? p.owner_id;
    if (!dono) return { erro: 'reunião sem responsável' };
    const { data: t } = await db.from('team_members').select('full_name').eq('id', dono).maybeSingle();
    const atendente = primeiroNome(t?.full_name);
    if (!atendente) return { erro: 'responsável sem nome' };

    return { p, atendente, ...emBRT(m.scheduled_at) };
  }

  try {
    /* ── confirmação, logo depois de agendar ────────────────────────── */
    if (acao === 'confirmada') {
      const id = corpo?.meeting_id;
      if (!id) return json(400, { error: 'meeting_id é obrigatório' });

      const { data: m } = await db.from('meetings')
        .select('id, prospect_id, scheduled_at, owner_id, status').eq('id', id).maybeSingle();
      if (!m) return json(404, { error: 'reunião não encontrada' });
      if (m.status === 'cancelada') return json(200, { ok: true, pulado: 'reunião cancelada' });

      const x = await montar(m);
      if ('erro' in x) return json(200, { ok: true, pulado: x.erro });

      const r = await enviarTemplate(db, {
        para: x.p.whatsapp,
        template: 'reuniao_confirmada',
        chave: `confirmada:${m.id}`,
        params: { body: [primeiroNome(x.p.contact_name), x.data, x.hora, x.atendente] },
      });
      return json(200, { ok: true, ...r });
    }

    /* ── lembrete, ~2h antes ────────────────────────────────────────── */
    const agora = Date.now();
    const { data: fila } = await db.from('meetings')
      .select('id, prospect_id, scheduled_at, owner_id, status')
      .eq('status', 'agendada')
      // Janela larga o bastante para o cron de 15 em 15 não deixar buraco,
      // e a unique de wa_envios impede o disparo repetido.
      .gte('scheduled_at', new Date(agora + 105 * 60 * 1000).toISOString())
      .lte('scheduled_at', new Date(agora + 135 * 60 * 1000).toISOString());

    const saida: unknown[] = [];
    for (const m of fila ?? []) {
      const x = await montar(m);
      if ('erro' in x) { saida.push({ reuniao: m.id, pulado: x.erro }); continue; }
      const r = await enviarTemplate(db, {
        para: x.p.whatsapp,
        template: 'reuniao_lembrete',
        chave: `lembrete:${m.id}`,
        params: { body: [primeiroNome(x.p.contact_name), x.atendente, x.hora] },
      });
      saida.push({ reuniao: m.id, ...r });
    }
    return json(200, { ok: true, na_fila: fila?.length ?? 0, resultados: saida });
  } catch (e) {
    console.error('reuniao-avisos:', e);
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
