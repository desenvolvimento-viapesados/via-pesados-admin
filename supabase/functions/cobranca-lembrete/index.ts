import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate, diaMes, brl, primeiroNome, mesDe, dataBR, modeloAprovado } from '../_shared/wa.ts';
import { hojeBRT, somarDias, hojeEnviaMensalidade, passouDaTolerancia, DIAS_DE_TOLERANCIA } from '../_shared/regua.ts';
import { statusNoAsaas } from '../_shared/ciclo.ts';
import { pedirAoLojista, linkDePagamento } from '../_shared/licenca.ts';

/**
 * A régua da mensalidade — roda uma vez por dia, às 9h de Brasília.
 *
 *  1. MENSALIDADE: avisa a próxima mensalidade até 5 dias antes do
 *     vencimento. O Asaas cria a fatura 40 dias antes; avisar na criação
 *     mandava a de novembro com outubro ainda em aberto. Só a mais antiga
 *     em aberto é anunciada — é ela que o botão da mensagem abre.
 *  2. VENCE AMANHÃ: o lembrete da véspera.
 *     (No dia seguinte ao vencimento sai o lembrete brando, "em atraso",
 *     pelo webhook do Asaas.)
 *  2b. RISCO: no segundo dia, o aviso "você corre o risco de perder o
 *     acesso amanhã".
 *  3. CORTE: no terceiro dia sem pagamento sai TUDO do ar — painel e site
 *     (o site fica só com as duas logos; nada é apagado). Antes de cortar,
 *     pergunta ao Asaas: o nosso registro pode estar atrasado, e cortar
 *     quem pagou é o pior erro aqui.
 *  4. LIBERAÇÃO: quem está suspenso e não deve mais nada volta — rede de
 *     segurança, caso o webhook do pagamento tenha se perdido.
 *
 * Todo envio passa por enviarTemplate, que segura qualquer coisa fora das
 * 08h–20h. A conferência do status é feita na hora de cada envio.
 */

const cors = { 'Access-Control-Allow-Origin': '*' };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const ABERTA = ['pendente', 'atrasado'];

type Cobranca = {
  id: string; client_id: string; amount: number; due_date: string; status: string;
  asaas_payment_id: string | null; asaas_subscription_id: string | null;
};
type Cliente = {
  id: string; contact_name: string | null; company_name: string | null; whatsapp: string | null; checkout_token: string | null;
  status: string; lojista_company_id: string | null; acesso_suspenso_em: string | null;
  acesso_liberado_ate: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const cron = Deno.env.get('CRON_SECRET');
  if (cron && req.headers.get('Authorization') !== `Bearer ${cron}`) {
    return json(401, { error: 'não autorizado' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const hoje = hojeBRT();
  const amanha = somarDias(hoje, 1);

  // Só mensalidade (cobrança de assinatura). Cobrança avulsa não corta acesso.
  const { data: abertas, error } = await db
    .from('payments')
    .select('id, client_id, amount, due_date, status, asaas_payment_id, asaas_subscription_id')
    .in('status', ABERTA)
    .not('asaas_subscription_id', 'is', null)
    .order('due_date');
  if (error) return json(500, { error: error.message });

  const idsClientes = [...new Set((abertas ?? []).map((c: Cobranca) => c.client_id))];
  const { data: suspensos } = await db.from('clients').select('id').not('acesso_suspenso_em', 'is', null);
  const todos = [...new Set([...idsClientes, ...(suspensos ?? []).map((c: { id: string }) => c.id)])];
  const { data: clientes } = todos.length
    ? await db.from('clients')
      .select('id, contact_name, company_name, whatsapp, checkout_token, status, lojista_company_id, acesso_suspenso_em, acesso_liberado_ate')
      .in('id', todos)
    : { data: [] };
  const porId = new Map((clientes ?? []).map((c: Cliente) => [c.id, c]));

  const resultados: unknown[] = [];
  const reconfere = async (cobranca: Cobranca) => {
    const { data: atual } = await db.from('payments').select('status').eq('id', cobranca.id).maybeSingle();
    return ABERTA.includes(atual?.status ?? '');
  };

  for (const cid of idsClientes) {
    const c = porId.get(cid);
    if (!c || c.status === 'cancelado' || c.status === 'pausado') continue;
    const dele = (abertas ?? []).filter((p: Cobranca) => p.client_id === cid);
    const maisAntiga = dele[0] as Cobranca;

    /* 1. Mensalidade disponível — só a mais antiga, e só na janela. */
    if (maisAntiga && hojeEnviaMensalidade(maisAntiga.due_date, hoje) && await reconfere(maisAntiga)) {
      const mes = mesDe(maisAntiga.due_date);
      const r = await enviarTemplate(db, {
        para: c.whatsapp,
        template: 'cobranca_mensal_disponivel',
        client_id: c.id,
        chave: `disponivel:${maisAntiga.asaas_payment_id ?? maisAntiga.id}`,
        params: {
          header: [mes],
          body: [primeiroNome(c.contact_name), mes, brl(Number(maisAntiga.amount)), dataBR(maisAntiga.due_date)],
          urlSuffix: c.checkout_token ?? '',
        },
        condicao: maisAntiga.asaas_payment_id ? { tipo: 'cobranca_aberta', asaas_payment_id: maisAntiga.asaas_payment_id } : null,
      });
      resultados.push({ cliente: cid, etapa: 'mensalidade', vence: maisAntiga.due_date, ...r });
    }

    /* 2. Vence amanhã. */
    for (const cobranca of dele.filter((p: Cobranca) => p.due_date === amanha && p.status === 'pendente')) {
      if (!await reconfere(cobranca)) continue;
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
        condicao: cobranca.asaas_payment_id ? { tipo: 'cobranca_aberta', asaas_payment_id: cobranca.asaas_payment_id } : null,
      });
      resultados.push({ cliente: cid, etapa: 'vence_amanha', ...r });
    }

    /* 2b. Aviso de risco — véspera do corte, só para quem tem sistema e
       ainda não foi cortado. {{5}} é o dia do corte. */
    const vespera = dele.find((p: Cobranca) => somarDias(p.due_date, DIAS_DE_TOLERANCIA - 1) === hoje);
    if (vespera && c.lojista_company_id && !c.acesso_suspenso_em
        && await modeloAprovado('cobranca_risco_suspensao') && await reconfere(vespera)) {
      const corte = somarDias(vespera.due_date, DIAS_DE_TOLERANCIA);
      const r = await enviarTemplate(db, {
        para: c.whatsapp,
        template: 'cobranca_risco_suspensao',
        client_id: c.id,
        chave: `risco:${vespera.asaas_payment_id ?? vespera.id}`,
        params: {
          body: [primeiroNome(c.contact_name), mesDe(vespera.due_date), brl(Number(vespera.amount)), dataBR(vespera.due_date), diaMes(corte)],
          urlSuffix: c.checkout_token ?? '',
        },
        // "Amanhã" deixa de ser verdade quando vira o dia do corte.
        validoAte: `${corte}T03:00:00Z`,
        condicao: vespera.asaas_payment_id ? { tipo: 'cobranca_aberta', asaas_payment_id: vespera.asaas_payment_id } : null,
      });
      resultados.push({ cliente: cid, etapa: 'risco', ...r });
    }

    /* 3. Corte depois da tolerância. */
    const vencida = dele.find((p: Cobranca) => passouDaTolerancia(p.due_date, hoje));
    // A equipe liberou na mão (promessa de pagamento): respeita o prazo dado.
    const liberadoNaMao = !!c.acesso_liberado_ate && hoje <= c.acesso_liberado_ate;
    if (vencida && !c.acesso_suspenso_em && c.lojista_company_id && !liberadoNaMao) {
      const noAsaas = vencida.asaas_payment_id ? await statusNoAsaas(vencida.asaas_payment_id) : null;
      if (noAsaas !== 'PENDING' && noAsaas !== 'OVERDUE') {
        resultados.push({ cliente: cid, etapa: 'corte', pulado: `Asaas diz ${noAsaas ?? 'sem resposta'} — não corto sem certeza` });
      } else {
        const r = await pedirAoLojista({
          acao: 'suspender',
          company_id: c.lojista_company_id,
          motivo: `mensalidade vencida em ${dataBR(vencida.due_date)} sem pagamento após ${DIAS_DE_TOLERANCIA} dias de tolerância`,
          venceu_em: vencida.due_date,
          link_pagamento: linkDePagamento(c.checkout_token),
        });
        let aviso: unknown = null;
        if (r.ok) {
          await db.from('clients').update({ acesso_suspenso_em: new Date().toISOString() }).eq('id', cid);
          await db.from('activities').insert({
            client_id: cid, kind: 'nota',
            content: `Acesso ao sistema suspenso automaticamente: mensalidade de ${dataBR(vencida.due_date)} sem pagamento após ${DIAS_DE_TOLERANCIA} dias.`,
          });
          if (await modeloAprovado('loja_fora_do_ar')) {
            aviso = await enviarTemplate(db, {
              para: c.whatsapp,
              template: 'loja_fora_do_ar',
              client_id: c.id,
              chave: `fora_do_ar:${vencida.asaas_payment_id ?? vencida.id}`,
              params: {
                body: [primeiroNome(c.contact_name), mesDe(vencida.due_date), c.company_name ?? 'sua loja'],
                urlSuffix: c.checkout_token ?? '',
              },
              condicao: vencida.asaas_payment_id ? { tipo: 'cobranca_aberta', asaas_payment_id: vencida.asaas_payment_id } : null,
            });
          }
        }
        resultados.push({ cliente: cid, etapa: 'corte', vence: vencida.due_date, ...r, aviso });
      }
    }
  }

  /* 3b. Reconquista — só com tudo fora do ar e a fatura ainda aberta.
     Fala do que o lojista perde sem o painel (tempo, equipe), nunca de
     número que pode estar errado. Um dia depois do corte, o tempo; cinco
     dias depois, a equipe. Uma vez cada, pela chave. */
  for (const cid of idsClientes) {
    const c = porId.get(cid);
    if (!c?.acesso_suspenso_em || c.status === 'cancelado' || c.status === 'pausado') continue;
    const vencida = (abertas ?? []).find((p: Cobranca) => p.client_id === cid && passouDaTolerancia(p.due_date, hoje));
    if (!vencida) continue;
    const corte = somarDias(vencida.due_date, DIAS_DE_TOLERANCIA);
    const etapa = hoje >= somarDias(corte, 5) ? 'painel_suspenso_equipe'
      : hoje >= somarDias(corte, 1) ? 'painel_suspenso_tempo'
      : null;
    if (!etapa || !await modeloAprovado(etapa) || !await reconfere(vencida)) continue;
    const r = await enviarTemplate(db, {
      para: c.whatsapp,
      template: etapa,
      client_id: c.id,
      chave: `${etapa}:${vencida.asaas_payment_id ?? vencida.id}`,
      params: { body: [primeiroNome(c.contact_name)], urlSuffix: c.checkout_token ?? '' },
      condicao: vencida.asaas_payment_id ? { tipo: 'cobranca_aberta', asaas_payment_id: vencida.asaas_payment_id } : null,
    });
    resultados.push({ cliente: cid, etapa, ...r });
  }

  /* 4. Liberação: suspenso que não deve mais nada vencido além da tolerância.
     Sem mensagem: aqui a liberação pode não ter sido pagamento (fatura
     cancelada, por exemplo) — "pagamento confirmado" seria mentira. */
  for (const s of suspensos ?? []) {
    const c = porId.get(s.id);
    if (!c?.lojista_company_id) continue;
    const aindaDeve = (abertas ?? []).some((p: Cobranca) => p.client_id === s.id && passouDaTolerancia(p.due_date, hoje));
    if (aindaDeve) continue;
    const r = await pedirAoLojista({ acao: 'liberar', company_id: c.lojista_company_id });
    if (r.ok) await db.from('clients').update({ acesso_suspenso_em: null }).eq('id', s.id);
    resultados.push({ cliente: s.id, etapa: 'liberacao', ...r });
  }

  return json(200, { ok: true, hoje, resultados });
});
