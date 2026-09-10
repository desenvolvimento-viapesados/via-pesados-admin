import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Checkout na página da própria Via Pesados.
 *
 * PÚBLICO por desenho: o lojista abre pelo WhatsApp, sem login. Quem
 * autentica é o token da URL — longo, aleatório e único por cliente.
 *
 * Três regras que moldam este arquivo:
 *
 *  1. NUNCA devolver a linha inteira do cliente. A resposta é montada campo
 *     a campo. Um `select('*')` aqui vazaria senha de admin e CNPJ para uma
 *     página aberta na internet.
 *
 *  2. NUNCA gravar dado de cartão. O número atravessa esta função a caminho
 *     do Asaas e morre aqui — não vai para log, não vai para o banco, não
 *     volta na resposta. O que fica é o token que o Asaas devolve.
 *
 *  3. Idempotência por cliente. Recarregar a página não pode criar uma
 *     segunda assinatura: se já existe, devolve a cobrança que existe.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const baseDaChave = (c: string) =>
  c.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';

const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

async function asaas(base: string, chave: string, caminho: string, corpo?: unknown, metodo = 'POST') {
  const res = await fetch(`${base}${caminho}`, {
    method: corpo ? metodo : 'GET',
    headers: { 'Content-Type': 'application/json', access_token: chave, 'User-Agent': 'ViaPesados/1.0' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await res.json().catch(() => null);
  if (!res.ok) {
    const detalhe = Array.isArray(dados?.errors)
      ? dados.errors.map((e: { description?: string }) => e.description).filter(Boolean).join(' · ')
      : `Asaas respondeu ${res.status}`;
    throw new Error(detalhe);
  }
  return dados;
}

/** Primeiro vencimento: hoje + 3 dias, para dar folga ao boleto. */
function vencimentoInicial() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

/**
 * O IP de quem está comprando. O Asaas exige o do COMPRADOR, não o do
 * servidor — mandar o nosso derruba a análise antifraude deles.
 */
function ipDoComprador(req: Request) {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) return json(500, { error: 'Pagamento indisponível no momento.' });
  const base = baseDaChave(chave);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const corpo = await req.json().catch(() => ({}));
    const { token, acao } = corpo as { token?: string; acao?: string };

    if (!token || token.length < 20) return json(404, { error: 'Link inválido.' });

    const { data: cli } = await db
      .from('clients')
      .select('id, prospect_id, company_name, contact_name, email, whatsapp, cnpj, city, state, plan, mrr, canais, logo_url, asaas_customer_id, asaas_subscription_id, asaas_first_payment_id, checkout_billing_type')
      .eq('checkout_token', token)
      .maybeSingle();

    if (!cli) return json(404, { error: 'Link inválido ou expirado.' });

    /* ── abrir: o que a página mostra ────────────────────────────────
       Montado campo a campo de propósito. Nada além disto sai daqui. */
    if (acao === 'abrir') {
      /* A logo do lojista faz a página deixar de ser "mais um checkout" e
         virar a casa dele. Vem do cadastro; se ainda não subiram, cai para
         a da amostra, que é montada antes da venda justamente com a marca
         dele. Sem nenhuma das duas, fica só a Via Pesados — meia parceria
         desenhada fica pior que nenhuma. */
      let logoCliente: string | null = cli.logo_url ?? null;
      if (!logoCliente && cli.prospect_id) {
        const { data: amostra } = await db
          .from('demos')
          .select('logo_url, site_logo_url, brand_icon_url')
          .eq('prospect_id', cli.prospect_id)
          .order('created_at', { ascending: false })
          .limit(1).maybeSingle();
        logoCliente = amostra?.logo_url ?? amostra?.site_logo_url ?? amostra?.brand_icon_url ?? null;
      }

      /* Em que momento o lojista está? Não é a mesma página para quem
         está decidindo e para quem já é cliente há meses. A diferença sai
         do histórico da assinatura, não de um campo nosso — o que vale é
         o que o Asaas realmente recebeu. */
      let mesesPagos = 0;
      let cobrancaAberta: { id: string; valor: number; vence: string; tipo: string } | null = null;
      /* Débito automático já ligado? Quem responde é a assinatura no Asaas,
         não um campo nosso: só está ligado quando o ciclo é CREDIT_CARD E
         existe cartão guardado. Com billingType CREDIT_CARD e sem cartão o
         Asaas ainda manda o lojista pagar à mão todo mês — dizer que está
         automático nesse caso seria mentira que ele descobre no vencimento. */
      let debitoAutomatico = false;
      if (cli.asaas_subscription_id) {
        try {
          const sub = await asaas(base, chave, `/subscriptions/${cli.asaas_subscription_id}`);
          debitoAutomatico = String(sub?.billingType) === 'CREDIT_CARD' && !!sub?.creditCard;
        } catch { /* na dúvida, oferece marcar: pior é esconder a opção */ }
        try {
          const lista = await asaas(base, chave, `/subscriptions/${cli.asaas_subscription_id}/payments`);
          const pagamentos: Array<Record<string, unknown>> = Array.isArray(lista?.data) ? lista.data : [];
          mesesPagos = pagamentos.filter((p) =>
            ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(String(p.status))).length;
          // A mais antiga em aberto é a que ele precisa pagar agora.
          const aberta = pagamentos
            .filter((p) => ['PENDING', 'OVERDUE'].includes(String(p.status)))
            .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
          if (aberta) {
            cobrancaAberta = {
              id: String(aberta.id),
              valor: Number(aberta.value) || 0,
              vence: String(aberta.dueDate ?? ''),
              tipo: String(aberta.billingType ?? ''),
            };
          }
        } catch { /* a página abre mesmo se o Asaas oscilar */ }
      }

      return json(200, {
        ok: true,
        logo_cliente: logoCliente,
        meses_pagos: mesesPagos,
        cobranca_aberta: cobrancaAberta,
        debito_automatico: debitoAutomatico,
        contato: cli.contact_name,
        empresa: cli.company_name,
        cidade: cli.city,
        uf: cli.state,
        plano: cli.plan,
        valor: Number(cli.mrr) || 0,
        canais: cli.canais ?? [],
        ja_assinou: !!cli.asaas_subscription_id,
      });
    }

    const valor = Number(cli.mrr) || 0;
    if (!(valor > 0)) return json(400, { error: 'Cobrança ainda não configurada. Fale com seu contato na Via Pesados.' });

    /* ── garante o cadastro do cliente no Asaas ──────────────────── */
    async function garantirCustomer(dados?: { cpfCnpj?: string; nome?: string; email?: string; fone?: string }) {
      if (cli!.asaas_customer_id) return cli!.asaas_customer_id;
      const doc = soDigitos(dados?.cpfCnpj ?? cli!.cnpj);
      if (doc.length !== 11 && doc.length !== 14) {
        throw new Error('Informe um CPF ou CNPJ válido.');
      }
      const novo = await asaas(base, chave!, '/customers', {
        name: dados?.nome || cli!.company_name,
        cpfCnpj: doc,
        email: dados?.email || cli!.email || undefined,
        mobilePhone: soDigitos(dados?.fone ?? cli!.whatsapp) || undefined,
        externalReference: cli!.id,
      });
      await db.from('clients').update({ asaas_customer_id: novo.id }).eq('id', cli!.id);
      return novo.id as string;
    }

    /** Primeira cobrança da assinatura — é dela que sai o QR e o boleto. */
    async function primeiraCobranca(subId: string) {
      const lista = await asaas(base, chave!, `/subscriptions/${subId}/payments`);
      const p = Array.isArray(lista?.data) ? lista.data[0] : null;
      if (p?.id) await db.from('clients').update({ asaas_first_payment_id: p.id }).eq('id', cli!.id);
      return p;
    }

    /* ── Pix e boleto ────────────────────────────────────────────────
       A assinatura nasce com billingType UNDEFINED de propósito. Travá-la
       em PIX ou BOLETO na primeira escolha decidiria, ali, como o lojista
       pagaria por todos os meses seguintes — e ele pode querer Pix num mês
       e boleto no outro. Aberta, cada cobrança mensal aceita as duas, e a
       pergunta continua valendo todo mês. */
    if (acao === 'pix' || acao === 'boleto') {
      let subId = cli.asaas_subscription_id;
      if (!subId) {
        const customer = await garantirCustomer(corpo as never);
        const sub = await asaas(base, chave, '/subscriptions', {
          customer,
          billingType: 'UNDEFINED',
          value: valor,
          nextDueDate: vencimentoInicial(),
          cycle: 'MONTHLY',
          description: `Via Pesados — ${cli.plan ? `plano ${cli.plan}` : 'mensalidade'}`,
          externalReference: cli.id,
        });
        subId = sub.id;
        await db.from('clients').update({
          asaas_subscription_id: subId,
          checkout_billing_type: 'UNDEFINED',
        }).eq('id', cli.id);
      }

      const cobranca = await primeiraCobranca(subId!);
      if (!cobranca) return json(502, { error: 'A cobrança ainda está sendo gerada. Tente em alguns segundos.' });

      if (acao === 'pix') {
        const qr = await asaas(base, chave, `/payments/${cobranca.id}/pixQrCode`);
        return json(200, {
          ok: true, tipo: 'pix',
          payment_id: cobranca.id,
          valor,
          qr_base64: qr.encodedImage,   // PNG em base64
          copia_cola: qr.payload,
          vence_em: cobranca.dueDate,
        });
      }

      return json(200, {
        ok: true, tipo: 'boleto',
        payment_id: cobranca.id,
        valor,
        linha_digitavel: cobranca.identificationField ?? null,
        boleto_url: cobranca.bankSlipUrl ?? null,
        vence_em: cobranca.dueDate,
      });
    }

    /* ── Cartão ───────────────────────────────────────────────────
       Dois caminhos, e a diferença importa:

       · sem assinatura → tokeniza e cria a recorrência no cartão;
       · com assinatura → paga SÓ a cobrança do mês, por
         /payments/{id}/payWithCreditCard, sem tocar na assinatura.

       O segundo é o que permite ele pagar no cartão este mês e no Pix no
       próximo. Antes eu devolvia "já assinou" e não fazia nada — o cartão
       simplesmente sumia para quem já era cliente. */
    if (acao === 'cartao') {
      const { cartao: c0, titular: t0, payment_id } = corpo as {
        cartao?: Record<string, string>;
        titular?: Record<string, string>;
        payment_id?: string;
      };

      const { autorizar_recorrencia } = corpo as { autorizar_recorrencia?: boolean };
      const dadosCartao = c0 && {
        holderName: c0.holderName,
        number: soDigitos(c0.number),
        expiryMonth: c0.expiryMonth,
        expiryYear: c0.expiryYear,
        ccv: c0.ccv,
      };
      const dadosTitular = t0 && {
        name: t0.name,
        email: t0.email,
        cpfCnpj: soDigitos(t0.cpfCnpj),
        postalCode: soDigitos(t0.postalCode),
        addressNumber: t0.addressNumber,
        phone: soDigitos(t0.phone),
      };

      if (cli.asaas_subscription_id && payment_id) {
        if (!c0?.number || !t0?.cpfCnpj) {
          return json(400, { error: 'Preencha os dados do cartão e do titular.' });
        }
        const p = await asaas(base, chave, `/payments/${payment_id}`, undefined, 'GET');
        if (String(p?.externalReference ?? '') !== cli.id) {
          return json(403, { error: 'Cobrança não pertence a este cliente.' });
        }

        // O cartão atravessa daqui para o Asaas e morre. Nada é gravado.
        const pago = await asaas(base, chave, `/payments/${payment_id}/payWithCreditCard`, {
          creditCard: dadosCartao,
          creditCardHolderInfo: dadosTitular,
        });

        /* Débito automático só com autorização explícita, e SEMPRE depois do
           pagamento do mês: se guardar o cartão falhar, o dinheiro já entrou
           e o lojista escolhe de novo no mês que vem. O contrário perderia o
           pagamento por causa de uma conveniência. */
        let recorrenciaAtivada = false;
        let avisoRecorrencia: string | null = null;
        if (autorizar_recorrencia) {
          try {
            await asaas(base, chave, `/subscriptions/${cli.asaas_subscription_id}/creditCard`, {
              creditCard: dadosCartao,
              creditCardHolderInfo: dadosTitular,
              remoteIp: ipDoComprador(req),
            }, 'PUT');
            await asaas(base, chave, `/subscriptions/${cli.asaas_subscription_id}`, {
              billingType: 'CREDIT_CARD',
            }, 'PUT');
            await db.from('clients').update({ checkout_billing_type: 'CREDIT_CARD' }).eq('id', cli.id);
            recorrenciaAtivada = true;
          } catch (e) {
            avisoRecorrencia = e instanceof Error ? e.message : 'não foi possível ativar';
          }
        }

        return json(200, {
          ok: true, tipo: 'cartao', mes_pago: true,
          situacao: pago?.status, valor: Number(pago?.value) || valor,
          recorrencia_ativada: recorrenciaAtivada,
          aviso_recorrencia: avisoRecorrencia,
        });
      }

      if (cli.asaas_subscription_id) {
        return json(200, { ok: true, tipo: 'cartao', ja_assinou: true });
      }

      /* ── PRIMEIRA COMPRA no cartão ──────────────────────────────────
         Com autorização: tokeniza e cria a recorrência — o Asaas debita
         sozinho todo mês. Sem autorização: a assinatura nasce aberta e
         ele paga só este mês, escolhendo de novo no próximo.

         Guardar o cartão sem ele marcar seria débito automático sem
         consentimento, que é o tipo de coisa que gera chargeback e perde
         cliente. */
      if (!c0?.number || !t0?.cpfCnpj) {
        return json(400, { error: 'Preencha os dados do cartão e do titular.' });
      }
      const customer = await garantirCustomer({
        cpfCnpj: t0.cpfCnpj, nome: t0.name, email: t0.email, fone: t0.phone,
      });

      if (autorizar_recorrencia) {
        /* O cartão vai DIRETO na assinatura, e a Asaas guarda por dentro.
           Antes isto passava por /creditCard/tokenizeCreditCard, que a conta
           responde com 403 — permissão que só o gerente libera. Este caminho
           não é bloqueado, e o resultado para o lojista é idêntico: ele digita
           o cartão uma vez e a mensalidade passa sozinha todo mês.
           Nós continuamos sem guardar cartão nenhum: quem guarda é a Asaas. */
        const sub = await asaas(base, chave, '/subscriptions', {
          customer,
          billingType: 'CREDIT_CARD',
          value: valor,
          nextDueDate: vencimentoInicial(),
          cycle: 'MONTHLY',
          description: `Via Pesados — ${cli.plan ? `plano ${cli.plan}` : 'mensalidade'}`,
          externalReference: cli.id,
          creditCard: dadosCartao,
          creditCardHolderInfo: dadosTitular,
          remoteIp: ipDoComprador(req),
        });
        await db.from('clients').update({
          asaas_subscription_id: sub.id,
          checkout_billing_type: 'CREDIT_CARD',
        }).eq('id', cli.id);
        return json(200, {
          ok: true, tipo: 'cartao', valor,
          recorrencia_ativada: true,
          // A Asaas devolve os dados mascarados do cartão guardado.
          final: sub?.creditCard?.creditCardNumber, bandeira: sub?.creditCard?.creditCardBrand,
        });
      }

      // Sem autorização: assinatura aberta, e o cartão paga só este mês.
      const sub = await asaas(base, chave, '/subscriptions', {
        customer,
        billingType: 'UNDEFINED',
        value: valor,
        nextDueDate: vencimentoInicial(),
        cycle: 'MONTHLY',
        description: `Via Pesados — ${cli.plan ? `plano ${cli.plan}` : 'mensalidade'}`,
        externalReference: cli.id,
      });
      await db.from('clients').update({
        asaas_subscription_id: sub.id,
        checkout_billing_type: 'UNDEFINED',
      }).eq('id', cli.id);

      const primeira = await primeiraCobranca(sub.id);
      if (!primeira) return json(502, { error: 'A cobrança está sendo gerada. Tente em alguns segundos.' });

      const pagoAgora = await asaas(base, chave, `/payments/${primeira.id}/payWithCreditCard`, {
        creditCard: dadosCartao,
        creditCardHolderInfo: dadosTitular,
      });
      return json(200, {
        ok: true, tipo: 'cartao', valor,
        recorrencia_ativada: false,
        situacao: pagoAgora?.status,
      });
    }

    /* ── atual: a cobrança do mês que já existe ───────────────────
       Diferente de 'pix'/'boleto', que criam a assinatura. Aqui a
       assinatura já existe e só queremos o QR ou a linha do mês corrente
       — criar outra cobraria o lojista duas vezes. */
    if (acao === 'atual') {
      const { payment_id } = corpo as { payment_id?: string };
      if (!payment_id) return json(400, { error: 'Cobrança não informada.' });

      const p = await asaas(base, chave, `/payments/${payment_id}`);
      if (String(p?.externalReference ?? '') !== cli.id) {
        // O id vem do navegador: sem esta checagem, trocar o número na
        // requisição mostraria a cobrança de outro lojista.
        return json(403, { error: 'Cobrança não pertence a este cliente.' });
      }

      // A forma vem da escolha do mês, não do tipo com que a assinatura
      // foi criada — é isso que permite alternar entre Pix e boleto.
      const { forma } = corpo as { forma?: string };
      const querBoleto = forma === 'boleto' || (!forma && p.billingType === 'BOLETO');

      if (querBoleto) {
        /* Em cobrança aberta (UNDEFINED) o campo identificationField vem
           vazio: o Asaas só emite a linha sob demanda. Sem esta chamada o
           lojista veria a tela do boleto sem a linha para copiar, que é
           justamente o que ele foi buscar ali. */
        let linha: string | null = p.identificationField ?? null;
        if (!linha) {
          try {
            const ident = await asaas(base, chave, `/payments/${p.id}/identificationField`);
            linha = ident?.identificationField ?? null;
          } catch { /* sem linha, ainda resta o PDF */ }
        }
        return json(200, {
          ok: true, tipo: 'boleto', payment_id: p.id, valor: Number(p.value) || 0,
          linha_digitavel: linha,
          boleto_url: p.bankSlipUrl ?? null,
          vence_em: p.dueDate,
        });
      }

      const qr = await asaas(base, chave, `/payments/${p.id}/pixQrCode`);
      return json(200, {
        ok: true, tipo: 'pix', payment_id: p.id, valor: Number(p.value) || 0,
        qr_base64: qr.encodedImage, copia_cola: qr.payload, vence_em: p.dueDate,
      });
    }

    /* ── status: a página pergunta se o Pix já caiu ──────────────── */
    if (acao === 'status') {
      if (!cli.asaas_first_payment_id) return json(200, { ok: true, pago: false });
      const p = await asaas(base, chave, `/payments/${cli.asaas_first_payment_id}`);
      const pago = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(String(p?.status));
      return json(200, { ok: true, pago, situacao: p?.status });
    }

    return json(400, { error: 'Ação desconhecida.' });
  } catch (err) {
    // A mensagem do Asaas é útil para o lojista ("cartão recusado", "CPF
    // inválido") e não vaza nada nosso — vai para a tela.
    return json(400, { error: err instanceof Error ? err.message : 'Não foi possível concluir.' });
  }
});
