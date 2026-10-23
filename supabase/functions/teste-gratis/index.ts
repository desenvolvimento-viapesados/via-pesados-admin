import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate, primeiroNome, dataBR, modeloAprovado } from '../_shared/wa.ts';
import { hojeBRT, somarDias } from '../_shared/regua.ts';
import { pedirAoLojista, linkDePagamento } from '../_shared/licenca.ts';
import { mensagemDoDia, acabou, diaDoCorte, diaDaReconquista, tarefaDoCorte } from '../_shared/teste.ts';
import { comecarTeste, converterTeste, agendarTarefas, type TesteGratis } from '../_shared/teste-db.ts';

/**
 * A rotina do teste grátis — uma vez por dia, às 09h05 de Brasília.
 *
 *  1. COMEÇO: teste esperando a implantação e loja já implantada (o aviso
 *     de acesso carimba a data) começa a contar. O aviso de acesso já faz
 *     isso na hora; aqui é a rede de segurança.
 *  2. ASSINOU: loja com assinatura criada vira "convertido" e as tarefas
 *     que ainda não chegaram saem da agenda.
 *  3. AVISO DO DIA: começou, faltam 5 dias, termina amanhã. Um por dia, só
 *     depois que a Meta aprovar o modelo (mandar modelo não aprovado queima
 *     a chave e o aviso nunca mais sai).
 *  4. CORTE: no dia seguinte ao fim, sem assinatura, painel e site saem do
 *     ar — o mesmo corte da mensalidade. Nada é apagado. A equipe pode ter
 *     dado mais prazo (acesso_liberado_ate): respeita.
 *  5. RECONQUISTA: três dias depois do corte, uma vez.
 *
 * Todo envio passa por enviarTemplate, que segura qualquer coisa fora das
 * 08h–20h.
 */

const cors = { 'Access-Control-Allow-Origin': '*' };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

type Cliente = {
  id: string; prospect_id: string | null; company_name: string | null; contact_name: string | null;
  whatsapp: string | null; checkout_token: string | null; status: string; mrr: number | null;
  lojista_company_id: string | null; implantado_em: string | null; asaas_subscription_id: string | null;
  acesso_suspenso_em: string | null; acesso_liberado_ate: string | null;
};

// Sem nome de contato, o nome da loja: variável vazia é recusa da Meta.
const nomeDo = (c: Cliente) => primeiroNome(c.contact_name) || (c.company_name ?? '').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const cron = Deno.env.get('CRON_SECRET');
  if (cron && req.headers.get('Authorization') !== `Bearer ${cron}`) {
    return json(401, { error: 'não autorizado' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const hoje = hojeBRT();

  const { data: testes, error } = await db.from('testes_gratis')
    .select('id, client_id, owner_id, status, inicio, fim, dias_extras')
    .in('status', ['aguardando_implantacao', 'em_teste', 'encerrado']);
  if (error) return json(500, { error: error.message });
  if (!testes?.length) return json(200, { ok: true, hoje, resultados: [] });

  const { data: clientes } = await db.from('clients')
    .select('id, prospect_id, company_name, contact_name, whatsapp, checkout_token, status, mrr, lojista_company_id, implantado_em, asaas_subscription_id, acesso_suspenso_em, acesso_liberado_ate')
    .in('id', testes.map((t: TesteGratis) => t.client_id));
  const porId = new Map((clientes ?? []).map((c: Cliente) => [c.id, c]));

  const resultados: unknown[] = [];

  for (const original of testes as TesteGratis[]) {
    let t = original;
    const c = porId.get(t.client_id);
    if (!c || c.status === 'cancelado' || c.status === 'pausado') continue;

    /* 2. Assinou — vale para qualquer fase, até depois do corte. */
    if (c.asaas_subscription_id) {
      if (await converterTeste(db, c.id, 'assinatura criada')) resultados.push({ cliente: c.id, etapa: 'convertido' });
      continue;
    }

    /* 1. Começo. */
    if (t.status === 'aguardando_implantacao') {
      if (!c.implantado_em) continue;
      t = await comecarTeste(db, t, c.implantado_em);
      resultados.push({ cliente: c.id, etapa: 'comecou', inicio: t.inicio, fim: t.fim });
    }
    if (!t.inicio || !t.fim) continue;

    if (t.status === 'em_teste') {
      /* 3. Aviso do dia. */
      const msg = mensagemDoDia({ inicio: t.inicio, fim: t.fim }, hoje);
      if (msg && await modeloAprovado(msg.template)) {
        const r = await enviarTemplate(db, {
          para: c.whatsapp,
          template: msg.template,
          client_id: c.id,
          // O fim entra na chave: prorrogou, os avisos do novo fim saem de novo.
          chave: `teste:${msg.marco}:${t.id}:${t.fim}`,
          params: {
            body: [nomeDo(c), dataBR(t.fim)],
            ...(msg.template === 'teste_gratis_inicio' ? {} : { urlSuffix: c.checkout_token ?? '' }),
          },
          // Fim do dia limite em Brasília (23h59 = 02h59 UTC do dia seguinte).
          validoAte: `${diaDoCorte(msg.ate)}T02:59:00.000Z`,
        });
        resultados.push({ cliente: c.id, etapa: msg.marco, ...r });
      }

      /* 4. Corte. */
      if (acabou(t.fim, hoje)) {
        const liberadoNaMao = !!c.acesso_liberado_ate && hoje <= c.acesso_liberado_ate;
        if (liberadoNaMao) {
          resultados.push({ cliente: c.id, etapa: 'corte', pulado: `prazo dado pela equipe até ${c.acesso_liberado_ate}` });
          continue;
        }
        let corte: { ok: boolean; motivo?: string } = { ok: true };
        if (c.lojista_company_id && !c.acesso_suspenso_em) {
          corte = await pedirAoLojista({
            acao: 'suspender',
            company_id: c.lojista_company_id,
            motivo: 'teste_encerrado',
            venceu_em: t.fim,
            link_pagamento: linkDePagamento(c.checkout_token),
            valor: c.mrr ? Number(c.mrr) : null,
          });
        }
        if (!corte.ok) {
          resultados.push({ cliente: c.id, etapa: 'corte', ...corte });
          continue;
        }
        if (c.lojista_company_id && !c.acesso_suspenso_em) {
          await db.from('clients').update({ acesso_suspenso_em: new Date().toISOString() }).eq('id', c.id);
        }
        await db.from('testes_gratis')
          .update({ status: 'encerrado', encerrado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
          .eq('id', t.id).eq('status', 'em_teste');
        await db.from('activities').insert({
          client_id: c.id, kind: 'nota',
          content: `Teste grátis encerrado sem assinatura em ${dataBR(t.fim)}: painel e site fora do ar até assinar.`,
        });
        await agendarTarefas(db, t, [tarefaDoCorte(t.fim)], c.prospect_id);

        let aviso: unknown = null;
        if (await modeloAprovado('teste_gratis_encerrado')) {
          aviso = await enviarTemplate(db, {
            para: c.whatsapp,
            template: 'teste_gratis_encerrado',
            client_id: c.id,
            chave: `teste:encerrado:${t.id}:${t.fim}`,
            params: {
              body: [nomeDo(c), c.company_name ?? 'sua loja', dataBR(t.fim)],
              urlSuffix: c.checkout_token ?? '',
            },
          });
        }
        resultados.push({ cliente: c.id, etapa: 'corte', aviso });
      }
      continue;
    }

    /* 5. Reconquista — encerrado, ainda sem assinatura, três dias depois.
       Janela curta: um modelo aprovado semanas depois não sai fora de hora. */
    const reconquista = diaDaReconquista(t.fim);
    if (t.status === 'encerrado' && hoje >= reconquista && hoje <= somarDias(reconquista, 2)
      && await modeloAprovado('teste_gratis_volte')) {
      const r = await enviarTemplate(db, {
        para: c.whatsapp,
        template: 'teste_gratis_volte',
        client_id: c.id,
        chave: `teste:volte:${t.id}:${t.fim}`,
        params: { body: [nomeDo(c)], urlSuffix: c.checkout_token ?? '' },
      });
      resultados.push({ cliente: c.id, etapa: 'reconquista', ...r });
    }
  }

  return json(200, { ok: true, hoje, resultados });
});
