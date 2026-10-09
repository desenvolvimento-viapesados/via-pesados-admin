import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate, mesDe, dataBR, brl, primeiroNome, proximoMes } from '../_shared/wa.ts';
import { tentarNotasPendentes } from '../_shared/nota-aviso.ts';
import { pedirAoLojista } from '../_shared/licenca.ts';
import { alinharCiclo } from '../_shared/ciclo.ts';
import { hojeBRT, passouDaTolerancia } from '../_shared/regua.ts';

/**
 * Recebe os eventos de cobrança do Asaas e mantém `payments` em dia.
 *
 * Sem isto, alguém marca pagamento na mão no painel — e a régua de
 * inadimplência passa a depender de memória.
 *
 * DUAS COISAS QUE A DOC DO ASAAS AVISA E QUE MOLDAM ESTE ARQUIVO:
 *
 *  1. A entrega é "pelo menos uma vez". O mesmo evento chega repetido, e o
 *     tratamento tem de ser idempotente. Aqui o upsert usa asaas_payment_id
 *     como chave: reprocessar não duplica linha.
 *
 *  2. O token do webhook vem no header `asaas-access-token`, e NÃO deve ser
 *     a API Key. É um segredo próprio, definido ao criar o webhook.
 *
 * Responder fora da faixa 2xx faz o Asaas reenviar e, depois de muitas
 * falhas, INTERROMPER a fila da conta inteira. Por isso um evento que não
 * sabemos tratar é respondido com 200 e ignorado, em vez de dar erro.
 */

const cors = { 'Access-Control-Allow-Origin': '*' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Comparação de tempo constante — comparar com === vaza o prefixo correto. */
function segredoConfere(recebido: string, esperado: string) {
  const a = new TextEncoder().encode(recebido);
  const b = new TextEncoder().encode(esperado);
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

/** Como cada evento do Asaas se traduz no nosso status. */
const STATUS_POR_EVENTO: Record<string, 'pago' | 'pendente' | 'atrasado' | 'cancelado'> = {
  PAYMENT_CREATED: 'pendente',
  PAYMENT_UPDATED: 'pendente',
  PAYMENT_CONFIRMED: 'pago',      // pago, saldo ainda não liberado
  PAYMENT_RECEIVED: 'pago',
  PAYMENT_OVERDUE: 'atrasado',
  PAYMENT_DELETED: 'cancelado',
  PAYMENT_REFUNDED: 'cancelado',
  PAYMENT_CHARGEBACK_REQUESTED: 'atrasado',
  PAYMENT_RESTORED: 'pendente',
  // A recusa do débito automático não muda o status — a cobrança segue
  // pendente. Está aqui para o evento não ser descartado antes do aviso.
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'pendente',
};

/**
 * A forma de pagamento do Asaas para o vocabulário da coluna `method`, que
 * tem CHECK em pix/boleto/cartao/transferencia/outro. Gravar o valor cru do
 * Asaas viola o CHECK e derruba o upsert inteiro — foi o que aconteceu.
 *
 * UNDEFINED vira NULL de propósito: quer dizer que o lojista ainda não
 * escolheu como pagar, e "outro" mentiria sobre isso.
 */
function metodoNosso(billingType: unknown): string | null {
  switch (String(billingType ?? '').toUpperCase()) {
    case 'PIX': return 'pix';
    case 'BOLETO': return 'boleto';
    case 'CREDIT_CARD': case 'DEBIT_CARD': return 'cartao';
    case 'TRANSFER': return 'transferencia';
    case 'UNDEFINED': case '': return null;
    default: return 'outro';
  }
}

/** Qual template cada evento dispara. Evento fora daqui não avisa ninguém.
 *
 * PAYMENT_CREATED saiu daqui em 09/10/2026: o Asaas cria a fatura da
 * assinatura 40 dias antes do vencimento, e a iTruck recebeu a mensalidade
 * de novembro à 01h25 com outubro ainda em aberto. A mensalidade agora é
 * anunciada pela régua diária (cobranca-lembrete), 5 dias antes. */
const TEMPLATE_POR_EVENTO: Record<string, string> = {
  PAYMENT_OVERDUE: 'cobranca_em_atraso',
  PAYMENT_RECEIVED: 'pagamento_confirmado',
  PAYMENT_CONFIRMED: 'pagamento_confirmado',
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'cartao_recusado',
};

/**
 * Ordem das variáveis de cada template, exatamente como foram aprovadas.
 * Trocar a ordem aqui manda o valor no lugar do nome — e o template
 * aprovado não protege contra isso, porque para a Meta é só texto.
 */
function paramsDoTemplate(
  template: string,
  p: Record<string, any>,
  c: { contact_name: string | null; checkout_token: string | null },
) {
  const nome = primeiroNome(c.contact_name);
  const mes = mesDe(p.dueDate);
  const valor = brl(Number(p.value) || 0);
  const venc = dataBR(p.dueDate);
  const token = c.checkout_token ?? '';

  switch (template) {
    case 'cobranca_mensal_disponivel':
      return { header: [mes], body: [nome, mes, valor, venc], urlSuffix: token };
    case 'cobranca_em_atraso':
      return { body: [nome, mes, valor, venc], urlSuffix: token };
    case 'pagamento_confirmado':
      // Sem botão: o único link seria de pagamento, e a cobrança já foi paga.
      return { body: [nome, mes, valor, proximoMes(p.dueDate)] };
    case 'cartao_recusado':
      return { body: [nome, mes], urlSuffix: token };
    default:
      return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const segredo = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
  if (segredo) {
    const recebido = req.headers.get('asaas-access-token') ?? '';
    if (!segredoConfere(recebido, segredo)) {
      return json(401, { error: 'Token do webhook inválido' });
    }
  }
  // Sem ASAAS_WEBHOOK_TOKEN definido a função aceita tudo. É proposital
  // para não travar a configuração inicial, mas o token deve ser definido
  // dos dois lados assim que o webhook for criado no painel do Asaas.

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const corpo = await req.json();
    const evento: string = corpo?.event ?? '';
    const p = corpo?.payment;

    if (!p?.id) return json(200, { ok: true, ignorado: 'evento sem cobrança' });

    let status = STATUS_POR_EVENTO[evento];
    if (!status) return json(200, { ok: true, ignorado: evento });
    /* Vencimento alterado numa cobrança já vencida continua vencida até o
       Asaas dizer o contrário — o evento genérico não pode limpar o atraso. */
    if ((evento === 'PAYMENT_UPDATED' || evento === 'PAYMENT_RESTORED') && String(p.status) === 'OVERDUE') {
      status = 'atrasado';
    }

    // Acha o cliente: primeiro pelo externalReference (que gravamos como o
    // nosso id), depois pelo id do cadastro no Asaas.
    const CAMPOS = 'id, contact_name, company_name, whatsapp, checkout_token, status, activated_at, lojista_company_id, acesso_suspenso_em, implantado_em, asaas_subscription_id';
    let cliente: {
      id: string; contact_name: string | null; company_name: string | null; whatsapp: string | null;
      checkout_token: string | null; status: string | null; activated_at: string | null;
      lojista_company_id: string | null; acesso_suspenso_em: string | null; implantado_em: string | null;
      asaas_subscription_id: string | null;
    } | null = null;
    const ref = String(p.externalReference ?? '').trim();
    if (/^[0-9a-f-]{36}$/i.test(ref)) {
      const { data } = await db.from('clients').select(CAMPOS).eq('id', ref).maybeSingle();
      cliente = data ?? null;
    }
    if (!cliente && p.customer) {
      const { data } = await db.from('clients').select(CAMPOS).eq('asaas_customer_id', p.customer).maybeSingle();
      cliente = data ?? null;
    }
    const clientId = cliente?.id ?? null;
    if (!clientId) {
      // 200 de propósito: cobrança de fora do sistema não é erro nosso, e
      // devolver 4xx faria o Asaas reenviar para sempre.
      return json(200, { ok: true, ignorado: 'cobrança sem cliente correspondente', asaas_payment_id: p.id });
    }

    const linha = {
      client_id: clientId,
      description: p.description || 'Mensalidade Via Pesados',
      amount: Number(p.value) || 0,
      due_date: p.dueDate ?? null,
      paid_at: status === 'pago' ? (p.paymentDate ?? p.confirmedDate ?? new Date().toISOString()) : null,
      status,
      method: metodoNosso(p.billingType),
      invoice_url: p.invoiceUrl ?? null,
      asaas_payment_id: p.id,
      asaas_subscription_id: p.subscription ?? null,
    };

    // Chave asaas_payment_id: o mesmo evento chegando de novo atualiza a
    // linha em vez de criar outra.
    const { error } = await db.from('payments').upsert(linha, { onConflict: 'asaas_payment_id' });
    if (error) throw error;

    /* O rótulo do cliente segue a fatura, sem ninguém clicar em nada.
       A iTruck pagou a primeira mensalidade em 14/09, seguiu marcada como
       `onboarding` por duas semanas e o painel anunciou R$ 0 de MRR com o
       dinheiro entrando — e "inadimplente" era um botão que alguém tinha
       de lembrar de apertar, com o Asaas sabendo a resposta no dia do
       vencimento. Cancelado e pausado continuam sendo decisão de gente:
       são vontade, não fato, e por isso nunca são tocados aqui.

       `activated_at` é carimbado uma vez só — é dele que Relatórios tira
       coorte, tempo de ativação e churn. */
    let virou: string | null = null;
    if (cliente && cliente.status !== 'cancelado' && cliente.status !== 'pausado') {
      const alvo = status === 'pago' ? 'ativo'
        : status === 'atrasado' && cliente.status === 'ativo' ? 'inadimplente'
        : null;
      if (alvo && alvo !== cliente.status) {
        const { error: erroStatus } = await db.from('clients').update({
          status: alvo,
          ...(alvo === 'ativo' && !cliente.activated_at
            ? { activated_at: linha.paid_at ?? new Date().toISOString() }
            : {}),
        }).eq('id', clientId).eq('status', cliente.status);
        if (erroStatus) console.error('asaas-webhook status:', erroStatus);
        else virou = alvo;
      }
    }

    /* Aviso no WhatsApp — DEPOIS de gravar, e sempre dentro de try. O banco
       em dia é a obrigação desta função; a mensagem é o extra. Se a Meta
       estiver fora do ar, o Asaas não pode ficar sabendo. */
    let aviso: unknown = { ok: false, motivo: 'sem template para o evento' };
    const template = TEMPLATE_POR_EVENTO[evento];
    if (template && cliente) {
      try {
        aviso = await enviarTemplate(db, {
          para: cliente.whatsapp,
          template,
          client_id: cliente.id,
          // A chave amarra o disparo ao evento: PAYMENT_CREATED e
          // PAYMENT_RECEIVED da MESMA cobrança são avisos diferentes, e
          // cada um pode sair uma vez só.
          chave: `${evento}:${p.id}`,
          params: paramsDoTemplate(template, p, cliente),
          // Se tiver de esperar as 08h, só sai se a cobrança continuar aberta.
          condicao: status === 'pago' ? null : { tipo: 'cobranca_aberta', asaas_payment_id: String(p.id) },
        });
      } catch (e) {
        console.error('asaas-webhook aviso:', e);
      }
    }

    /* Pagou: o acesso volta na hora, sem esperar a rotina do dia seguinte.
       Só libera se não sobrar outra mensalidade vencida além da tolerância. */
    let acesso: unknown = null;
    if (status === 'pago' && cliente?.acesso_suspenso_em && cliente.lojista_company_id) {
      const { data: outras } = await db.from('payments').select('due_date')
        .eq('client_id', clientId).in('status', ['pendente', 'atrasado']).not('asaas_subscription_id', 'is', null);
      const hoje = hojeBRT();
      const aindaDeve = (outras ?? []).some((o: { due_date: string }) => passouDaTolerancia(o.due_date, hoje));
      if (!aindaDeve) {
        acesso = await pedirAoLojista({ acao: 'liberar', company_id: cliente.lojista_company_id });
        if ((acesso as { ok?: boolean })?.ok) {
          await db.from('clients').update({ acesso_suspenso_em: null }).eq('id', clientId);
          await db.from('activities').insert({ client_id: clientId, kind: 'nota', content: 'Acesso ao sistema liberado: mensalidade paga.' });
        }
      }
    }

    /* Primeira mensalidade paga de quem já tem data de implantação: o ciclo
       passa a contar da implantação, não do vencimento que o checkout
       inventou (hoje + 3 dias). */
    let ciclo: unknown = null;
    if (status === 'pago' && virou === 'ativo' && cliente?.implantado_em && (p.subscription || cliente.asaas_subscription_id)) {
      try {
        ciclo = await alinharCiclo(db, { id: clientId, asaas_subscription_id: p.subscription ?? cliente.asaas_subscription_id }, cliente.implantado_em);
      } catch (e) {
        ciclo = { erro: e instanceof Error ? e.message : 'falha ao alinhar' };
      }
    }

    /* O aviso de pagamento é o portão das mensalidades seguintes: assim que
       ele sai, a nota daquele mês pode ir atrás. A nota pode ter sido
       autorizada ANTES desta mensagem — nesse caso ela ficou esperando aqui. */
    let notas: unknown = null;
    if (template === 'pagamento_confirmado' && clientId) {
      try { notas = await tentarNotasPendentes(db, clientId); }
      catch (e) { notas = { erro: e instanceof Error ? e.message : 'falha' }; }
    }

    return json(200, { ok: true, evento, status, client_id: clientId, virou, aviso, notas, acesso, ciclo });
  } catch (err) {
    console.error('asaas-webhook:', err);
    /* Erro do PostgREST não é `Error`: é objeto com message/code/details, e
       tratar como Error devolvia só "Erro" — o que escondeu por semanas um
       upsert que nunca funcionou. */
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    const detalhe = err instanceof Error
      ? err.message
      : [e?.message, e?.code && `code ${e.code}`, e?.details, e?.hint].filter(Boolean).join(' · ') || 'Erro';
    // 500 para o Asaas reenviar e a cobrança não se perder.
    return json(500, { error: detalhe });
  }
});
