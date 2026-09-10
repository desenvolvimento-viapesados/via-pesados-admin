/**
 * Em que pé está a emissão de nota fiscal.
 *
 * SÓ LEITURA — não emite, não agenda, não configura. Existe porque a tela
 * da Asaas não distingue "configurei a conta" de "emiti uma nota", e as
 * duas coisas falham de jeitos opostos: a primeira em silêncio, a segunda
 * com um documento fiscal errado no ar.
 *
 * Responde três perguntas, nesta ordem:
 *   1. a configuração fiscal da conta já está salva?
 *   2. o que o município exige para autenticar?
 *   3. já saiu alguma nota? (é o que prova que ninguém emitiu sem querer)
 */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

/* Diagnóstico não é extrato: o CNPJ confirma que é a conta certa, mas não
   precisa trafegar inteiro para isso. */
const mascara = (v: unknown) => {
  const s = String(v ?? '');
  return s.length > 6 ? `${s.slice(0, 2)}***${s.slice(-4)}` : s ? '***' : null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) return json(500, { error: 'ASAAS_API_KEY ausente' });
  const base = chave.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
  const h = { access_token: chave, 'User-Agent': 'ViaPesados/1.0' };
  const pega = async (p: string) => {
    const r = await fetch(`${base}${p}`, { headers: h });
    return { http: r.status, corpo: await r.json().catch(() => null) };
  };

  const fi = await pega('/fiscalInfo');
  const sv = await pega('/fiscalInfo/services?limit=20');
  const mo = await pega('/fiscalInfo/municipalOptions');
  const nf = await pega('/invoices?limit=10');
  const f = fi.corpo ?? {};

  /* A pergunta que o usuário fez: a conta está CONFIGURADA, ou aquilo era
     o formulário de uma nota avulsa? Se a Asaas devolve série e RPS aqui,
     é configuração de conta — nota avulsa não gravaria nada em /fiscalInfo. */
  const configurado = Boolean(f?.rpsSerie ?? f?.serie ?? f?.rpsNumber ?? f?.municipalInscription);

  return json(200, {
    ambiente: base.includes('sandbox') ? 'sandbox' : 'producao',
    configuracao_fiscal: {
      http: fi.http,
      ja_configurada: configurado,
      cnpj: mascara(f?.cpfCnpj),
      inscricao_municipal: f?.municipalInscription ?? null,
      regime_tributario: f?.simplesNacional === true ? 'Simples Nacional'
        : f?.simplesNacional === false ? 'fora do Simples' : null,
      incentivador_cultural: f?.culturalProjectsPromoter ?? null,
      regime_especial: f?.specialTaxRegime ?? null,
      serie_rps: f?.rpsSerie ?? f?.serie ?? null,
      numero_rps: f?.rpsNumber ?? null,
      numero_lote: f?.loteNumber ?? null,
      /* O certificado é o que trava a emissão automática: sem ele, toda
         nota exigiria alguém digitando senha no portal da prefeitura. */
      certificado_enviado: f?.certificateSent ?? null,
      certificado_vence_em: f?.certificateExpirationDate ?? null,
      usuario_municipal: f?.email ? mascara(f.email) : null,
      erro: fi.http >= 400 ? fi.corpo : undefined,
    },
    municipio: {
      http: mo.http,
      nome: mo.corpo?.municipalityName ?? mo.corpo?.name ?? null,
      autenticacao: mo.corpo?.authenticationType ?? null,
      usa_certificado: mo.corpo?.usesDigitalCertificate ?? null,
      usa_usuario_senha: mo.corpo?.usesSpecialUserAndPassword ?? null,
      usa_token: mo.corpo?.usesAccessToken ?? null,
      bruto: mo.corpo,
    },
    /* Os serviços cadastrados: é aqui que mora a alíquota que vai em CADA
       nota. Configuração fiscal salva não significa alíquota correta. */
    servicos: {
      http: sv.http,
      total: (sv.corpo?.data ?? []).length,
      lista: (sv.corpo?.data ?? []).map((x: Record<string, unknown>) => ({
        id: x.id, descricao: x.description, codigo_municipal: x.municipalServiceCode,
        nome_municipal: x.municipalServiceName, padrao: x.default ?? x.isDefault,
        impostos: x.taxes ?? { iss: x.iss, cofins: x.cofins, csll: x.csll, inss: x.inss, ir: x.ir, pis: x.pis },
        bruto: x,
      })),
      erro: sv.http >= 400 ? sv.corpo : undefined,
    },
    notas_emitidas: {
      http: nf.http,
      total: nf.corpo?.totalCount ?? (nf.corpo?.data ?? []).length,
      /* Se aparecer QUALQUER nota aqui, alguém emitiu um documento fiscal
         de verdade — e nota errada se resolve com cancelamento formal na
         prefeitura, com prazo curto. Por isso a lista vem detalhada. */
      lista: (nf.corpo?.data ?? []).map((n: Record<string, unknown>) => ({
        id: n.id, status: n.status, numero: n.number, valor: n.value,
        emitida_em: n.effectiveDate, cliente: n.customer,
      })),
    },
  });
});
