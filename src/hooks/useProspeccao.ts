import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, FUNCTIONS_URL } from '@/integrations/supabase/client';

/**
 * Dados da aba Prospecção: o painel do agente (via função, que sabe se as
 * chaves estão cadastradas e se o número está conectado) e a fila de lojas
 * (direto da tabela).
 */

export type StatusLoja =
  | 'nova' | 'pronta' | 'sem_whatsapp' | 'ja_conhecida' | 'em_contato' | 'sem_resposta'
  | 'conversando' | 'com_voce' | 'sem_interesse' | 'descartada';

export type LojaProspeccao = {
  id: string; nome: string; cidade: string | null; uf: string | null; telefone: string;
  site: string | null; dados: { nota?: number | null; avaliacoes?: number; mapa?: string | null };
  status: StatusLoja; contatos: number; proximo_contato_em: string | null; ultimo_contato_em: string | null;
  respondeu_em: string | null; conversa_id: string | null; motivo: string | null; humano_assumiu: boolean;
  criada_em: string;
};

export type EstadoProspeccao = {
  config: {
    ligado: boolean; ligado_desde: string | null; instancia_id: string | null; limite_dia: number;
    agente_responde: boolean; pausado_motivo: string | null; proximo_envio_em: string | null;
  } | null;
  numeros: { id: string; nome: string; telefone: string | null; connection_state: string | null }[];
  contagens: Record<StatusLoja, number>;
  hoje: number; respostas_hoje: number; teto: number; horario_de_envio: boolean;
  numero_ok: boolean; numero_motivo: string | null; google: boolean; ia: boolean;
};

export async function chamarProspeccao<T = Record<string, unknown>>(acao: string, corpo: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${FUNCTIONS_URL}/prospeccao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify({ acao, ...corpo }),
  });
  const bruto = await r.text();
  let d: Record<string, unknown> | null = null;
  try { d = bruto ? JSON.parse(bruto) : null; } catch { /* corpo não-JSON */ }
  if (!r.ok) {
    throw new Error((d?.error as string) || (r.status >= 500
      ? 'O servidor demorou demais para responder. Tente de novo em alguns segundos.'
      : `Falhou (${r.status})`));
  }
  return (d ?? {}) as T;
}

export const useEstadoProspeccao = () =>
  useQuery({
    queryKey: ['prospeccao', 'estado'],
    queryFn: () => chamarProspeccao<EstadoProspeccao>('estado'),
    refetchInterval: 60_000,
  });

export const useLojas = (status: StatusLoja[]) =>
  useQuery({
    queryKey: ['prospeccao', 'lojas', status.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase.from('prospeccao_lojas').select('*')
        .in('status', status)
        .order('atualizada_em', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as LojaProspeccao[];
    },
    refetchInterval: 60_000,
  });

export const useAcaoProspeccao = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ acao, ...corpo }: { acao: string } & Record<string, unknown>) => chamarProspeccao(acao, corpo),
    onSuccess: (_d, v) => {
      if (v.acao !== 'previa') qc.invalidateQueries({ queryKey: ['prospeccao'] });
    },
  });
};
