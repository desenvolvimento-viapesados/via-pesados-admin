import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClients, useCompaniesHealth, usePayments, useProspects, type Client, type Prospect } from '@/hooks/useAdmin';
import { etapasDoCliente, progresso, type Etapa } from '@/lib/estadoDoCliente';
import {
  fatosDaSaude, proximoPasso, diasDesde, ritmoDaImplantacao, estaImplantando, type Ritmo,
} from '@/lib/implantacao';

/** As tarefas marcadas à mão de todos os clientes — só o treinamento
    depende delas, mas sem isso o passo "Fazer o treinamento" nunca fecha. */
const useTarefasDeTodos = () =>
  useQuery({
    // Debaixo de ['onboarding']: marcar uma tarefa invalida esta lista junto.
    queryKey: ['onboarding', 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('onboarding_tasks').select('client_id, task_key, done');
      if (error) throw error;
      return (data ?? []) as { client_id: string; task_key: string; done: boolean }[];
    },
  });

export type ItemDaImplantacao = {
  cliente: Client;
  etapas: Etapa[];
  passo: ReturnType<typeof proximoPasso>;
  dias: number;
  ritmo: Ritmo;
  feitas: number;
  total: number;
};

/** O sistema do cliente ainda não respondeu sobre esta etapa. */
export const naoSei = (porque: string | undefined) => !!porque?.startsWith('Ainda não li');

/**
 * Tudo o que a seção Implantação mostra, montado dos fatos: cobrança paga,
 * sistema provisionado, o que o sistema do cliente responde (acesso,
 * estoque, canal, anúncio) e o treinamento marcado pela equipe.
 *
 * `lerSistemas: false` é para a Home: ela não consulta o sistema dos
 * clientes (cada leitura é uma linha no log da LGPD), então fica só com o
 * que o painel sabe sozinho — contrato, cobrança e sistema criado.
 */
export function useImplantacao({ lerSistemas = true }: { lerSistemas?: boolean } = {}) {
  const { data: clientes = [], isLoading: c1 } = useClients();
  const { data: pagamentos = [], isLoading: c2 } = usePayments();
  const { data: prospects = [] } = useProspects();
  const { data: tarefas = [] } = useTarefasDeTodos();
  const ids = useMemo(
    () => (lerSistemas ? clientes.filter((c) => c.lojista_company_id && c.status !== 'cancelado').map((c) => c.lojista_company_id!) : []),
    [clientes, lerSistemas],
  );
  const saudeQuery = useCompaniesHealth(ids);

  return useMemo(() => {
    const agora = Date.now();
    const saudePorEmpresa = new Map((saudeQuery.data ?? []).map((s) => [s.company_id, s]));
    // A ponte ainda não respondeu (ou falhou): o que depende dela fica "não sei".
    const ponteRespondeu = saudeQuery.isSuccess;

    const itens: ItemDaImplantacao[] = clientes
      .filter((c) => c.status !== 'cancelado' && c.status !== 'pausado')
      .map((c) => {
        const saude = c.lojista_company_id ? saudePorEmpresa.get(c.lojista_company_id) : undefined;
        const etapas = etapasDoCliente(
          {
            lojista_company_id: c.lojista_company_id,
            domain: c.domain,
            contract_signed_at: c.contract_signed_at,
            asaas_payment_link_url: c.asaas_payment_link_url,
            pagou: pagamentos.some((p) => p.client_id === c.id && p.status === 'pago'),
            tarefas: tarefas.filter((t) => t.client_id === c.id),
          },
          // Sem sistema não há o que perguntar: a resposta é "não tem", não "não sei".
          !c.lojista_company_id ? { marcos: {} } : ponteRespondeu ? fatosDaSaude(saude) ?? { marcos: {} } : null,
        );
        const dias = diasDesde(c.created_at, agora);
        const { feitas, total } = progresso(etapas);
        return { cliente: c, etapas, passo: proximoPasso(etapas), dias, ritmo: ritmoDaImplantacao(dias), feitas, total };
      });

    const implantando = itens
      .filter((i) => estaImplantando(i.cliente.status, i.etapas))
      .sort((a, b) => b.dias - a.dias);

    /* No ar e anunciando, mas com etapa em aberto — a assinatura que nunca
       foi registrada, o treinamento que ninguém marcou. Domínio sozinho não
       conta: com o endereço padrão a loja vende igual. */
    const noArComPendencia = itens.filter((i) =>
      !implantando.includes(i)
      && i.cliente.status !== 'onboarding'
      && i.passo !== null
      && i.passo.chave !== 'dominio_conectado'
      && !naoSei(i.passo.porque));

    const convertidos = new Set(clientes.map((c) => c.prospect_id).filter(Boolean));
    const vendasParaRegistrar: Prospect[] = prospects.filter((p) => p.stage === 'vendido' && !convertidos.has(p.id));

    const noArRecentes = clientes
      .filter((c) => c.status === 'ativo' && c.activated_at && diasDesde(c.activated_at, agora) <= 30)
      .sort((a, b) => (b.activated_at ?? '').localeCompare(a.activated_at ?? ''));

    return {
      carregando: c1 || c2,
      lendoSistemas: saudeQuery.isFetching && !saudeQuery.isSuccess,
      ponteFalhou: saudeQuery.isError,
      implantando,
      noArComPendencia,
      vendasParaRegistrar,
      noArRecentes,
      comAGente: implantando.filter((i) => i.passo?.dono === 'nos').length,
      comOCliente: implantando.filter((i) => i.passo?.dono === 'cliente').length,
      atrasados: implantando.filter((i) => i.ritmo === 'atrasado').length,
    };
  }, [clientes, pagamentos, prospects, tarefas, saudeQuery.data, saudeQuery.isSuccess, saudeQuery.isFetching, saudeQuery.isError, c1, c2]);
}
