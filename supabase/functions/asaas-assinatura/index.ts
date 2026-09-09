import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Gera o link de cobrança MENSAL RECORRENTE de um cliente no Asaas.
 *
 * Por que link e não /subscriptions: a assinatura fechada exige CPF ou CNPJ
 * do cliente no ato da criação. Na hora de fechar a venda esse dado nem
 * sempre existe, e exigir travaria o fluxo. Com o link recorrente o valor e
 * o ciclo saem daqui, e quem preenche os próprios dados é o lojista, na
 * primeira vez que abre — e o Asaas cobra todo mês a partir daí.
 *
 * O VALOR VEM DA VENDA, não de um plano fixo. Os planos preenchem o campo
 * como sugestão; o que vale é o que foi negociado.
 *
 * Idempotente: com link já gerado devolve o que existe. Sem isso, dois
 * cliques criariam duas cobranças mensais para o mesmo lojista.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/**
 * O host sai do prefixo da própria chave: a do sandbox traz `_hmlg_`. Assim
 * não existe a chance de apontar a chave de produção para o sandbox e achar
 * que nada funcionou.
 */
const baseDaChave = (chave: string) =>
  chave.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';

async function asaas(base: string, chave: string, caminho: string, corpo: unknown) {
  const res = await fetch(`${base}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: chave, 'User-Agent': 'ViaPesados/1.0' },
    body: JSON.stringify(corpo),
  });
  const dados = await res.json().catch(() => null);
  if (!res.ok) {
    // A mensagem útil do Asaas vem em errors[].description, não no status.
    const detalhe = Array.isArray(dados?.errors)
      ? dados.errors.map((e: { description?: string }) => e.description).filter(Boolean).join(' · ')
      : JSON.stringify(dados).slice(0, 400);
    throw new Error(detalhe || `Asaas respondeu ${res.status}`);
  }
  return dados;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) return json(500, { error: 'ASAAS_API_KEY não configurada nas variáveis do projeto.' });
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

    const { client_id, valor, billing_type = 'UNDEFINED', vencimento_dias = 7 } = await req.json();
    if (!client_id) return json(400, { error: 'client_id é obrigatório' });

    const { data: cliente } = await db
      .from('clients')
      .select('id, company_name, mrr, asaas_payment_link_id, asaas_payment_link_url')
      .eq('id', client_id).maybeSingle();
    if (!cliente) return json(404, { error: 'Cliente não encontrado' });

    // ── já existe? devolve, não duplica ─────────────────────────────────
    if (cliente.asaas_payment_link_url) {
      return json(200, {
        ok: true,
        ja_existia: true,
        url: cliente.asaas_payment_link_url,
        link_id: cliente.asaas_payment_link_id,
      });
    }

    // O valor da chamada manda; o do cadastro é o reserva.
    const mensalidade = Number(valor ?? cliente.mrr ?? 0);
    if (!(mensalidade > 0)) {
      return json(400, { error: 'Informe o valor da mensalidade antes de gerar a cobrança.' });
    }

    const link = await asaas(base, chave, '/paymentLinks', {
      name: `Via Pesados — ${cliente.company_name}`,
      description: 'Mensalidade do sistema Via Pesados.',
      billingType: billing_type,      // UNDEFINED deixa o lojista escolher Pix, boleto ou cartão
      chargeType: 'RECURRENT',
      subscriptionCycle: 'MONTHLY',
      value: mensalidade,
      dueDateLimitDays: Number(vencimento_dias) || 7,
      externalReference: cliente.id,  // é por aqui que o webhook reencontra o cliente
      notificationEnabled: true,      // o Asaas avisa o lojista todo mês
    });

    await db.from('clients').update({
      asaas_payment_link_id: link.id,
      asaas_payment_link_url: link.url,
      // Mantém o cadastro coerente com o que foi de fato cobrado.
      mrr: mensalidade,
      updated_at: new Date().toISOString(),
    }).eq('id', cliente.id);

    return json(200, {
      ok: true,
      url: link.url,
      link_id: link.id,
      valor: mensalidade,
      ambiente: base.includes('sandbox') ? 'sandbox' : 'producao',
    });
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Erro desconhecido' });
  }
});
