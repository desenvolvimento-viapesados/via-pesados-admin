import type { Client, Payment, Prospect, Meeting, Demo, Ticket, FinTransaction, SaudeDaEmpresa } from '@/hooks/useAdmin';
import { mrrDaCarteira } from '@/lib/mrr';

/**
 * As métricas que o painel já sabe — e que, por isso, um resultado-chave
 * não precisa pedir que alguém digite.
 *
 * É isto que separa um módulo de metas de uma planilha: o KR que se mede
 * sozinho continua certo na semana em que ninguém abriu a tela. O manual
 * fica para o que o sistema não vê — contratar alguém, assinar contrato,
 * passar na análise da Meta.
 *
 * Duas naturezas, e confundi-las é o erro comum:
 *   estoque  quanto existe HOJE (MRR, clientes pagando, veículos no ar).
 *            O período não muda o número.
 *   fluxo    quanto ACONTECEU no período (novos clientes, recebido,
 *            reuniões). Fora do período, não conta.
 */

export type Natureza = 'estoque' | 'fluxo';

export type DefinicaoDeMetrica = {
  rotulo: string;
  unidade: 'numero' | 'moeda' | 'percentual';
  natureza: Natureza;
  /** O que ela mede, em uma frase — aparece ao escolher a fonte do KR. */
  explica: string;
  /** Métrica que melhora quando CAI. */
  menorEMelhor?: boolean;
  /** Precisa da leitura do sistema dos clientes (ponte LGPD). */
  daBase?: boolean;
};

/* `as const satisfies` dá as chaves literais; o `METRICAS` exportado
   recebe o tipo largo, senão quem lê `METRICAS[chave].daBase` esbarra
   nas entradas que não declaram o campo. */
const CATALOGO = {
  mrr: { rotulo: 'MRR', unidade: 'moeda', natureza: 'estoque',
    explica: 'Mensalidade recorrente das contas que já pagaram pelo menos uma fatura.' },
  clientes_pagando: { rotulo: 'Clientes pagando', unidade: 'numero', natureza: 'estoque',
    explica: 'Contas com pelo menos uma fatura paga e sem cancelamento.' },
  clientes_na_carteira: { rotulo: 'Clientes na carteira', unidade: 'numero', natureza: 'estoque',
    explica: 'Tudo que não está cancelado, inclusive quem ainda não pagou.' },
  mrr_a_ativar: { rotulo: 'MRR a ativar', unidade: 'moeda', natureza: 'estoque',
    explica: 'Contrato assinado cuja primeira fatura ainda não caiu.' },
  novos_clientes: { rotulo: 'Novos clientes', unidade: 'numero', natureza: 'fluxo',
    explica: 'Contas ativadas dentro do período.' },
  cancelamentos: { rotulo: 'Cancelamentos', unidade: 'numero', natureza: 'fluxo',
    explica: 'Contas canceladas dentro do período.', menorEMelhor: true },
  pipeline: { rotulo: 'Pipeline', unidade: 'moeda', natureza: 'estoque',
    explica: 'Soma das propostas em aberto no funil.' },
  prospects_novos: { rotulo: 'Prospects novos', unidade: 'numero', natureza: 'fluxo',
    explica: 'Entradas no funil no período.' },
  reunioes: { rotulo: 'Reuniões realizadas', unidade: 'numero', natureza: 'fluxo',
    explica: 'Reuniões marcadas como realizadas no período.' },
  amostras: { rotulo: 'Amostras entregues', unidade: 'numero', natureza: 'fluxo',
    explica: 'Sistemas de demonstração apresentados no período.' },
  recebido: { rotulo: 'Recebido', unidade: 'moeda', natureza: 'fluxo',
    explica: 'Faturas pagas dentro do período.' },
  inadimplencia: { rotulo: 'Inadimplência', unidade: 'moeda', natureza: 'estoque',
    explica: 'Valor vencido e não pago hoje.', menorEMelhor: true },
  caixa_liquido: { rotulo: 'Caixa líquido', unidade: 'moeda', natureza: 'fluxo',
    explica: 'Entradas menos saídas lançadas no período.' },
  tickets_abertos: { rotulo: 'Tickets abertos', unidade: 'numero', natureza: 'estoque',
    explica: 'Chamados de suporte ainda sem resolução.', menorEMelhor: true },
  tickets_resolvidos: { rotulo: 'Tickets resolvidos', unidade: 'numero', natureza: 'fluxo',
    explica: 'Chamados resolvidos no período.' },
  /* As da base instalada: dependem da leitura do sistema de cada cliente,
     que passa pela ponte e fica registrada (art. 37). */
  veiculos_anunciados_base: { rotulo: 'Veículos anunciados na base', unidade: 'numero', natureza: 'estoque',
    explica: 'Caminhões com anúncio no ar somando todos os clientes.', daBase: true },
  veiculos_base: { rotulo: 'Veículos na base', unidade: 'numero', natureza: 'estoque',
    explica: 'Estoque somado de todos os clientes.', daBase: true },
  vendas_base: { rotulo: 'Vendas dos clientes (30d)', unidade: 'numero', natureza: 'estoque',
    explica: 'Caminhões vendidos pelos lojistas nos últimos 30 dias.', daBase: true },
  faturamento_base: { rotulo: 'Faturamento dos clientes (30d)', unidade: 'moeda', natureza: 'estoque',
    explica: 'Quanto a base faturou nos últimos 30 dias.', daBase: true },
  contas_usando: { rotulo: 'Contas usando', unidade: 'numero', natureza: 'estoque',
    explica: 'Clientes que entraram no sistema na última semana.', daBase: true },
} as const satisfies Record<string, DefinicaoDeMetrica>;

export type ChaveMetrica = keyof typeof CATALOGO;
export const METRICAS: Record<ChaveMetrica, DefinicaoDeMetrica> = CATALOGO;
export const CHAVES_DE_METRICA = Object.keys(CATALOGO) as ChaveMetrica[];

export type DadosDasMetricas = {
  clientes: Client[];
  pagamentos: Payment[];
  prospects: Prospect[];
  reunioes: Meeting[];
  demos: Demo[];
  transacoes: FinTransaction[];
  tickets: Ticket[];
  saude: SaudeDaEmpresa[];
};

export type Periodo = { inicio: string; fim: string };

const noPeriodo = (iso: string | null | undefined, p: Periodo) =>
  !!iso && iso.slice(0, 10) >= p.inicio && iso.slice(0, 10) <= p.fim;

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * O valor de agora para uma métrica.
 *
 * `null` quando o dado não chegou — e `null` é diferente de zero: "não
 * consegui ler o sistema do cliente" não é "nenhum veículo anunciado".
 */
export function valorDaMetrica(
  chave: ChaveMetrica, d: DadosDasMetricas, periodo: Periodo,
): number | null {
  const vivos = d.clientes.filter((c) => c.status !== 'cancelado');
  const soma = (l: number[]) => l.reduce((s, n) => s + n, 0);

  switch (chave) {
    case 'mrr': return mrrDaCarteira(d.clientes, d.pagamentos).mrr;
    case 'mrr_a_ativar': return mrrDaCarteira(d.clientes, d.pagamentos).aguardando;
    case 'clientes_pagando': return mrrDaCarteira(d.clientes, d.pagamentos).contas;
    case 'clientes_na_carteira': return vivos.length;

    case 'novos_clientes':
      return d.clientes.filter((c) => noPeriodo(c.activated_at, periodo)).length;
    case 'cancelamentos':
      return d.clientes.filter((c) => noPeriodo(c.canceled_at, periodo)).length;

    case 'pipeline':
      return soma(d.prospects
        .filter((p) => ['contato', 'oportunidade', 'reuniao'].includes(p.stage))
        .map((p) => Number(p.proposal_value ?? 0)));
    case 'prospects_novos':
      return d.prospects.filter((p) => noPeriodo(p.created_at, periodo)).length;
    case 'reunioes':
      return d.reunioes.filter((m) => m.status === 'realizada' && noPeriodo(m.scheduled_at, periodo)).length;
    case 'amostras':
      return d.demos.filter((x) => noPeriodo((x as { presented_at?: string }).presented_at ?? x.created_at, periodo)).length;

    case 'recebido':
      return soma(d.pagamentos
        .filter((p) => p.status === 'pago' && noPeriodo(p.paid_at, periodo))
        .map((p) => Number(p.amount ?? 0)));
    case 'inadimplencia':
      return soma(d.pagamentos
        .filter((p) => (p.status === 'atrasado' || p.status === 'pendente') && p.due_date < hoje())
        .map((p) => Number(p.amount ?? 0)));
    case 'caixa_liquido': {
      /* Caixa é quando o dinheiro ANDA: conta pela data de pagamento, não
         pelo vencimento nem pela competência. Lançamento ainda não pago
         não entrou em caixa nenhum. */
      const dentro = d.transacoes.filter((t) => noPeriodo(t.payment_date, periodo));
      const entra = soma(dentro.filter((t) => t.type === 'receita').map((t) => Number(t.amount ?? 0)));
      const sai = soma(dentro.filter((t) => t.type === 'despesa').map((t) => Number(t.amount ?? 0)));
      return entra - sai;
    }

    case 'tickets_abertos':
      return d.tickets.filter((t) => t.status !== 'resolvido').length;
    case 'tickets_resolvidos':
      return d.tickets.filter((t) => t.status === 'resolvido' && noPeriodo(t.updated_at ?? t.created_at, periodo)).length;

    /* Base instalada: sem leitura, `null`. Zero aqui seria mentira. */
    case 'veiculos_anunciados_base':
      return d.saude.length ? soma(d.saude.map((s) => s.veiculos_anunciados ?? 0)) : null;
    case 'veiculos_base':
      return d.saude.length ? soma(d.saude.map((s) => s.veiculos ?? 0)) : null;
    case 'vendas_base':
      return d.saude.length ? soma(d.saude.map((s) => s.vendas_30d ?? 0)) : null;
    case 'faturamento_base':
      return d.saude.length ? soma(d.saude.map((s) => Number(s.faturamento_30d ?? 0))) : null;
    case 'contas_usando':
      return d.saude.length
        ? d.saude.filter((s) => s.ultimo_acesso_em
            && Date.now() - new Date(s.ultimo_acesso_em).getTime() < 7 * 86_400_000).length
        : null;
    default:
      return null;
  }
}
