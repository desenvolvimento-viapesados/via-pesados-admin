import type { Client, FinTransaction, Payment } from '@/hooks/useAdmin';
import { mrrDaCarteira } from './mrr';
import { inadimplentes } from './inadimplencia';
import type { Frente } from './frente';

/* A visão da Empresa: as duas frentes juntas, contadas com as mesmas contas
   das telas de cada uma. Nada aqui é definição nova — é soma. */

type FrenteDeCliente = Exclude<Frente, 'empresa'>;

/* A data em que o dinheiro andou — a mesma régua do Financeiro (caixa). */
const dataDoEvento = (t: FinTransaction) => t.payment_date ?? t.due_date;

export type ResumoDaFrente = {
  mrr: number;
  aguardando: number;
  pagando: number;
  implantando: number;
  devendo: number;
};

/**
 * Os números de uma frente, contados com as mesmas contas das telas dela:
 * MRR por `mrrDaCarteira` (a única conta de MRR) e quem deve por
 * `inadimplentes`. A Empresa não inventa definição própria — ela soma.
 */
export function resumoDaFrente(frente: FrenteDeCliente, clientes: Client[], pagamentos: Payment[], hoje: string): ResumoDaFrente {
  const c = clientes.filter((x) => (x.frente ?? 'lojista') === frente);
  const p = pagamentos.filter((x) => (x.frente ?? 'lojista') === frente);
  const m = mrrDaCarteira(c, p);
  return {
    mrr: m.mrr,
    aguardando: m.aguardando,
    pagando: m.contas,
    implantando: c.filter((x) => x.status === 'onboarding').length,
    devendo: inadimplentes(p, c, [], hoje).length,
  };
}

export type CaixaDoMes = { entrou: number; saiu: number; saldo: number };

/** O caixa do mês por frente, com os custos gerais da empresa à parte. */
export function caixaPorFrente(transacoes: FinTransaction[], mes: string): Record<Frente, CaixaDoMes> {
  const vazio = (): CaixaDoMes => ({ entrou: 0, saiu: 0, saldo: 0 });
  const r: Record<Frente, CaixaDoMes> = { lojista: vazio(), transportadora: vazio(), empresa: vazio() };
  for (const t of transacoes) {
    if (t.status !== 'pago' || dataDoEvento(t).slice(0, 7) !== mes) continue;
    const linha = r[t.frente ?? 'lojista'];
    if (t.type === 'receita') linha.entrou += Number(t.amount);
    else linha.saiu += Number(t.amount);
  }
  for (const l of Object.values(r)) l.saldo = l.entrou - l.saiu;
  return r;
}

