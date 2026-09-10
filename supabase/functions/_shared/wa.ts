/**
 * Disparo de template pelo número oficial da Via Pesados.
 *
 * TRÊS REGRAS QUE MOLDAM ESTE ARQUIVO:
 *
 *  1. Falha de WhatsApp NUNCA derruba quem chamou. O webhook do Asaas
 *     precisa responder 200 mesmo que o disparo quebre — se responder erro,
 *     o Asaas reenvia e, depois de muitas falhas, para a fila da conta.
 *     Por isso tudo aqui devolve um resultado; nada lança.
 *
 *  2. O Asaas entrega "pelo menos uma vez". O mesmo PAYMENT_CREATED chega
 *     repetido, e sem trava o lojista recebe a mesma cobrança duas vezes —
 *     que é justamente o que derruba a qualidade de um número novo. A trava
 *     é a tabela `wa_envios`, com unique em (template, chave).
 *
 *  3. Sem META_WABA_TOKEN a função fica INERTE de propósito, registrando o
 *     que teria mandado. É o que permite os gatilhos irem para produção
 *     antes do token existir, sem disparar nada por engano.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

export type Resultado =
  | { ok: true; message_id: string }
  | { ok: false; motivo: string; inerte?: boolean; repetido?: boolean };

/** Componente de corpo/cabeçalho: lista de textos, na ordem das variáveis. */
export type Params = {
  header?: string[];
  /* Cabeçalho de DOCUMENTO. O link precisa ser público: quem baixa o
     arquivo é a Meta, não o lojista — um PDF atrás de login chega como
     falha de mídia, não como mensagem sem anexo. */
  documento?: { link: string; filename: string };
  body?: string[];
  urlSuffix?: string;
};

/**
 * E.164 sem "+". O cadastro guarda com máscara, e a Graph API recusa
 * qualquer coisa que não seja dígito. DDI 55 entra quando falta.
 */
export function paraE164(bruto: string | null | undefined): string | null {
  const d = String(bruto ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;             // nem DDD tem: não dá para adivinhar
  if (d.startsWith('55') && d.length >= 12) return d;
  return `55${d}`;
}

/** Mês por extenso, como as amostras aprovadas ("outubro"). */
const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

/** Datas do Asaas vêm como 'YYYY-MM-DD'. Nada de new Date(s) — fuso vira véspera. */
export function mesDe(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso ?? ''));
  return m ? MESES[Number(m[2]) - 1] ?? '' : '';
}
export function dataBR(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
export function diaMes(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}` : '';
}
/** Mesmo dia do mês seguinte, sem depender de Date. Dia 31 cai no fim do mês. */
export function proximoMes(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return '';
  let ano = Number(m[1]), mes = Number(m[2]) + 1;
  if (mes > 12) { mes = 1; ano += 1; }
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(Number(m[3]), ultimo);
  return `${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${ano}`;
}
export const brl = (v: number) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** Primeiro nome — as amostras aprovadas usam só ele. */
export const primeiroNome = (n: string | null | undefined) =>
  String(n ?? '').trim().split(/\s+/)[0] || '';

function textos(vals: string[]) {
  return vals.map((t) => ({ type: 'text', text: String(t ?? '') }));
}

/**
 * Manda um template. `chave` é o que impede o disparo repetido — use algo
 * estável do evento (o asaas_payment_id, o id da reunião), nunca a hora.
 */
export async function enviarTemplate(
  db: { from: (t: string) => any },
  args: { para: string | null; template: string; params?: Params; chave: string; client_id?: string | null },
): Promise<Resultado> {
  const token = Deno.env.get('META_WABA_TOKEN');
  const numeroId = Deno.env.get('WA_PHONE_NUMBER_ID');

  const para = paraE164(args.para);
  if (!para) return { ok: false, motivo: 'cliente sem WhatsApp utilizável' };

  /* Sem token, sai ANTES de gravar. Gravar aqui queimaria a trava: o evento
     ficaria marcado como disparado e, quando o token finalmente chegasse, a
     cobrança daquele mês nunca sairia. Modo inerte tem de ser inerte também
     no banco. */
  if (!token || !numeroId) {
    console.log(`[wa inerte] ${args.template} -> ${para}`, JSON.stringify(args.params ?? {}));
    return { ok: false, motivo: 'META_WABA_TOKEN ausente', inerte: true };
  }

  /* Trava de repetição ANTES de falar com a Meta: se o insert conflitar,
     este evento já foi disparado e não se manda de novo. */
  const { error: conflito } = await db.from('wa_envios').insert({
    template: args.template,
    chave: args.chave,
    client_id: args.client_id ?? null,
    destino: para,
  });
  if (conflito) {
    // 23505 = unique_violation. Qualquer outro erro é problema nosso, e aí
    // é melhor não mandar do que mandar sem registro do que foi mandado.
    return { ok: false, motivo: conflito.code === '23505' ? 'já enviado' : String(conflito.message), repetido: conflito.code === '23505' };
  }

  const componentes: unknown[] = [];
  if (args.params?.documento) {
    componentes.push({
      type: 'header',
      parameters: [{ type: 'document', document: args.params.documento }],
    });
  } else if (args.params?.header?.length) {
    componentes.push({ type: 'header', parameters: textos(args.params.header) });
  }
  if (args.params?.body?.length) {
    componentes.push({ type: 'body', parameters: textos(args.params.body) });
  }
  if (args.params?.urlSuffix) {
    // Botão de URL dinâmica: o índice é a posição do botão, e o único
    // parâmetro é o SUFIXO — a Meta monta o resto a partir do template.
    componentes.push({
      type: 'button', sub_type: 'url', index: '0',
      parameters: [{ type: 'text', text: args.params.urlSuffix }],
    });
  }

  try {
    const res = await fetch(`${GRAPH}/${numeroId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: para,
        type: 'template',
        template: {
          name: args.template,
          language: { code: 'pt_BR' },
          ...(componentes.length ? { components: componentes } : {}),
        },
      }),
    });
    const dados = await res.json().catch(() => null);
    if (!res.ok) {
      const detalhe = dados?.error?.message ?? `Graph respondeu ${res.status}`;
      await db.from('wa_envios').update({ erro: String(detalhe).slice(0, 400) })
        .eq('template', args.template).eq('chave', args.chave);
      return { ok: false, motivo: detalhe };
    }
    const id = dados?.messages?.[0]?.id ?? '';
    await db.from('wa_envios').update({ message_id: id, enviado_em: new Date().toISOString() })
      .eq('template', args.template).eq('chave', args.chave);
    return { ok: true, message_id: id };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : 'falha de rede';
    await db.from('wa_envios').update({ erro: motivo.slice(0, 400) })
      .eq('template', args.template).eq('chave', args.chave);
    return { ok: false, motivo };
  }
}
