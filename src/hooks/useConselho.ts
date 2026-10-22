import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Leitura } from '@/lib/conselho';

/**
 * O conselho, do banco para a tela. As tabelas conselho_* não estão nos
 * tipos gerados do Supabase (nasceram depois), daí o `from as any`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = (nome: string) => (supabase.from as any)(nome);

export interface Reuniao {
  id: string;
  tipo: 'semanal' | 'extraordinaria' | 'pergunta';
  titulo: string;
  gatilho: string | null;
  pauta: string[];
  status: string;
  conclusao: string | null;
  ata: string | null;
  participantes: string[];
  pergunta_id: string | null;
  iniciada_em: string | null;
  concluida_em: string | null;
  criado_em: string;
}

export interface Fala {
  id: string; reuniao_id: string; ordem: number; rodada: string;
  diretor: string; nome: string; cargo: string | null; texto: string;
  em_resposta_a: string | null;
}

export interface Decisao {
  id: string; reuniao_id: string | null; titulo: string; descricao: string | null;
  responsavel: string | null; prazo: string | null; alcada: 'ceo' | 'dono'; status: string;
  recomendacao_ceo: string | null; divergencias: string | null; comentario_dono: string | null;
  decidido_em: string | null; criado_em: string;
}

export interface Experimento {
  id: string; decisao_id: string | null; hipotese: string; metrica: string;
  descricao_metrica: string | null; linha_base: number | null; meta: number | null;
  inicio: string; revisar_em: string; status: string; leituras: Leitura[]; conclusao: string | null;
}

export interface Pergunta {
  id: string; pergunta: string; diretores: string[]; status: string;
  reuniao_id: string | null; criado_em: string; respondida_em: string | null;
}

export function useReunioes() {
  return useQuery({
    queryKey: ['conselho', 'reunioes'],
    queryFn: async (): Promise<Reuniao[]> => {
      const { data, error } = await tabela('conselho_reunioes')
        .select('id,tipo,titulo,gatilho,pauta,status,conclusao,ata,participantes,pergunta_id,iniciada_em,concluida_em,criado_em')
        .order('criado_em', { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFalas(reuniaoId: string | null | undefined) {
  return useQuery({
    queryKey: ['conselho', 'falas', reuniaoId],
    enabled: !!reuniaoId,
    queryFn: async (): Promise<Fala[]> => {
      const { data, error } = await tabela('conselho_falas').select('*').eq('reuniao_id', reuniaoId).order('ordem');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDecisoes() {
  return useQuery({
    queryKey: ['conselho', 'decisoes'],
    queryFn: async (): Promise<Decisao[]> => {
      const { data, error } = await tabela('conselho_decisoes').select('*').order('criado_em', { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useExperimentos() {
  return useQuery({
    queryKey: ['conselho', 'experimentos'],
    queryFn: async (): Promise<Experimento[]> => {
      const { data, error } = await tabela('conselho_experimentos').select('*').order('inicio', { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePerguntas() {
  return useQuery({
    queryKey: ['conselho', 'perguntas'],
    queryFn: async (): Promise<Pergunta[]> => {
      const { data, error } = await tabela('conselho_perguntas').select('*').order('criado_em', { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePerguntar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { pergunta: string; diretores: string[]; feita_por: string | null }) => {
      const { error } = await tabela('conselho_perguntas').insert({
        pergunta: v.pergunta.trim(), diretores: v.diretores, feita_por: v.feita_por,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conselho', 'perguntas'] }),
  });
}

export function useCancelarPergunta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabela('conselho_perguntas').update({ status: 'cancelada' }).eq('id', id).eq('status', 'aguardando');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conselho', 'perguntas'] }),
  });
}

/** A palavra final do dono sobre uma decisão do conselho. */
export function useDecidir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: 'aprovada' | 'vetada'; comentario: string; membroId: string | null }) => {
      const { error } = await tabela('conselho_decisoes').update({
        status: v.status,
        comentario_dono: v.comentario.trim() || null,
        decidido_por: v.membroId,
        decidido_em: new Date().toISOString(),
      }).eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conselho', 'decisoes'] }),
  });
}
