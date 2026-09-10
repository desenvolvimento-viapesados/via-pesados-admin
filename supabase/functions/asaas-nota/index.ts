import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarNotaFiscal } from '../_shared/nota-aviso.ts';

/**
 * Recebe os eventos de NOTA FISCAL do Asaas e mantém `notas_fiscais` em dia.
 *
 * POR QUE UM ENDEREÇO SEPARADO DO asaas-webhook, e não mais uns `case` lá:
 * o Asaas INTERROMPE a fila de um webhook depois de falhas seguidas. Se a
 * nota fiscal dividisse a URL com a cobrança, um erro ao gravar nota
 * derrubaria a fila de pagamentos junto — e aí o sistema para de saber quem
 * pagou. Duas URLs, duas filas: o pior caso de uma não contamina a outra.
 *
 * Vale aqui a mesma regra de lá: entrega "pelo menos uma vez", então tudo
 * é idempotente (upsert por asaas_invoice_id), e evento desconhecido
 * responde 200 — 4xx faria o Asaas reenviar para sempre.
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

/**
 * O status vem do OBJETO, não do nome do evento.
 *
 * É de propósito: o Asaas reenvia o mesmo evento e às vezes manda
 * INVOICE_UPDATED carregando um estado que já avançou. Ler o objeto faz a
 * linha refletir a verdade atual da nota, e não a ordem em que os avisos
 * chegaram.
 */
const STATUS: Record<string, string> = {
  SCHEDULED:               'agendada',
  SYNCHRONIZED:            'enviada',
  AUTHORIZED:              'autorizada',
  PROCESSING_CANCELLATION: 'cancelando',
  CANCELED:                'cancelada',
  CANCELLATION_DENIED:     'cancelamento_negado',
  ERROR:                   'erro',
};

/** O Asaas descreve a falha em formatos diferentes conforme a origem. */
function motivoDoErro(inv: Record<string, any>): string | null {
  const e = inv?.errors ?? inv?.error ?? inv?.statusDescription ?? inv?.rejectionReason;
  if (!e) return null;
  if (typeof e === 'string') return e.slice(0, 500);
  if (Array.isArray(e)) return e.map((x) => x?.description ?? x?.message ?? String(x)).join(' | ').slice(0, 500);
  return String(e?.description ?? e?.message ?? JSON.stringify(e)).slice(0, 500);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const segredo = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
  if (segredo) {
    if (!segredoConfere(req.headers.get('asaas-access-token') ?? '', segredo)) {
      return json(401, { error: 'Token do webhook inválido' });
    }
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const corpo = await req.json();
    const evento: string = corpo?.event ?? '';
    const inv = corpo?.invoice;
    if (!inv?.id) return json(200, { ok: true, ignorado: 'evento sem nota' });

    const status = STATUS[String(inv.status ?? '')] ?? null;
    if (!status) return json(200, { ok: true, ignorado: `status desconhecido: ${inv.status}`, evento });

    /* Acha o dono da nota. Quatro caminhos, do mais confiável ao menos:
       o nosso id gravado no externalReference, a assinatura, o cadastro no
       Asaas e, por último, a cobrança que gerou a nota. */
    let clientId: string | null = null;
    const ref = String(inv.externalReference ?? '').trim();
    if (/^[0-9a-f-]{36}$/i.test(ref)) {
      const { data } = await db.from('clients').select('id').eq('id', ref).maybeSingle();
      clientId = data?.id ?? null;
    }
    if (!clientId && inv.subscription) {
      const { data } = await db.from('clients').select('id').eq('asaas_subscription_id', inv.subscription).maybeSingle();
      clientId = data?.id ?? null;
    }
    if (!clientId && inv.customer) {
      const { data } = await db.from('clients').select('id').eq('asaas_customer_id', inv.customer).maybeSingle();
      clientId = data?.id ?? null;
    }
    if (!clientId && inv.payment) {
      const { data } = await db.from('payments').select('client_id').eq('asaas_payment_id', inv.payment).maybeSingle();
      clientId = data?.client_id ?? null;
    }

    const linha = {
      /* Sem dono, a nota entra assim mesmo. Documento fiscal existe no
         mundo tendo ou não linha correspondente aqui: descartar seria
         perder o registro de algo que a prefeitura já autorizou. */
      client_id: clientId,
      asaas_invoice_id:      inv.id,
      asaas_payment_id:      inv.payment ?? null,
      asaas_subscription_id: inv.subscription ?? null,
      asaas_customer_id:     inv.customer ?? null,
      numero:             inv.number ?? null,
      serie:              inv.rpsSerie ?? null,
      rps_numero:         inv.rpsNumber != null ? String(inv.rpsNumber) : null,
      codigo_verificacao: inv.validationCode ?? null,
      status,
      valor:       inv.value != null ? Number(inv.value) : null,
      descricao:   inv.serviceDescription ?? null,
      competencia: inv.effectiveDate ?? null,
      pdf_url: inv.pdfUrl ?? null,
      xml_url: inv.xmlUrl ?? null,
      /* Limpa o erro quando a nota se recupera: uma emissão que falhou e
         depois foi autorizada não pode continuar mostrando a falha antiga. */
      erro: status === 'erro' ? motivoDoErro(inv) : null,
      emitida_em:   status === 'autorizada' ? (inv.effectiveDate ?? new Date().toISOString()) : null,
      cancelada_em: status === 'cancelada' ? new Date().toISOString() : null,
      bruto: inv,
    };

    const { data: gravada, error } = await db.from('notas_fiscais')
      .upsert(linha, { onConflict: 'asaas_invoice_id' })
      .select('id').maybeSingle();
    if (error) {
      /* 500 aqui é proposital, ao contrário do evento ignorado: falha de
         gravação PRECISA de reenvio, senão a nota some sem rastro. */
      return json(500, { ok: false, erro: error.message, code: error.code, details: error.details, hint: error.hint });
    }

    /* Nota autorizada tenta virar mensagem. "Tenta" porque os portões estão
       no `enviarNotaFiscal`: se o sistema do lojista ainda não foi liberado,
       ou se o aviso de pagamento não saiu, ela fica esperando — e sai quando
       o outro gatilho fechar a conta. */
    let aviso: unknown = { enviado: false, motivo: 'nota não autorizada' };
    if (status === 'autorizada' && gravada?.id) {
      try {
        aviso = await enviarNotaFiscal(db, gravada.id);
      } catch (e) {
        // Falha de WhatsApp não pode devolver erro: o Asaas reenviaria e,
        // depois de muitas falhas, interromperia a fila de notas.
        aviso = { enviado: false, motivo: e instanceof Error ? e.message : 'falha no aviso' };
      }
    }

    return json(200, { ok: true, evento, nota: inv.id, status, cliente: clientId ?? 'sem dono', aviso });
  } catch (e) {
    return json(500, { ok: false, erro: e instanceof Error ? e.message : 'falha ao processar' });
  }
});
