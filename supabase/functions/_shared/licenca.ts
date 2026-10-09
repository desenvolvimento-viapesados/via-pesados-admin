/**
 * Suspende e libera o acesso ao sistema do lojista.
 *
 * Quem guarda o estado é o projeto do LOJISTA (função `licenca`, colunas
 * `companies.acesso_*`), porque é lá que a tela trava. Daqui só se pede,
 * com um segredo que existe nos dois lados (LICENCA_SEGREDO) — é chamada
 * de servidor para servidor, sem usuário logado (a rotina das 9h corta).
 *
 * O corte é só do PAINEL. Site e anúncios continuam no ar: `companies.status`
 * não é tocado, porque é por ele que o domínio do site é resolvido.
 */

const LOJISTA_FUNCTIONS = 'https://ljjkerbczuwmxdbnxfes.supabase.co/functions/v1';
const PAGINA_DE_PAGAMENTO = 'https://viapesados.com.br/bemvindo'; // o mesmo endereço do botão das mensagens de cobrança

export const linkDePagamento = (checkoutToken: string | null | undefined) =>
  checkoutToken ? `${PAGINA_DE_PAGAMENTO}/${checkoutToken}` : null;

export async function pedirAoLojista(corpo: {
  acao: 'suspender' | 'liberar';
  company_id: string;
  motivo?: string;
  venceu_em?: string | null;
  link_pagamento?: string | null;
}): Promise<{ ok: boolean; motivo?: string }> {
  const segredo = Deno.env.get('LICENCA_SEGREDO');
  if (!segredo) return { ok: false, motivo: 'LICENCA_SEGREDO não configurado' };
  try {
    const r = await fetch(`${LOJISTA_FUNCTIONS}/licenca`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-licenca': segredo },
      body: JSON.stringify(corpo),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.ok) return { ok: false, motivo: d?.error ?? `lojista respondeu ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'falha de rede' };
  }
}
