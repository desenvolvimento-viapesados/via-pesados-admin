import {
  somarMeses, somarDias, hojeBRT, DIAS_DE_TOLERANCIA, DIAS_ANTES_DA_MENSALIDADE,
} from '../../supabase/functions/_shared/regua';

/* A licença do cliente, lida das mensalidades — a mesma régua que as
   funções usam (supabase/functions/_shared/regua.ts), para a ficha nunca
   dizer uma data e a rotina cortar em outra. */

type Mensalidade = { status: string; due_date: string; amount: number; asaas_subscription_id?: string | null };

export type Licenca = {
  implantadoEm: string | null;
  diaDoVencimento: number | null;
  pagaAte: string | null;
  proxima: { vence: string; valor: number; atrasada: boolean } | null;
  cortaEm: string | null;
  mensagemEm: string | null;
};

export function licencaDoCliente(implantadoEm: string | null, cobrancas: Mensalidade[], hoje = hojeBRT()): Licenca {
  const mensalidades = cobrancas.filter((c) => c.asaas_subscription_id);
  const pagas = mensalidades.filter((c) => c.status === 'pago').length;
  const aberta = mensalidades
    .filter((c) => c.status === 'pendente' || c.status === 'atrasado')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  return {
    implantadoEm,
    diaDoVencimento: implantadoEm ? Number(implantadoEm.slice(8, 10)) : null,
    pagaAte: implantadoEm && pagas ? somarMeses(implantadoEm, pagas) : null,
    proxima: aberta ? { vence: aberta.due_date, valor: Number(aberta.amount), atrasada: aberta.due_date < hoje } : null,
    cortaEm: aberta ? somarDias(aberta.due_date, DIAS_DE_TOLERANCIA) : null,
    mensagemEm: aberta ? somarDias(aberta.due_date, -DIAS_ANTES_DA_MENSALIDADE) : null,
  };
}

export const dataCurta = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
