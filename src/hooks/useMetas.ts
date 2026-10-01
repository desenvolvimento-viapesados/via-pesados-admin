import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cicloDaData, rotuloDoPeriodo } from '@/lib/okr';
import { pedacosDe, sugerirDesdobramento } from '@/lib/cascata';
import { METRICAS, type Natureza } from '@/lib/metricas';
import type { ChaveMetrica } from '@/lib/metricas';

/**
 * As metas, do banco para a tela.
 *
 * O ciclo é criado sob demanda: ninguém devia precisar "abrir o
 * trimestre" antes de escrever o primeiro objetivo — a tela pede o ciclo
 * do período e, se ele não existe, nasce com as datas certas.
 */

export type TipoDeCiclo = 'mes' | 'trimestre' | 'ano' | 'cinco_anos' | 'livre';

export interface Ciclo {
  id: string; tipo: TipoDeCiclo; rotulo: string;
  inicio: string; fim: string; tema: string | null;
}

export interface Objetivo {
  id: string; ciclo_id: string; titulo: string; porque: string | null;
  dono_id: string | null; nivel: 'empresa' | 'time' | 'pessoa';
  pai_id: string | null; status: 'rascunho' | 'ativo' | 'concluido' | 'abandonado';
  ordem: number;
}

export interface KRRow {
  id: string;
  /* A meta pertence ao CICLO. O objetivo é agrupador opcional: existe
     quando se quer OKR de verdade, com um objetivo qualitativo em cima
     de dois a quatro números. */
  ciclo_id: string;
  objetivo_id: string | null;
  titulo: string;
  unidade: 'numero' | 'moeda' | 'percentual' | 'marco';
  partida: number; alvo: number;
  fonte: 'manual' | ChaveMetrica;
  valor_manual: number | null;
  direcao: 'subir' | 'descer'; ordem: number;
  /** A meta do ciclo maior que esta desdobra. */
  pai_id: string | null;
}

export interface Checkin {
  id: string; kr_id: string; valor: number | null;
  confianca: 'alta' | 'media' | 'baixa'; comentario: string | null;
  autor_id: string | null; autor_nome: string | null; created_at: string;
}

export interface NSM {
  metrica: ChaveMetrica; rotulo: string; porque: string | null;
  unidade: 'numero' | 'moeda' | 'percentual'; meta_ano: number | null;
}

/**
 * O ciclo em que se está trabalhando — criado sob demanda.
 *
 * Com `livre`, as datas vêm de fora: "de outubro até dezembro do ano que
 * vem" não é mês, nem trimestre, nem ano, e era justamente a meta que
 * ninguém conseguia escrever aqui.
 */
export const useCiclo = (tipo: TipoDeCiclo, livre?: { inicio: string; fim: string }) =>
  useQuery({
    queryKey: ['metas', 'ciclo', tipo, livre?.inicio ?? '', livre?.fim ?? ''],
    enabled: tipo !== 'livre' || !!(livre?.inicio && livre?.fim),
    queryFn: async (): Promise<Ciclo> => {
      const alvo = tipo === 'livre'
        ? { tipo, rotulo: rotuloDoPeriodo(livre!.inicio, livre!.fim), inicio: livre!.inicio, fim: livre!.fim }
        : cicloDaData(tipo);
      const { data } = await supabase.from('metas_ciclos').select('*')
        .eq('tipo', tipo).eq('inicio', alvo.inicio).eq('fim', alvo.fim).maybeSingle();
      if (data) return data as Ciclo;
      const { data: novo, error } = await supabase.from('metas_ciclos')
        .insert({ tipo, rotulo: alvo.rotulo, inicio: alvo.inicio, fim: alvo.fim })
        .select('*').single();
      if (error) throw error;
      return novo as Ciclo;
    },
    staleTime: 5 * 60_000,
  });

export const useCiclos = () =>
  useQuery({
    queryKey: ['metas', 'ciclos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metas_ciclos').select('*').order('inicio', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Ciclo[];
    },
  });

export const useObjetivos = (cicloId: string | undefined) =>
  useQuery({
    queryKey: ['metas', 'objetivos', cicloId],
    enabled: !!cicloId,
    queryFn: async () => {
      const { data, error } = await supabase.from('metas_objetivos').select('*')
        .eq('ciclo_id', cicloId!).order('ordem').order('created_at');
      if (error) throw error;
      return (data ?? []) as Objetivo[];
    },
  });

/** Todos os KRs do ciclo numa consulta — um por objetivo seria N+1. */
/** Todas as metas do ciclo — as soltas e as que estão sob um objetivo. */
export const useKRs = (cicloId: string | undefined) =>
  useQuery({
    queryKey: ['metas', 'krs', cicloId],
    enabled: !!cicloId,
    queryFn: async () => {
      const { data, error } = await supabase.from('metas_kr').select('*')
        .eq('ciclo_id', cicloId!).order('ordem').order('created_at');
      if (error) throw error;
      return (data ?? []) as KRRow[];
    },
  });

/** As metas que desdobram estas — vivem em outros ciclos, então vêm à parte. */
export const useFilhos = (paiIds: string[]) =>
  useQuery({
    queryKey: ['metas', 'filhos', [...paiIds].sort().join(',')],
    enabled: paiIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('metas_kr')
        .select('*, ciclo:metas_ciclos(inicio, fim, rotulo, tipo)')
        .in('pai_id', paiIds);
      if (error) throw error;
      return (data ?? []) as (KRRow & { ciclo: Pick<Ciclo, 'inicio' | 'fim' | 'rotulo' | 'tipo'> })[];
    },
  });

/**
 * Quebra uma meta nos pedaços do período — meses dentro do trimestre,
 * trimestres dentro do ano.
 *
 * Os ciclos filhos nascem aqui se ainda não existirem: pedir que alguém
 * "abra outubro" antes de desdobrar o trimestre seria burocracia.
 */
export const useDesdobrar = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kr, ciclo }: { kr: KRRow; ciclo: Ciclo }) => {
      const natureza: Natureza = kr.fonte !== 'manual'
        ? METRICAS[kr.fonte as keyof typeof METRICAS].natureza
        : 'fluxo';
      const pedacos = pedacosDe(ciclo.inicio, ciclo.fim, ciclo.tipo);
      if (!pedacos.length) return 0;
      const alvos = sugerirDesdobramento(natureza, Number(kr.partida), Number(kr.alvo), pedacos);

      let anterior = Number(kr.partida);
      for (let i = 0; i < pedacos.length; i++) {
        const p = pedacos[i];
        const { data: achado } = await supabase.from('metas_ciclos').select('id')
          .eq('tipo', p.tipo).eq('inicio', p.inicio).eq('fim', p.fim).maybeSingle();
        let cicloId = achado?.id as string | undefined;
        if (!cicloId) {
          const { data: novo, error } = await supabase.from('metas_ciclos')
            .insert({ tipo: p.tipo, rotulo: p.rotulo, inicio: p.inicio, fim: p.fim })
            .select('id').single();
          if (error) throw error;
          cicloId = novo.id as string;
        }
        /* Em fluxo cada pedaço começa do zero — o que entrou em novembro
           não carrega o que entrou em outubro. Em estoque, começa onde o
           pedaço anterior prometeu parar. */
        const partida = natureza === 'fluxo' ? 0 : anterior;
        const { error: erroKr } = await supabase.from('metas_kr').insert({
          ciclo_id: cicloId, objetivo_id: null, pai_id: kr.id,
          titulo: kr.titulo, unidade: kr.unidade, fonte: kr.fonte,
          direcao: kr.direcao, partida, alvo: alvos[i], ordem: i,
        });
        if (erroKr) throw erroKr;
        anterior = alvos[i];
      }
      return pedacos.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metas'] }),
  });
};

export const useCheckins = (krIds: string[]) =>
  useQuery({
    queryKey: ['metas', 'checkins', [...krIds].sort().join(',')],
    enabled: krIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('metas_checkins').select('*')
        .in('kr_id', krIds).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Checkin[];
    },
  });

export const useNSM = () =>
  useQuery({
    queryKey: ['metas', 'nsm'],
    queryFn: async (): Promise<NSM> => {
      const { data } = await supabase.from('metas_nsm').select('*').eq('id', true).maybeSingle();
      if (data) return data as NSM;
      /* A primeira abertura cria a linha com a sugestão — a métrica-norte
         da Via Pesados é o que a BASE vende, não o que a Via Pesados
         fatura: é o valor entregue que sustenta a mensalidade. */
      const padrao = {
        id: true, metrica: 'vendas_base', rotulo: 'Caminhões vendidos pelos lojistas',
        porque: 'É o valor que o sistema entrega. Enquanto ele sobe, a mensalidade se justifica sozinha.',
        unidade: 'numero', meta_ano: null,
      };
      const { data: novo, error } = await supabase.from('metas_nsm').insert(padrao).select('*').single();
      if (error) throw error;
      return novo as NSM;
    },
    staleTime: 5 * 60_000,
  });

export const useSerieNSM = () =>
  useQuery({
    queryKey: ['metas', 'nsm', 'serie'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metas_nsm_serie').select('*').order('dia');
      if (error) throw error;
      return (data ?? []) as { dia: string; valor: number }[];
    },
  });

/** Grava o ponto de hoje — sem isso o gráfico começa quando alguém lembrar. */
export const useGravarPontoNSM = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (valor: number) => {
      const dia = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from('metas_nsm_serie').upsert({ dia, valor }, { onConflict: 'dia' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metas', 'nsm', 'serie'] }),
  });
};

const invalidar = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ['metas'] });

export const useSalvarNSM = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<NSM>) => {
      const { error } = await supabase.from('metas_nsm')
        .update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
  });
};

export const useSalvarCiclo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Ciclo> & { id: string }) => {
      const { error } = await supabase.from('metas_ciclos')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
  });
};

export const useCriarObjetivo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: Partial<Objetivo> & { ciclo_id: string; titulo: string }) => {
      const { data, error } = await supabase.from('metas_objetivos').insert(o).select('*').single();
      if (error) throw error;
      return data as Objetivo;
    },
    onSuccess: () => invalidar(qc),
  });
};

export const useSalvarObjetivo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Objetivo> & { id: string }) => {
      const { error } = await supabase.from('metas_objetivos')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
  });
};

export const useApagarObjetivo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('metas_objetivos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
  });
};

export const useSalvarKR = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (kr: Partial<KRRow> & { ciclo_id: string; titulo: string; alvo: number }) => {
      const { id, ...resto } = kr as Partial<KRRow> & { ciclo_id: string };
      if (id) {
        const { error } = await supabase.from('metas_kr')
          .update({ ...resto, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('metas_kr').insert(resto);
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
  });
};

export const useApagarKR = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('metas_kr').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
  });
};

export const useCheckin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Omit<Checkin, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('metas_checkins').insert(c);
      if (error) throw error;
      /* Check-in de KR manual também move o valor: senão o número da tela
         fica parado e o histórico diz outra coisa. */
      if (c.valor !== null && c.valor !== undefined) {
        const { data: kr } = await supabase.from('metas_kr').select('fonte').eq('id', c.kr_id).maybeSingle();
        if (kr?.fonte === 'manual') {
          await supabase.from('metas_kr').update({ valor_manual: c.valor }).eq('id', c.kr_id);
        }
      }
    },
    onSuccess: () => invalidar(qc),
  });
};
