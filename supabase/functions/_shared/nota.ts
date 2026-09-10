/**
 * Liga a emissão automática de NFS-e numa assinatura do Asaas.
 *
 * A configuração é POR ASSINATURA, não da conta: sem isto, todo o
 * encanamento de nota fiscal fica pronto e nenhuma nota nasce.
 *
 * DUAS ESCOLHAS QUE VALE ENTENDER:
 *
 *  1. `receivedOnly` — a nota só sai depois que o dinheiro entra. Emitir na
 *     geração da cobrança criaria documento fiscal para venda que pode nunca
 *     acontecer, e desfazer isso exige cancelamento formal na prefeitura,
 *     com prazo curto. Boleto vencido não vira nota.
 *
 *  2. Falhar aqui NUNCA derruba a venda. Quem chamou está no meio de um
 *     checkout com o cartão do lojista na mão; recusar a compra porque a
 *     configuração fiscal não pegou seria trocar um problema contornável
 *     (configurar depois) por um irreversível (perder o cliente).
 */

/* A alíquota efetiva do ISS dentro do Simples Nacional. Vem do ambiente
   porque ela MUDA: depende do anexo e da receita acumulada dos 12 meses.
   Trocar por `supabase secrets set` não exige mexer no código. */
const ISS_PADRAO = 2.17;

/* Sem código de serviço municipal: o município não usa lista de serviços
   (usesServiceListItem: false) e a conta não tem a lista habilitada. O nome
   é o que descreve o serviço na nota — item 1.05 da LC 116. */
const SERVICO = 'Licenciamento ou cessão de direito de uso de programas de computação';

export type ResultadoNota =
  | { ok: true; iss: number; verificado: boolean }
  | { ok: false; motivo: string };

export async function ligarNotaFiscal(
  base: string,
  chave: string,
  subscriptionId: string,
  descricao?: string,
  /* No checkout fica FALSE: a releitura dobraria a latência de uma tela em
     que o lojista está esperando com o cartão na mão. Quem confere é o
     `nota-configurar`, que roda fora da pressa. */
  verificar = false,
): Promise<ResultadoNota> {
  const iss = Number(Deno.env.get('NOTA_ISS_ALIQUOTA') ?? ISS_PADRAO);
  const cab = { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'ViaPesados/1.0' };

  const corpo = {
    municipalServiceName: SERVICO,
    /* Não mexe no valor da cobrança: os impostos do Simples já estão
       embutidos no preço, e somar de novo cobraria o lojista duas vezes. */
    updatePayment: false,
    deductions: 0,
    effectiveDatePeriod: 'ON_PAYMENT_CONFIRMATION',
    receivedOnly: true,
    observations: descricao ?? 'Assinatura mensal do sistema Via Pesados.',
    /* Optante do Simples: ISS, PIS e COFINS já vão no DAS, e por isso os
       federais são zero aqui — repetir na nota cobraria duas vezes.
       `retainIss: false` porque optante do Simples não sofre retenção. */
    taxes: { retainIss: false, iss, cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0 },
  };

  try {
    const r = await fetch(`${base}/subscriptions/${subscriptionId}/invoiceSettings`, {
      method: 'POST', headers: cab, body: JSON.stringify(corpo),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = d?.errors?.[0]?.description ?? d?.message ?? `http ${r.status}`;
      return { ok: false, motivo: String(msg).slice(0, 300) };
    }

    if (!verificar) return { ok: true, iss, verificado: false };

    /* Relê para confirmar que o Asaas GUARDOU, e não só aceitou o POST. É a
       mesma lição do authToken do webhook: aceitar não é guardar. */
    const conf = await fetch(`${base}/subscriptions/${subscriptionId}/invoiceSettings`, { headers: cab });
    const lido = await conf.json().catch(() => null);
    return { ok: true, iss, verificado: conf.ok && lido?.taxes?.iss != null };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'falha de rede' };
  }
}
