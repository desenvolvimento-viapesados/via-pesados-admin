import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  configYCloud, faltaNaYCloud, listarTemplates, listarWebhooks, listarNumeros, lerPerfil, ycloudPelaMetade,
} from '../_shared/ycloud.ts';

/**
 * Estado dos templates, no provedor que estiver ligado.
 *
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

/* O ID da WABA vive no ambiente, nao aqui. Ficou fixo no codigo ate a conta
   ser desabilitada em 14/09/2026 — e trocar de conta virou cacar a mesma
   constante em tres funcoes, cada uma podendo ficar para tras e consultar em
   silencio uma WABA que nao existe mais. */
const WABA = Deno.env.get('META_WABA_ID');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  /* A YCloud manda quando está configurada: é por onde o número oficial
     passou a falar depois de a WABA anterior ser desabilitada. */
  /* Meia configuração não cai para o provedor antigo: avisa. */
  if (ycloudPelaMetade()) {
    return json(500, {
      ok: false,
      error: 'A YCloud está configurada pela metade — não vou cair no provedor antigo em silêncio.',
      falta_na_ycloud: faltaNaYCloud(),
    });
  }

  const ycloud = configYCloud();
  if (ycloud) {
    try {
      const lista = await listarTemplates(ycloud);
      const porStatus: Record<string, number> = {};
      for (const t of lista) porStatus[t.status] = (porStatus[t.status] ?? 0) + 1;

      /* O número como a Meta o vê. Falhar aqui não esconde o resto: é
         pergunta separada, e "não sei" é melhor que tela em branco. */
      let numero: unknown = null;
      let erroNumero: string | null = null;
      try {
        const nums = await listarNumeros(ycloud);
        const n = nums.find((x) => (x.phoneNumber ?? '').replace(/\D/g, '').endsWith(ycloud.numero.replace(/\D/g, '')))
          ?? nums[0] ?? null;
        numero = n && {
          telefone: n.phoneNumber,
          nome_exibicao: n.verifiedName ?? n.displayName ?? null,
          /* APPROVED é o que faz quem recebe ler "Via Pesados" no lugar
             do número. Sem isso, a mensagem chega como desconhecido. */
          nome_status: n.nameStatus ?? null,
          qualidade: n.qualityRating ?? null,
          limite: n.messagingLimit ?? null,
          situacao: n.status ?? null,
          selo_oficial: n.isOfficialBusinessAccount ?? null,
        };
      } catch (e) {
        erroNumero = e instanceof Error ? e.message : 'não consegui ler o número';
      }

      /* O perfil é o que o cliente lê quando toca no nome da conversa. */
      let perfil: unknown = null;
      try {
        const pf = await lerPerfil(ycloud);
        perfil = {
          descricao: pf.description ?? null,
          sobre: pf.about ?? null,
          endereco: pf.address ?? null,
          email: pf.email ?? null,
          sites: pf.websites ?? [],
          foto: pf.profilePictureUrl ?? null,
          categoria: pf.vertical ?? null,
        };
      } catch { /* perfil é extra: falhar aqui não esconde o resto */ }

      /* Falhar aqui não pode esconder os templates: o endereço de entrega
         é outra pergunta, e a resposta "não sei" é melhor que a tela
         inteira em branco. */
      let webhooks: unknown = null;
      let erroWebhooks: string | null = null;
      try {
        webhooks = (await listarWebhooks(ycloud)).map((w) => ({
          id: w.id, url: w.url, situacao: w.status, eventos: w.enabledEvents ?? [],
        }));
      } catch (e) {
        erroWebhooks = e instanceof Error ? e.message : 'não consegui ler os webhooks';
      }

      /* Endpoint na YCloud e segredo aqui são metades da mesma coisa: com
         o endpoint sozinho, o evento chega e é descartado por não ter como
         validar a assinatura. A tela precisa das duas para dizer a
         verdade. O segredo em si nunca sai — só se ele existe. */
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: wh } = await db.from('wa_webhook')
        .select('endpoint_id, url, eventos, segredo').eq('provedor', 'ycloud').maybeSingle();
      const listados = Array.isArray(webhooks) ? webhooks as Array<{ id: string }> : [];

      return json(200, {
        ok: true,
        provedor: 'ycloud',
        conta: ycloud.waba,
        numero_ycloud: ycloud.numero,
        numero,
        perfil,
        erro_numero: erroNumero,
        entrega: {
          endpoint_id: wh?.endpoint_id ?? null,
          url: wh?.url ?? null,
          eventos: wh?.eventos ?? [],
          segredo_guardado: !!wh?.segredo,
          combinando: !!wh?.endpoint_id && listados.some((w) => w.id === wh.endpoint_id),
        },
        total: lista.length,
        por_status: porStatus,
        templates: lista.map((t) => ({ nome: t.name, status: t.status, idioma: t.language })),
        webhooks,
        erro_webhooks: erroWebhooks,
      });
    } catch (e) {
      return json(502, {
        ok: false, provedor: 'ycloud', conta: ycloud.waba,
        erro: e instanceof Error ? e.message : 'falha ao falar com a YCloud',
      });
    }
  }

  const token = Deno.env.get('META_WABA_TOKEN');
  if (!token) {
    return json(500, {
      error: 'Nenhum provedor de WhatsApp configurado.',
      falta_na_ycloud: faltaNaYCloud(),
    });
  }
  if (!WABA) return json(500, { error: 'META_WABA_ID não configurada.' });

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${WABA}/message_templates?fields=name,status,category,language,rejected_reason,components&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const dados = await res.json();
    if (!res.ok) {
      // O erro da Meta é a informação útil aqui: diz se é token inválido,
      // permissão faltando ou ativo errado.
      return json(502, { ok: false, erro_meta: dados?.error ?? dados });
    }

    /* Tipado: com Record<string, unknown> cada `t.name` é `unknown`, e o
       arquivo não passava no `deno check`. */
    type TemplateDaMeta = {
      name: string; status: string; category?: string;
      language?: string; rejected_reason?: string;
    };
    const lista = (dados?.data ?? []) as Array<TemplateDaMeta & Record<string, unknown>>;

    /* Com ?template=<nome>, devolve o conteúdo daquele template em vez do
       resumo. O corpo aprovado vive só na Meta — não está em migration nem
       em código — e responder "como está o template?" exigia abrir o painel
       da Meta e ler à mão. */
    const url = new URL(req.url);
    const pedido = url.searchParams.get('template');
    if (pedido) {
      const achado = lista.find((t) => t.name === pedido);
      if (!achado) {
        return json(404, { erro: `template "${pedido}" não existe`, disponiveis: lista.map((t) => t.name) });
      }
      return json(200, { template: achado });
    }
    const porStatus: Record<string, number> = {};
    for (const t of lista) porStatus[t.status] = (porStatus[t.status] ?? 0) + 1;

    /* O número em si, não só os templates. Listar template prova que o
       token lê a conta; não prova que ele ENVIA. É a diferença que separou
       "recebe mas não responde" de "token errado" quando o envio quebrou. */
    const numeroId = Deno.env.get('WA_PHONE_NUMBER_ID');
    let numero: unknown = { motivo: 'WA_PHONE_NUMBER_ID ausente' };
    if (numeroId) {
      const campos = [
        'display_phone_number', 'verified_name', 'quality_rating', 'platform_type',
        'throughput', 'name_status', 'code_verification_status', 'status',
        'messaging_limit_tier', 'is_official_business_account', 'is_pin_enabled',
      ].join(',');
      const rn = await fetch(
        `https://graph.facebook.com/v21.0/${numeroId}?fields=${campos}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const dn = await rn.json().catch(() => null);
      numero = rn.ok
        ? { alcancavel: true, telefone: dn?.display_phone_number, nome: dn?.verified_name,
            qualidade: dn?.quality_rating, plataforma: dn?.platform_type,
            /* Os quatro que decidem o selo verde. `name_status` precisa estar
               APPROVED, e `is_official_business_account` é o selo em si. */
            nome_status: dn?.name_status, verificacao_codigo: dn?.code_verification_status,
            situacao: dn?.status, limite_mensagens: dn?.messaging_limit_tier,
            selo_oficial: dn?.is_official_business_account ?? false,
            bruto: dn }
        : { alcancavel: false, erro: dn?.error?.message, codigo: dn?.error?.code };
    }

    /* A conta e a empresa. O selo depende de verificação de negócio
       concluída e da revisão da conta — nenhuma das duas fica no número. */
    const rw = await fetch(
      `https://graph.facebook.com/v21.0/${WABA}?fields=id,name,account_review_status,business_verification_status,country,ownership_type,timezone_id`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const dw = await rw.json().catch(() => null);

    return json(200, {
      ok: true,
      token: 'válido',
      numero,
      conta_waba: rw.ok
        ? { nome: dw?.name, revisao_da_conta: dw?.account_review_status,
            verificacao_do_negocio: dw?.business_verification_status,
            pais: dw?.country, propriedade: dw?.ownership_type }
        : { erro: dw?.error?.message },
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
