import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate, statusDoModelo } from '../_shared/wa.ts';
import { numerosDoAviso } from '../_shared/assistente-regras.ts';
import {
  TETO_GLOBAL_HORA, TETO_POR_IP_HORA, anexarNota, chaveDoWhatsapp, ipDoPedido, janelaDe, lerPedido, mascaraDoPedido,
  notasDoPedido, oQueFazerNoCard, passouDoTeto, quandoFalado,
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
 * - Mesmo WhatsApp de novo: não cria outro card; anota "pediu contato de novo" no que já existe,
 *   no máximo 3 vezes por dia e só enquanto as anotações têm menos de 4.000 letras. Card
 *   "perdido" volta para o começo uma vez por dia, no máximo.
 * - Campo isca `site` preenchido, mais de 5 envios do mesmo IP em uma hora ou mais de 200 no
 *   total em uma hora (criar e atualizar contam igual): responde "recebemos" e não grava.
 *   A contagem fica em limite_publico (migration 20261127210000).
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

  /* Soma 1 na chave e devolve o total da janela. Se a contagem falhar, a porta segue aberta: perder um
     lead de verdade custa mais que um envio a mais (e o erro fica no console). */
  const contar = async (chave: string, tamanho: 'hora' | 'dia') => {
    const { data, error } = await db.rpc('limite_publico_contar', { p_chave: chave, p_janela: janelaDe(agora, tamanho) });
    if (error) { console.error('lead-site: contagem falhou', chave.split(':').slice(0, 2).join(':'), error.message); return 0; }
    return Number(data ?? 0);
  };

  /* Enxurrada: a porta fecha sozinha, sem contar para quem está batendo. Primeiro o IP, depois o total. */
  const ip = ipDoPedido(req.headers);
  if (passouDoTeto(await contar(`lead-site:ip:${ip}`, 'hora'), TETO_POR_IP_HORA)) {
    console.warn('lead-site: teto por IP atingido; pedido não gravado');
    return json(200, RECEBEMOS);
  }
  if (passouDoTeto(await contar('lead-site:total', 'hora'), TETO_GLOBAL_HORA)) {
    console.warn('lead-site: teto por hora atingido; pedido não gravado');
    return json(200, RECEBEMOS);
  }

  const { data: canal } = await db.from('acquisition_channels').select('id').eq('slug', 'site').maybeSingle();

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
    const faz = oQueFazerNoCard({
      notas: existente.notes, stage: existente.stage,
      anexosHoje: await contar(`lead-site:anexo:${existente.id}`, 'dia'),
      reaberturasHoje: existente.stage === 'perdido' ? await contar(`lead-site:reabre:${existente.id}`, 'dia') : 0,
    });
    if (faz.anexar || faz.reabrir) {
      const nova = [`Pediu contato de novo pelo site em ${quandoFalado(agora)}.`, notas.split('\n').slice(1).join('\n')].filter(Boolean).join('\n');
      const { error } = await db.from('prospects').update({
        ...(faz.anexar ? { notes: anexarNota(existente.notes, nova) } : {}),
        /* Quem tinha sido dado como perdido e voltou a pedir contato volta para o começo (uma vez por dia). */
        ...(faz.reabrir ? { stage: 'contato', lost_reason: null } : {}),
        updated_at: agora.toISOString(),
      }).eq('id', existente.id);
      if (error) { console.error('lead-site: não atualizou', error.message); return json(500, { error: 'Não foi possível registrar. Tente de novo.' }); }
    }
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
