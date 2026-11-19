import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate, statusDoModelo } from '../_shared/wa.ts';
import { numerosDoAviso } from '../_shared/assistente-regras.ts';
import {
  TETO_POR_HORA, chaveDoWhatsapp, lerPedido, mascaraDoPedido, notasDoPedido, quandoFalado,
} from '../_shared/lead-site-regras.ts';

/**
 * A porta do formulário da página de vendas (dono, 18/11/2026).
 *
 * PÚBLICA por desenho: quem preenche não tem login. Por isso ela só faz uma coisa: abrir (ou
 * atualizar) UMA oportunidade no CRM, na frente Lojistas, e avisar o dono no WhatsApp. Nunca
 * devolve dado nenhum do banco: a resposta é só "recebemos".
 *
 * - O pedido nasce em "Novos" (stage contato, canal Site), com as respostas nas anotações.
 *   A aba Hoje confere de 20 em 20 segundos, então ele aparece no topo em seguida.
 * - Mesmo WhatsApp de novo: não cria outro card; anota "pediu contato de novo" no que já existe.
 * - Campo isca `site` preenchido e mais de 40 pedidos em uma hora: responde "recebemos" e não grava.
 * - O aviso sai pelo modelo `aviso_lead_novo`, para os números de assistente_config.aviso_whatsapp.
 *   Enquanto a Meta não aprovar o modelo, o pedido entra no CRM do mesmo jeito, só sem aviso.
 *
 * Sobe com --no-verify-jwt.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const RECEBEMOS = { ok: true };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Só POST.' });

  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo !== 'object') return json(400, { error: 'Pedido vazio.' });
  const lido = lerPedido(corpo as Record<string, unknown>);
  if (lido.ok === 'robo') return json(200, RECEBEMOS);
  if (!lido.ok) return json(400, { error: lido.erro });
  const p = lido.pedido;

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const agora = new Date();

  const { data: canal } = await db.from('acquisition_channels').select('id').eq('slug', 'site').maybeSingle();

  /* Enxurrada: a porta fecha sozinha por uma hora, sem contar para quem está batendo. */
  if (canal?.id) {
    const { count } = await db.from('prospects').select('id', { count: 'exact', head: true })
      .eq('channel_id', canal.id).gte('created_at', new Date(agora.getTime() - 3_600_000).toISOString());
    if ((count ?? 0) >= TETO_POR_HORA) {
      console.warn('lead-site: teto por hora atingido; pedido não gravado');
      return json(200, RECEBEMOS);
    }
  }

  const notas = notasDoPedido(p, agora);
  const chave = chaveDoWhatsapp(p.whatsapp);

  /* Mesmo WhatsApp já no funil (e ainda não é cliente): anota no card que existe. */
  const { data: comZap } = await db.from('prospects').select('id, whatsapp, stage, notes')
    .eq('frente', 'lojista').not('whatsapp', 'is', null).order('created_at', { ascending: false }).limit(2000);
  const existente = (comZap ?? []).find((x: { whatsapp: string | null; stage: string }) =>
    chaveDoWhatsapp(x.whatsapp) === chave && x.stage !== 'vendido');

  let prospectId: string;
  if (existente) {
    prospectId = existente.id;
    const { error } = await db.from('prospects').update({
      notes: [existente.notes, `Pediu contato de novo pelo site em ${quandoFalado(agora)}.`, notas.split('\n').slice(1).join('\n')].filter(Boolean).join('\n'),
      /* Quem tinha sido dado como perdido e voltou a pedir contato volta para o começo. */
      ...(existente.stage === 'perdido' ? { stage: 'contato', lost_reason: null } : {}),
      updated_at: agora.toISOString(),
    }).eq('id', existente.id);
    if (error) { console.error('lead-site: não atualizou', error.message); return json(500, { error: 'Não foi possível registrar. Tente de novo.' }); }
  } else {
    const { data: novo, error } = await db.from('prospects').insert({
      company_name: p.loja, contact_name: p.nome, whatsapp: mascaraDoPedido(p.whatsapp),
      city: p.cidade, state: p.uf, channel_id: canal?.id ?? null, funil: 'anuncios', stage: 'contato',
      source: p.campanha ?? 'Formulário do site', notes: notas, frente: 'lojista',
    }).select('id').single();
    if (error || !novo) { console.error('lead-site: não gravou', error?.message); return json(500, { error: 'Não foi possível registrar. Tente de novo.' }); }
    prospectId = novo.id;
  }

  /* O aviso ao dono. Falhar aqui não desfaz o pedido: ele já está no CRM. */
  try {
    const { data: cfg } = await db.from('assistente_config').select('aviso_whatsapp').eq('id', 1).maybeSingle();
    const destinos = numerosDoAviso(cfg?.aviso_whatsapp);
    if (destinos.length && (await statusDoModelo('aviso_lead_novo')) === 'APPROVED') {
      const lugar = [p.cidade, p.uf].filter(Boolean).join('/');
      for (const para of destinos) {
        const r = await enviarTemplate(db, {
          para,
          template: 'aviso_lead_novo',
          params: { body: [lugar ? `${p.loja}, ${lugar}` : p.loja, p.nome, mascaraDoPedido(p.whatsapp)] },
          /* Um aviso por pedido por dia: quem manda o formulário duas vezes seguidas não gera dois. */
          chave: `aviso_lead:${prospectId}:${agora.toISOString().slice(0, 10)}:${para}`,
        });
        if (!r.ok) console.warn('lead-site: aviso não saiu', para.slice(-4), r.motivo);
      }
    }
  } catch (e) {
    console.warn('lead-site: aviso falhou', e instanceof Error ? e.message : e);
  }

  return json(200, RECEBEMOS);
});
