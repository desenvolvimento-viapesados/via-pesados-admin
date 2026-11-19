import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LigacaoFeita, ResultadoLigacao, QuemAtendeu, Dor } from '@/lib/ligacoes';

/** Uma loja da lista do dia (função ligacoes_do_dia no banco). */
export type LojaParaLigar = {
  loja_id: string; nome: string; cidade: string | null; uf: string | null; telefone: string; status: string;
  dados: { tipo?: string; vendedor_mensagem?: string; nome_mensagem?: string; outros_celulares?: string[] } | null;
  ligacoes: number; ultima_ligacao_em: string | null; proxima_ligacao_em: string | null;
  dor: string | null; dor_frase: string | null; quem_atende: string | null; conversa_id: string | null;
  prioridade: number; motivo_da_vez: string | null; ligada_hoje: boolean; resultado_hoje: ResultadoLigacao | null;
};

const rpc = supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export const useLigacoesDoDia = () =>
  useQuery({
    queryKey: ['ligacoes', 'dia'],
    queryFn: async () => {
      const { data, error } = await rpc('ligacoes_do_dia', {});
      if (error) throw new Error(error.message);
      return (data ?? []) as LojaParaLigar[];
    },
    refetchInterval: 120_000,
  });

/** As ligações desde uma data (placar do dia e da semana). */
export const useLigacoesDesde = (desde: Date) =>
  useQuery({
    queryKey: ['ligacoes', 'desde', desde.toISOString().slice(0, 13)],
    queryFn: async () => {
      const { data, error } = await (supabase.from as unknown as (t: string) => any)('prospeccao_ligacoes')
        .select('resultado, quem_atendeu, feita_em')
        .gte('feita_em', desde.toISOString())
        .order('feita_em', { ascending: false })
        .limit(2000);
      if (error) throw new Error(error.message);
      return (data ?? []) as LigacaoFeita[];
    },
    refetchInterval: 120_000,
  });

export const useMetaDeLigacoes = () =>
  useQuery({
    queryKey: ['ligacoes', 'meta'],
    queryFn: async () => {
      const { data, error } = await (supabase.from as unknown as (t: string) => any)('prospeccao_config')
        .select('meta_ligacoes_dia').eq('id', 1).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.meta_ligacoes_dia as number | undefined) ?? 20;
    },
  });

export const useSalvarMeta = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meta: number) => {
      const { error } = await (supabase.from as unknown as (t: string) => any)('prospeccao_config')
        .update({ meta_ligacoes_dia: meta }).eq('id', 1);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ligacoes'] }),
  });
};

export type RegistroDeLigacao = {
  loja_id: string; resultado: ResultadoLigacao; quem_atendeu?: QuemAtendeu | null; dor?: Dor | null;
  dor_frase?: string; estoque?: number | null; decisor?: string; retornar_em?: string | null;
  reuniao_em?: string | null; motivo?: string; notas?: string;
};

export const useRegistrarLigacao = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: RegistroDeLigacao) => {
      const { error } = await rpc('registrar_ligacao', {
        _loja_id: r.loja_id, _resultado: r.resultado, _quem_atendeu: r.quem_atendeu ?? null, _dor: r.dor ?? null,
        _dor_frase: r.dor_frase ?? null, _estoque: r.estoque ?? null, _decisor: r.decisor ?? null,
        _retornar_em: r.retornar_em ?? null, _reuniao_em: r.reuniao_em ?? null, _motivo: r.motivo ?? null,
        _notas: r.notas ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ligacoes'] });
      qc.invalidateQueries({ queryKey: ['prospeccao'] });
      qc.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
};
