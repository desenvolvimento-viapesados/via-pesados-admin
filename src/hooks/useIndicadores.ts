import { useMemo } from 'react';
import {
  useCrmCounts, useClients, usePayments, useTickets, useMeetings, useFinTransactions, useTeam, brl,
} from '@/hooks/useAdmin';
import { useInstancias } from '@/hooks/useWhatsApp';

/* O número que cada cartão de seção mostra (lib/secoes.ts, `indicador`).
   Só consultas que o painel já faz e que leem o banco do PAINEL — nenhuma
   leitura do sistema dos clientes, que passaria pela ponte e seria
   registrada no log da LGPD a cada abertura da Home. */

export interface Indicador {
  /** O número em destaque, já formatado. */
  valor: string;
  /** O que o número é, em poucas palavras. */
  rotulo: string;
  /** Pede atenção (aparece em vermelho/âmbar). */
  alerta?: boolean;
}

const hojeISO = () => new Date().toISOString().slice(0, 10);

export function useIndicadores(): Record<string, Indicador> {
  const crm = useCrmCounts();
  const { data: clientes = [] } = useClients();
  const { data: pagamentos = [] } = usePayments();
  const { data: chamados = [] } = useTickets();
  const { data: reunioes = [] } = useMeetings();
  const { data: lancamentos = [] } = useFinTransactions();
  const { data: equipe = [] } = useTeam();
  const { data: numeros = [] } = useInstancias();

  return useMemo(() => {
    const hoje = hojeISO();
    const agora = Date.now();

    const naCarteira = clientes.filter((c) => c.status !== 'cancelado');
    const implantando = clientes.filter((c) => c.status === 'onboarding').length;

    /* Atraso como a tela de Pagamentos calcula: pendente com vencimento
       que já passou também é atraso, mesmo antes do webhook marcar. */
    const atrasados = pagamentos.filter(
      (p) => p.status === 'atrasado' || (p.status === 'pendente' && p.due_date < hoje),
    );
    const valorAtrasado = atrasados.reduce((s, p) => s + (p.amount ?? 0), 0);

    const aReceber = pagamentos
      .filter((p) => p.status === 'pendente' && p.due_date >= hoje)
      .reduce((s, p) => s + (p.amount ?? 0), 0);

    const abertos = chamados.filter((t) => t.status !== 'resolvido').length;

    const proximas = reunioes.filter(
      (m) => m.status === 'agendada' && new Date(m.scheduled_at).getTime() >= agora - 60 * 60 * 1000,
    ).length;

    const vencidos = lancamentos.filter(
      (l) => l.status === 'atrasado' || (l.status === 'pendente' && l.due_date < hoje),
    ).length;

    const conectados = numeros.filter((n) => n.origem === 'cloud_api' || n.connection_state === 'open').length;
    const ativos = equipe.filter((m) => m.is_active !== false).length;

    return {
      funil: { valor: `${crm.funil}`, rotulo: crm.pipeline > 0 ? `prospects · ${brl(crm.pipeline)}/mês` : 'prospects no funil' },
      reunioes: { valor: `${proximas}`, rotulo: proximas === 1 ? 'reunião marcada' : 'reuniões marcadas' },
      amostras: { valor: `${crm.amostras}`, rotulo: crm.amostras === 1 ? 'amostra em uso' : 'amostras em uso' },
      numeros: {
        valor: `${conectados}/${numeros.length}`,
        rotulo: 'números conectados',
        alerta: numeros.length > 0 && conectados < numeros.length,
      },
      clientes: { valor: `${naCarteira.length}`, rotulo: naCarteira.length === 1 ? 'cliente na carteira' : 'clientes na carteira' },
      implantacao: { valor: `${crm.conexao}`, rotulo: 'em implantação', alerta: false },
      implantando: { valor: `${implantando}`, rotulo: 'implantando' },
      atraso: {
        valor: valorAtrasado > 0 ? brl(valorAtrasado) : 'Em dia',
        rotulo: valorAtrasado > 0 ? `em atraso · ${atrasados.length} ${atrasados.length === 1 ? 'fatura' : 'faturas'}` : 'nenhuma fatura atrasada',
        alerta: valorAtrasado > 0,
      },
      receber: { valor: brl(aReceber), rotulo: 'a receber' },
      caixa: {
        valor: `${vencidos}`,
        rotulo: vencidos === 1 ? 'lançamento vencido' : 'lançamentos vencidos',
        alerta: vencidos > 0,
      },
      chamados: { valor: `${abertos}`, rotulo: abertos === 1 ? 'chamado aberto' : 'chamados abertos', alerta: abertos > 0 },
      equipe: { valor: `${ativos}`, rotulo: ativos === 1 ? 'pessoa com acesso' : 'pessoas com acesso' },
    };
  }, [crm, clientes, pagamentos, chamados, reunioes, lancamentos, equipe, numeros]);
}
