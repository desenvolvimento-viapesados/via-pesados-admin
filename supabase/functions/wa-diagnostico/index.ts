/**
 * Estado dos templates, lido pela Graph API com o nosso token.
 *
 * SÓ LEITURA, de propósito: esta função não manda mensagem nenhuma. Serve
 * para responder duas perguntas sem abrir o Gerenciador da Meta —
 * "o token está válido?" e "os modelos já aprovaram?" — e a segunda é a que
 * decide se os gatilhos podem correr soltos.
 *
 * É pública porque o que ela devolve é o nome e o status de modelo nosso,
 * que não é segredo. O token nunca sai daqui.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const WABA = '2088077995129091';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const token = Deno.env.get('META_WABA_TOKEN');
  if (!token) return json(500, { error: 'META_WABA_TOKEN não configurada.' });

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${WABA}/message_templates?fields=name,status,category,language,rejected_reason&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const dados = await res.json();
    if (!res.ok) {
      // O erro da Meta é a informação útil aqui: diz se é token inválido,
      // permissão faltando ou ativo errado.
      return json(502, { ok: false, erro_meta: dados?.error ?? dados });
    }

    const lista = (dados?.data ?? []) as Array<Record<string, string>>;
    const porStatus: Record<string, number> = {};
    for (const t of lista) porStatus[t.status] = (porStatus[t.status] ?? 0) + 1;

    /* O número em si, não só os templates. Listar template prova que o
       token lê a conta; não prova que ele ENVIA. É a diferença que separou
       "recebe mas não responde" de "token errado" quando o envio quebrou. */
    const numeroId = Deno.env.get('WA_PHONE_NUMBER_ID');
    let numero: unknown = { motivo: 'WA_PHONE_NUMBER_ID ausente' };
    if (numeroId) {
      const rn = await fetch(
        `https://graph.facebook.com/v21.0/${numeroId}?fields=display_phone_number,verified_name,quality_rating,platform_type,throughput`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const dn = await rn.json().catch(() => null);
      numero = rn.ok
        ? { alcancavel: true, telefone: dn?.display_phone_number, nome: dn?.verified_name,
            qualidade: dn?.quality_rating, plataforma: dn?.platform_type }
        : { alcancavel: false, erro: dn?.error?.message, codigo: dn?.error?.code };
    }

    return json(200, {
      ok: true,
      token: 'válido',
      numero,
      total: lista.length,
      por_status: porStatus,
      templates: lista
        .map((t) => ({ nome: t.name, status: t.status, categoria: t.category, motivo: t.rejected_reason }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'Erro' });
  }
});
