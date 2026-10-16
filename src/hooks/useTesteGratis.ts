import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fimDoTeste, tarefasDoTeste, as10h, type StatusDoTeste } from '../../supabase/functions/_shared/teste';

/* O teste grátis e as tarefas da agenda. As regras de data são as mesmas
   da rotina diária (supabase/functions/_shared/teste.ts). */

export type TesteGratis = {
  id: string;
  client_id: string;
  owner_id: string | null;
  status: StatusDoTeste;
  inicio: string | null;
  fim: string | null;
  dias_extras: number;
  convertido_em: string | null;
  encerrado_em: string | null;
  motivo: string | null;
  criado_em: string;
};

export type Tarefa = {
  id: string;
  client_id: string | null;
  prospect_id: string | null;
  owner_id: string | null;
  titulo: string;
  detalhe: string | null;
  quando: string;
  origem: 'manual' | 'teste_gratis';
  marco: string | null;
  feito_em: string | null;
  feito_por: string | null;
  resultado: string | null;
  client?: { id: string; company_name: string; contact_name: string | null; whatsapp: string | null } | null;
};

/* As tabelas são novas e ainda não estão nos tipos gerados. */
const tabela = (t: 'testes_gratis' | 'tarefas') => (supabase.from as unknown as (n: string) => ReturnType<typeof supabase.from>)(t);

export const useTestesGratis = () =>
  useQuery({
    queryKey: ['testes-gratis'],
    queryFn: async () => {
      const { data, error } = await tabela('testes_gratis').select('*').order('criado_em', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TesteGratis[];
    },
  });

/** Registrar a venda com teste: a linha nasce esperando a implantação. */
export async function criarTesteGratis(clientId: string, ownerId: string | null, criadoPor: string | null) {
  const { error } = await tabela('testes_gratis').insert({ client_id: clientId, owner_id: ownerId, criado_por: criadoPor } as never);
  if (error) throw error;
}

export const useAtualizarTeste = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TesteGratis> & { id: string }) => {
      const { error } = await tabela('testes_gratis').update({ ...patch, atualizado_em: new Date().toISOString() } as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['testes-gratis'] }),
  });
};

/**
 * Mais dias para o teste. As tarefas por fazer andam junto com o novo fim,
 * e os avisos do fim saem de novo (a chave da rotina leva a data do fim).
 */
export const useProrrogarTeste = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teste, dias }: { teste: TesteGratis; dias: number }) => {
      if (!teste.inicio) throw new Error('O teste ainda não começou: ele conta da implantação.');
      const extras = (teste.dias_extras ?? 0) + dias;
      const fim = fimDoTeste(teste.inicio, extras);
      const { error } = await tabela('testes_gratis')
        .update({ dias_extras: extras, fim, atualizado_em: new Date().toISOString() } as never).eq('id', teste.id);
      if (error) throw error;
      for (const t of tarefasDoTeste(teste.inicio, fim)) {
        await tabela('tarefas').update({ quando: as10h(t.dia) } as never)
          .eq('client_id', teste.client_id).eq('marco', t.marco).is('feito_em', null);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['testes-gratis'] });
      qc.invalidateQueries({ queryKey: ['tarefas'] });
    },
  });
};

export const useTarefas = () =>
  useQuery({
    queryKey: ['tarefas'],
    queryFn: async () => {
      const { data, error } = await tabela('tarefas')
        .select('*, client:clients(id, company_name, contact_name, whatsapp)')
        .order('quando', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Tarefa[];
    },
  });

export const useAtualizarTarefa = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Tarefa> & { id: string }) => {
      const { client: _c, ...row } = patch as Tarefa;
      const { error } = await tabela('tarefas').update(row as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarefas'] }),
  });
};
