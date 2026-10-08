/* Quem deve, quanto, há quanto tempo — e o que já foi avisado.

   Atraso aqui é a mesma conta da tela de Pagamentos: fatura `atrasado`, ou
   `pendente` com vencimento que já passou (o webhook do Asaas pode demorar
   a marcar). Cancelada e paga não entram. */

export interface FaturaDevida {
  id: string;
  client_id: string;
  description: string;
  amount: number;
  due_date: string;
  status: string;
  invoice_url?: string | null;
}

export interface ClienteDevedor {
  id: string;
  company_name: string;
  contact_name?: string | null;
  whatsapp?: string | null;
}

export interface EnvioDeAviso {
  client_id: string | null;
  template: string;
  enviado_em: string | null;
}

/* Os modelos de WhatsApp que falam de cobrança. */
export const AVISOS_DE_COBRANCA = ['cobranca_mensal_disponivel', 'cobranca_vence_amanha', 'cobranca_em_atraso', 'cartao_recusado'];

export const ROTULO_DO_AVISO: Record<string, string> = {
  cobranca_mensal_disponivel: 'fatura do mês disponível',
  cobranca_vence_amanha: 'vence amanhã',
  cobranca_em_atraso: 'em atraso',
  cartao_recusado: 'cartão recusado',
};

export interface LinhaDeInadimplencia {
  cliente: ClienteDevedor;
  faturas: (FaturaDevida & { diasDeAtraso: number })[];
  total: number;
  diasDeAtraso: number;
  ultimoAviso: { template: string; em: string } | null;
}

const dia = 24 * 60 * 60 * 1000;
const diasEntre = (deISO: string, ateISO: string) =>
  Math.max(0, Math.round((Date.parse(`${ateISO}T00:00:00Z`) - Date.parse(`${deISO}T00:00:00Z`)) / dia));

export const estaAtrasada = (f: Pick<FaturaDevida, 'status' | 'due_date'>, hoje: string) =>
  f.status === 'atrasado' || (f.status === 'pendente' && f.due_date < hoje);

/** Devedores, do atraso mais antigo para o mais novo. */
export function inadimplentes(
  faturas: FaturaDevida[],
  clientes: ClienteDevedor[],
  envios: EnvioDeAviso[],
  hoje: string,
): LinhaDeInadimplencia[] {
  const porCliente = new Map<string, LinhaDeInadimplencia>();
  for (const f of faturas) {
    if (!estaAtrasada(f, hoje)) continue;
    const cliente = clientes.find((c) => c.id === f.client_id);
    if (!cliente) continue;
    const linha = porCliente.get(cliente.id) ?? { cliente, faturas: [], total: 0, diasDeAtraso: 0, ultimoAviso: null };
    const diasDeAtraso = diasEntre(f.due_date, hoje);
    linha.faturas.push({ ...f, diasDeAtraso });
    linha.total += Number(f.amount) || 0;
    linha.diasDeAtraso = Math.max(linha.diasDeAtraso, diasDeAtraso);
    porCliente.set(cliente.id, linha);
  }
  for (const linha of porCliente.values()) {
    const ultimo = envios
      .filter((e) => e.client_id === linha.cliente.id && e.enviado_em && AVISOS_DE_COBRANCA.includes(e.template))
      .sort((a, b) => (b.enviado_em! > a.enviado_em! ? 1 : -1))[0];
    linha.ultimoAviso = ultimo ? { template: ultimo.template, em: ultimo.enviado_em! } : null;
    linha.faturas.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  }
  return [...porCliente.values()].sort((a, b) => b.diasDeAtraso - a.diasDeAtraso || b.total - a.total);
}

/** Faturas pendentes que vencem de hoje até `dias` dias. */
export function aVencer(faturas: FaturaDevida[], hoje: string, dias = 7): FaturaDevida[] {
  const limite = new Date(Date.parse(`${hoje}T00:00:00Z`) + dias * dia).toISOString().slice(0, 10);
  return faturas
    .filter((f) => f.status === 'pendente' && f.due_date >= hoje && f.due_date <= limite)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
}

/** Telefone para o wa.me: só dígitos, com 55 quando vier sem DDI. */
export function numeroParaWhatsapp(telefone: string | null | undefined): string | null {
  const d = String(telefone ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}
