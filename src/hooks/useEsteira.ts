import { useMemo } from 'react';
import { useClients, useDemos, usePayments, type Client, type Demo } from '@/hooks/useAdmin';
import { useOportunidades } from '@/hooks/useOportunidades';
import { useTestesGratis } from '@/hooks/useTesteGratis';
import { clientesQuePagaram } from '@/lib/mrr';
import { montarEsteira, type ClienteDaEsteira } from '@/lib/esteira';
import { telefoneCompleto } from '@/lib/oportunidades';

/**
 * A esteira inteira: as oportunidades (antes da venda) e os clientes (depois dela), cada um na
 * sua estação. A aba Esteira e a tela de cada loja leem daqui.
 */
export function useEsteira() {
  const base = useOportunidades();
  const { data: clientes = [], isLoading: lendoClientes } = useClients();
  const { data: pagamentos = [] } = usePayments();
  const { data: testes = [] } = useTestesGratis();
  const { data: demos = [] } = useDemos();

  const amostras = useMemo(() => {
    const m = new Map<string, Demo>();
    for (const d of demos) if (d.prospect_id && d.status !== 'descartada' && !m.has(d.prospect_id)) m.set(d.prospect_id, d);
    return m;
  }, [demos]);

  const daEsteira = useMemo((): ClienteDaEsteira[] => {
    const pagaram = clientesQuePagaram(pagamentos);
    const emTeste = new Set(testes.filter((t) => t.status === 'aguardando_implantacao' || t.status === 'em_teste').map((t) => t.client_id));
    return clientes.map((c: Client) => ({
      id: c.id, prospectId: c.prospect_id, nome: c.company_name, lugar: [c.city, c.state].filter(Boolean).join('/'),
      telefone: telefoneCompleto(c.whatsapp), status: c.status, pagou: pagaram.has(c.id), emTeste: emTeste.has(c.id),
      implantado: !!c.implantado_em, checkoutToken: c.checkout_token, contratoAssinado: !!c.contract_signed_at,
      mensalidade: c.mrr, criadoEm: c.created_at,
    }));
  }, [clientes, pagamentos, testes]);

  const itens = useMemo(
    () => montarEsteira(base.oportunidades, daEsteira, new Set(amostras.keys())),
    [base.oportunidades, daEsteira, amostras],
  );

  return { ...base, itens, amostras, carregando: base.carregando || lendoClientes };
}
