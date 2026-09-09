import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Cria a cobrança recorrente de um cliente no Asaas.
 *
 * Duas chamadas em sequência, nesta ordem, porque a assinatura precisa do id
 * do cliente:
 *   1. POST /customers      — cria (ou reaproveita) o cadastro
 *   2. POST /subscriptions  — cria a recorrência mensal
 *
 * É AÇÃO EXPLÍCITA de propósito. Criar assinatura gera cobrança de verdade
 * na conta de uma empresa real; não pode acontecer como efeito colateral de
 * salvar um formulário.
 *
 * Idempotência: se o cliente já tem asaas_subscription_id, a função devolve
 * o que existe em vez de criar a segunda. Sem isso, dois cliques no botão
 * cobram o lojista duas vezes.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/**
 * O host sai do prefixo da própria chave. A do sandbox começa com
 * `$aact_hmlg_`; a de produção, não. Assim não existe a chance clássica de
 * apontar a chave de produção para o sandbox e achar que nada funcionou.
 */
function baseDaChave(chave: string) {
  return chave.includes('_hmlg_')
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3';
}

const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

async function asaas(base: string, chave: string, caminho: string, corpo?: unknown) {
  const res = await fetch(`${base}${caminho}`, {
    method: corpo ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      access_token: chave,
      'User-Agent': 'ViaPesados/1.0',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await res.json().catch(() => null);
  if (!res.ok) {
    // O Asaas devolve os problemas em errors[].description — a mensagem útil
    // está lá, não no status.
    const detalhe = Array.isArray(dados?.errors)
      ? dados.errors.map((e: { description?: string }) => e.description).filter(Boolean).join(' · ')
      : JSON.stringify(dados).slice(0, 400);
    throw new Error(detalhe || `Asaas respondeu ${res.status}`);
  }
  return dados;
}

/** Primeiro vencimento: o dia escolhido, ou daqui a 7 dias. */
function primeiroVencimento(dia?: number) {
  const d = new Date();
  if (dia && dia >= 1 && dia <= 28) {
    d.setDate(dia);
    if (d.getTime() < Date.now()) d.setMonth(d.getMonth() + 1);
  } else {
    d.setDate(d.getDate() + 7);
  }
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) {
    return json(500, {
      error: 'ASAAS_API_KEY não configurada nas variáveis do projeto.',
    });
  }
  const base = baseDaChave(chave);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // ── quem está pedindo ───────────────────────────────────────────────
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    if (!auth) return json(401, { error: 'Não autenticado' });
    const { data: { user } } = await db.auth.getUser(auth);
    if (!user) return json(401, { error: 'Token inválido' });
    const { data: membro } = await db
      .from('team_members').select('id, is_active').eq('id', user.id).maybeSingle();
    if (!membro || membro.is_active === false) {
      return json(403, { error: 'Acesso negado: não é membro ativo da equipe' });
    }

    const { client_id, billing_type = 'UNDEFINED', due_day } = await req.json();
    if (!client_id) return json(400, { error: 'client_id é obrigatório' });

    const { data: cliente } = await db
      .from('clients')
      .select('id, company_name, legal_name, cnpj, email, whatsapp, mrr, plan_id, asaas_customer_id, asaas_subscription_id')
      .eq('id', client_id).maybeSingle();
    if (!cliente) return json(404, { error: 'Cliente não encontrado' });

    // ── já existe? devolve, não duplica ─────────────────────────────────
    if (cliente.asaas_subscription_id) {
      return json(200, {
        ok: true,
        ja_existia: true,
        subscription_id: cliente.asaas_subscription_id,
        customer_id: cliente.asaas_customer_id,
      });
    }

    // ── valor: o do plano manda; mrr é a exceção ────────────────────────
    let valor = Number(cliente.mrr) || 0;
    let nomePlano: string | null = null;
    if (cliente.plan_id) {
      const { data: plano } = await db
        .from('plans').select('name, monthly_value').eq('id', cliente.plan_id).maybeSingle();
      if (plano) { valor = Number(plano.monthly_value); nomePlano = plano.name; }
    }
    if (!(valor > 0)) {
      return json(400, { error: 'Cliente sem valor de mensalidade. Defina o plano antes de cobrar.' });
    }

    const cpfCnpj = soDigitos(cliente.cnpj);
    if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
      return json(400, { error: 'CNPJ do cliente ausente ou inválido — o Asaas exige CPF ou CNPJ para criar o cadastro.' });
    }

    // ── 1. cadastro no Asaas ────────────────────────────────────────────
    let customerId = cliente.asaas_customer_id;
    if (!customerId) {
      const novo = await asaas(base, chave, '/customers', {
        name: cliente.legal_name || cliente.company_name,
        cpfCnpj,
        email: cliente.email || undefined,
        mobilePhone: soDigitos(cliente.whatsapp) || undefined,
        externalReference: cliente.id,
        notificationDisabled: false,
      });
      customerId = novo.id;
      await db.from('clients').update({ asaas_customer_id: customerId }).eq('id', cliente.id);
    }

    // ── 2. assinatura ───────────────────────────────────────────────────
    const assinatura = await asaas(base, chave, '/subscriptions', {
      customer: customerId,
      billingType: billing_type,          // UNDEFINED deixa o lojista escolher no boleto
      value: valor,
      nextDueDate: primeiroVencimento(due_day),
      cycle: 'MONTHLY',
      description: nomePlano
        ? `Via Pesados — plano ${nomePlano}`
        : 'Via Pesados — mensalidade',
      externalReference: cliente.id,
    });

    await db.from('clients').update({
      asaas_subscription_id: assinatura.id,
      updated_at: new Date().toISOString(),
    }).eq('id', cliente.id);

    return json(200, {
      ok: true,
      customer_id: customerId,
      subscription_id: assinatura.id,
      valor,
      plano: nomePlano,
      proximo_vencimento: assinatura.nextDueDate,
      ambiente: base.includes('sandbox') ? 'sandbox' : 'producao',
    });
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Erro desconhecido' });
  }
});
