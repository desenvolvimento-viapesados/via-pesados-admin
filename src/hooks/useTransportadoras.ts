import { useQuery } from '@tanstack/react-query';
import { supabase, TRANSPORTES_FUNCTIONS_URL } from '@/integrations/supabase/client';
import type { Client } from '@/hooks/useAdmin';

/**
 * O sistema das transportadoras mora em outro projeto (viapesados-transportes).
 * As funções de lá conferem, no projeto do painel, que quem chama é membro
 * ativo da equipe — por isso vai o token da sessão do painel.
 *
 * O que atravessa é o mesmo combinado do lojista: números do negócio e quem
 * usa a conta. Cliente da transportadora, motorista pelo nome, rota e frete
 * de cada viagem ficam lá.
 */

export type PessoaDaTransportadora = {
  nome: string | null;
  email: string;
  papel: 'dono' | 'operacao' | 'financeiro' | 'motorista';
  ultimo_acesso: string | null;
  /** Quando definiu a senha pelo link — o primeiro acesso de verdade. */
  definiu_senha_em: string | null;
};

export type FichaTransportadora = {
  nome: string;
  ativo: boolean;
  bloqueada_em: string | null;
  criada_em: string;
  certificado_ok: boolean;
  certificado_validade: string | null;
  ambiente_fiscal?: 'homologacao' | 'producao';
  pessoas: PessoaDaTransportadora[];
  ultimo_acesso: string | null;
  primeiro_acesso: string | null;
  veiculos: number;
  /** Os que puxam carga: é o que a mensalidade por caminhão conta. */
  caminhoes: number;
  motoristas: number;
  clientes: number;
  viagens: number;
  viagens_30d: number;
  primeira_viagem_em: string | null;
  ultima_viagem_em: string | null;
  frete_30d: number;
  documentos_30d: number;
};

async function chamar<T>(funcao: string, corpo: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada');
  const res = await fetch(`${TRANSPORTES_FUNCTIONS_URL}/${funcao}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(corpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'O sistema das transportadoras não respondeu');
  return data as T;
}

/** A ficha de uma transportadora, lida ao abrir a tela do cliente. */
export const useFichaTransportadora = (client: Pick<Client, 'id' | 'company_name' | 'transportes_empresa_id'> | null | undefined) =>
  useQuery({
    queryKey: ['ficha-transportadora', client?.transportes_empresa_id],
    enabled: !!client?.transportes_empresa_id,
    staleTime: 60_000,
    queryFn: async () => (await chamar<{ ficha: FichaTransportadora }>('client-usage-metrics', {
      empresa_id: client!.transportes_empresa_id,
      client_id: client!.id,
      client_name: client!.company_name,
      purpose: 'ficha do cliente',
    })).ficha,
  });

/** A carteira inteira numa chamada — a lista de clientes e a implantação. */
export const useCarteiraTransportadoras = (empresaIds: string[]) =>
  useQuery({
    queryKey: ['carteira-transportadoras', [...empresaIds].sort().join(',')],
    enabled: empresaIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => (await chamar<{ carteira: Record<string, FichaTransportadora> }>('client-usage-metrics', {
      empresa_ids: empresaIds,
      purpose: 'visão de empresa',
    })).carteira,
  });

export type LinkDeAcesso = { token: string; url: string };

/** Cria a transportadora, a conta do dono e o link de primeiro acesso (24h). */
export const criarSistemaTransportadora = (input: {
  nome: string;
  nome_fantasia?: string;
  cnpj?: string;
  uf?: string;
  cidade?: string;
  whatsapp?: string;
  admin_email: string;
  admin_full_name?: string;
}) => chamar<{ empresa_id: string; admin_email: string } & LinkDeAcesso>('admin-provision', { action: 'create_company', ...input });

/** Um link novo de acesso (vale 24h, uso único) para quem já é da transportadora. */
export const gerarLinkDeAcesso = (input: {
  empresa_id: string;
  admin_email: string;
  admin_full_name?: string;
  motivo?: 'convite' | 'redefinir';
}) => chamar<LinkDeAcesso>('admin-provision', { action: 'criar_convite', ...input });

/** Bloqueia ou libera pela mensalidade: bloqueada, a transportadora vê o aviso no lugar das telas. */
export const bloquearTransportadora = (empresa_id: string, bloquear: boolean, motivo?: string) =>
  chamar<{ bloqueada: boolean }>('admin-provision', { action: 'licenca', empresa_id, bloquear, motivo });

/** Teste ou de verdade: em produção, o CT-e e o MDF-e da transportadora passam a valer. */
export const mudarAmbienteFiscal = (empresa_id: string, ambiente: 'homologacao' | 'producao') =>
  chamar<{ ambiente: string }>('admin-provision', { action: 'ambiente_fiscal', empresa_id, ambiente });

/** Desliga (ninguém da transportadora entra) ou religa. */
export const desligarTransportadora = (empresa_id: string, desligar: boolean) =>
  chamar<{ success: boolean }>('admin-provision', {
    action: desligar ? 'deactivate_company' : 'reactivate_company', empresa_id,
  });
