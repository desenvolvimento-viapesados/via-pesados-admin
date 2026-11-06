import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { frenteAtual } from '@/lib/frente';
import type {
  AssistenteConfig, AssistenteConversa, AssistenteTurno, AssistenteFato, Modo, Etapa, ItemCitado,
} from '../../supabase/functions/_shared/assistente-regras';

/**
 * Tudo o que as telas do assistente de vendas leem e gravam, num lugar só.
 *
 * Quem grava o quê (migration 20261103190000_assistente_de_vendas):
 *  - config e fatos: a equipe grava direto na tabela (a policy deixa);
 *  - estado da conversa e turnos: só o servidor grava. A tela pede pela
 *    função `assistente-acao` (mudar o modo, aprovar, descartar, devolver).
 *
 * As colunas numeric (teto, custo) chegam como texto: tudo passa por Number().
 */

export type {
  AssistenteConfig, AssistenteConversa, AssistenteTurno, AssistenteFato, Modo, Etapa, ItemCitado,
} from '../../supabase/functions/_shared/assistente-regras';
export {
  MODOS, ROTULO_DO_MODO, ROTULO_DA_ETAPA, ETAPAS_SEM_RESPOSTA, LIMITES,
  horarioFalado, fiscal, dentroDoHorario, janelaAberta, textoDaMensagem, ehNumeroDeTeste, telefoneDeTeste,
} from '../../supabase/functions/_shared/assistente-regras';

/* ── a função do servidor ─────────────────────────────────────── */

export type AcaoDoAssistente =
  | { acao: 'status' }
  | { acao: 'modo'; conversa_id: string; modo: Modo }
  | { acao: 'devolver'; conversa_id: string }
  | { acao: 'aprovar'; conversa_id: string; turno_id: string; mensagens: string[] }
  | { acao: 'descartar'; conversa_id: string; turno_id: string }
  | { acao: 'recomecar'; conversa_id: string };

export type StatusDasChaves = { chave_ia: boolean; chave_transcricao: boolean };

/** Chama `assistente-acao` e devolve o erro em português, nunca "non-2xx". */
export async function chamarAssistente<T = Record<string, unknown>>(corpo: AcaoDoAssistente): Promise<T> {
  const { data, error } = await supabase.functions.invoke('assistente-acao', { body: corpo });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    let msg = '';
    let status = 0;
    if (ctx instanceof Response) {
      status = ctx.status;
      try {
        const bruto = await ctx.clone().text();
        const j = bruto ? JSON.parse(bruto) : null;
        msg = (j?.error as string) || (j?.message as string) || '';
      } catch { /* corpo não-JSON */ }
    }
    throw new Error(
      msg
      || (status === 404 ? 'O assistente ainda não está instalado no servidor.'
        : status >= 500 ? 'O servidor demorou demais para responder. Tente de novo em alguns segundos.'
        : status ? `Não deu certo (${status}). Tente de novo.`
        : 'Não consegui falar com o servidor. Confira a internet e tente de novo.'),
    );
  }
  const d = data as Record<string, unknown> | null;
  if (d && typeof d.error === 'string') throw new Error(d.error);
  return (d ?? {}) as T;
}

/* ── normalização ─────────────────────────────────────────────── */

const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0);

function configDaLinha(r: Record<string, unknown>): AssistenteConfig {
  const c = r as unknown as AssistenteConfig;
  return {
    ...c,
    teto_usd_dia: num(c.teto_usd_dia),
    dias_semana: lista<number>(c.dias_semana).map(Number),
    hora_inicio: String(c.hora_inicio ?? '09:00').slice(0, 5),
    hora_fim: String(c.hora_fim ?? '18:00').slice(0, 5),
    telefones_teste: lista<string>(c.telefones_teste).map(String),
    preco_mensal: c.preco_mensal == null ? null : num(c.preco_mensal),
    preco_cheio: c.preco_cheio == null ? null : num(c.preco_cheio),
    oferta_ate: c.oferta_ate ? String(c.oferta_ate).slice(0, 10) : null,
  };
}

function conversaDaLinha(r: Record<string, unknown>): AssistenteConversa {
  const c = r as unknown as AssistenteConversa;
  return {
    ...c,
    dores: lista<ItemCitado>(c.dores),
    objecoes: lista<ItemCitado>(c.objecoes),
    situacao: (c.situacao && typeof c.situacao === 'object' ? c.situacao : {}) as AssistenteConversa['situacao'],
    horarios_oferecidos: lista<string>(c.horarios_oferecidos),
    custo_usd: num(c.custo_usd),
    pedidos_preco: num(c.pedidos_preco),
    mensagens_enviadas: num(c.mensagens_enviadas),
  };
}

function turnoDaLinha(r: Record<string, unknown>): AssistenteTurno {
  const t = r as unknown as AssistenteTurno;
  return {
    ...t,
    mensagens: lista<string>(t.mensagens),
    mensagens_finais: Array.isArray(t.mensagens_finais) ? t.mensagens_finais : null,
    acoes: lista(t.acoes),
    custo_usd: num(t.custo_usd),
  };
}

/* ── configuração geral (aba Assistente) ──────────────────────── */

export const useAssistenteConfig = () =>
  useQuery({
    queryKey: ['assistente', 'config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('assistente_config').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data ? configDaLinha(data) : null;
    },
    retry: false,
  });

export type MudancaNaConfig = Partial<Pick<AssistenteConfig,
  'ligado' | 'link_reuniao' | 'dias_semana' | 'hora_inicio' | 'hora_fim' | 'duracao_min'
  | 'folga_min_horas' | 'max_reunioes_dia' | 'modo_prospeccao' | 'responsavel_id' | 'teto_usd_dia' | 'telefones_teste' | 'preco_mensal'
  | 'preco_cheio' | 'oferta_ate'>>;

export function useSalvarConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mudanca: MudancaNaConfig) => {
      const { data, error } = await supabase.from('assistente_config')
        .update(mudanca).eq('id', 1).select('*').maybeSingle();
      if (error) throw new Error(traduzirErroDoBanco(error.message));
      /* A policy deixa a equipe alterar; sem linha de volta é porque a
         conta não é da equipe ou a tabela ainda não existe. */
      if (!data) throw new Error('Não consegui salvar. Confira se você está logado com uma conta da equipe.');
      return configDaLinha(data);
    },
    onSuccess: (cfg) => {
      qc.setQueryData(['assistente', 'config'], cfg);
      qc.invalidateQueries({ queryKey: ['assistente'] });
    },
  });
}

/** As travas do banco viram frase de gente. */
function traduzirErroDoBanco(m: string): string {
  if (/link_reuniao/i.test(m)) return 'O link da reunião precisa começar com https:// e não pode ter espaço.';
  if (/hora/i.test(m)) return 'O fim do expediente precisa ser depois do começo.';
  if (/duracao/i.test(m)) return 'A reunião precisa ter entre 5 e 120 minutos.';
  if (/folga/i.test(m)) return 'A folga mínima vai de 0 a 72 horas.';
  if (/max_reunioes/i.test(m)) return 'O teto por dia vai de 1 a 30 reuniões.';
  if (/teto_usd/i.test(m)) return 'O teto de gasto não pode ser negativo.';
  if (/preco_cheio/i.test(m)) return 'O valor normal precisa ser maior que zero (ou vazio, sem oferta).';
  if (/preco_mensal/i.test(m)) return 'O valor por mês precisa ser maior que zero (ou vazio, para ele não falar valor).';
  if (/telefones_teste/i.test(m)) return 'Números de teste: até 10, cada um com DDD (ex.: 27 99724-6060).';
  if (/modo/i.test(m)) return 'Modo inválido.';
  if (/does not exist|relation/i.test(m)) return 'O assistente ainda não está instalado no banco.';
  return m;
}

/** As chaves estão cadastradas? O servidor responde só sim ou não, nunca a chave. */
export const useStatusDoAssistente = () =>
  useQuery({
    queryKey: ['assistente', 'status'],
    queryFn: () => chamarAssistente<StatusDasChaves>({ acao: 'status' }),
    retry: false,
    staleTime: 5 * 60_000,
  });

/** Quanto o assistente gastou hoje (desde 00h de São Paulo), em dólares. */
export const useGastoHoje = () =>
  useQuery({
    queryKey: ['assistente', 'gasto'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('assistente_gasto_hoje');
      if (error) throw error;
      return num(data);
    },
    retry: false,
    refetchInterval: 60_000,
  });

/* ── fatos aprovados ──────────────────────────────────────────── */

export const useFatos = () =>
  useQuery({
    queryKey: ['assistente', 'fatos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('assistente_fatos').select('*')
        .order('ordem').order('tema');
      if (error) throw error;
      return (data ?? []) as AssistenteFato[];
    },
    retry: false,
  });

export type FatoEditado = Pick<AssistenteFato, 'tema' | 'texto' | 'nao_dizer' | 'ativo' | 'ordem'>
  & { id?: string; usar_quando?: string | null };

export function useSalvarFato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: FatoEditado) => {
      const linha = {
        tema: f.tema.trim(), texto: f.texto.trim(),
        nao_dizer: f.nao_dizer?.trim() ? f.nao_dizer.trim() : null,
        ...(f.usar_quando !== undefined ? { usar_quando: f.usar_quando?.trim() ? f.usar_quando.trim() : null } : {}),
        ativo: f.ativo, ordem: f.ordem,
      };
      if (!linha.tema || !linha.texto) throw new Error('Preencha o tema e o texto do fato.');
      const { error } = f.id
        ? await supabase.from('assistente_fatos').update(linha).eq('id', f.id)
        : await supabase.from('assistente_fatos').insert(linha);
      if (error) throw new Error(traduzirErroDoBanco(error.message));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistente', 'fatos'] }),
  });
}

export function useApagarFato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assistente_fatos').delete().eq('id', id);
      if (error) throw new Error(traduzirErroDoBanco(error.message));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistente', 'fatos'] }),
  });
}

/* ── conversas atendidas (aba Assistente) ─────────────────────── */

export type ConversaAtendida = Pick<AssistenteConversa,
  'conversa_id' | 'modo' | 'etapa' | 'custo_usd' | 'mensagens_enviadas' | 'atualizado_em' | 'prospect_id' | 'pausado_motivo' | 'reuniao_id'> & {
  nome: string | null; telefone: string | null; instancia_id: string | null;
};

export const useConversasAtendidas = () =>
  useQuery({
    queryKey: ['assistente', 'atendidas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('assistente_conversas')
        .select('conversa_id, modo, etapa, custo_usd, mensagens_enviadas, atualizado_em, prospect_id, pausado_motivo, reuniao_id, wa_conversas(nome, telefone, instancia_id)')
        .order('atualizado_em', { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const bruto = (r as Record<string, unknown>).wa_conversas;
        const w = (Array.isArray(bruto) ? bruto[0] : bruto) as { nome?: string | null; telefone?: string | null; instancia_id?: string | null } | null;
        return {
          ...(r as unknown as ConversaAtendida),
          custo_usd: num((r as Record<string, unknown>).custo_usd),
          mensagens_enviadas: num((r as Record<string, unknown>).mensagens_enviadas),
          nome: w?.nome ?? null, telefone: w?.telefone ?? null, instancia_id: w?.instancia_id ?? null,
        } as ConversaAtendida;
      });
    },
    retry: false,
    refetchInterval: 60_000,
  });

/** Conversas com rascunho esperando a aprovação de alguém. */
export const useRascunhosEsperando = () =>
  useQuery({
    queryKey: ['assistente', 'rascunhos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('assistente_turnos')
        .select('conversa_id, criado_em').eq('status', 'rascunho')
        .order('criado_em', { ascending: false }).limit(100);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.conversa_id as string));
    },
    retry: false,
    refetchInterval: 60_000,
  });

/* ── uma conversa ─────────────────────────────────────────────── */

export const useAssistenteDaConversa = (conversaId: string | null) =>
  useQuery({
    queryKey: ['assistente', 'conversa', conversaId],
    enabled: !!conversaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('assistente_conversas')
        .select('*').eq('conversa_id', conversaId!).maybeSingle();
      if (error) throw error;
      return data ? conversaDaLinha(data) : null;
    },
    retry: false,
  });

/** Os últimos turnos: o rascunho pendente e o que aconteceu por último. */
export const useTurnosDaConversa = (conversaId: string | null) =>
  useQuery({
    queryKey: ['assistente', 'turnos', conversaId],
    enabled: !!conversaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('assistente_turnos')
        .select('*').eq('conversa_id', conversaId!)
        .order('criado_em', { ascending: false }).limit(5);
      if (error) throw error;
      const turnos = (data ?? []).map(turnoDaLinha);
      return {
        rascunho: turnos.find((t) => t.status === 'rascunho') ?? null,
        ultimo: turnos[0] ?? null,
      };
    },
    retry: false,
  });

export type ReuniaoDoAssistente = { id: string; scheduled_at: string; status: string; meet_link: string | null; duration_min: number };

export const useReuniaoDoAssistente = (reuniaoId: string | null | undefined) =>
  useQuery({
    queryKey: ['assistente', 'reuniao', reuniaoId],
    enabled: !!reuniaoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('meetings')
        .select('id, scheduled_at, status, meet_link, duration_min').eq('id', reuniaoId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ReuniaoDoAssistente | null;
    },
    retry: false,
  });

/** Ações de uma conversa: modo, aprovar, descartar, devolver. */
export function useAcaoDoAssistente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corpo: Exclude<AcaoDoAssistente, { acao: 'status' }>) => chamarAssistente(corpo),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['assistente', 'conversa', v.conversa_id] });
      qc.invalidateQueries({ queryKey: ['assistente', 'turnos', v.conversa_id] });
      qc.invalidateQueries({ queryKey: ['assistente', 'atendidas'] });
      qc.invalidateQueries({ queryKey: ['assistente', 'rascunhos'] });
      qc.invalidateQueries({ queryKey: ['wa', 'mensagens', v.conversa_id] });
      qc.invalidateQueries({ queryKey: ['wa', 'conversas'] });
    },
  });
}

/* ── mídia guardada (áudio, foto) ─────────────────────────────── */

/**
 * Link de leitura do arquivo guardado no bucket privado `wa-midia`. Vale uma
 * hora; a consulta renova antes disso.
 */
export const useLinkDaMidia = (caminho: string | null | undefined) =>
  useQuery({
    queryKey: ['wa', 'midia', caminho],
    enabled: !!caminho,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('wa-midia').createSignedUrl(caminho!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    retry: false,
    staleTime: 50 * 60_000,
  });

/* ── tempo real ───────────────────────────────────────────────── */

/**
 * Rascunho novo e etapa mudando aparecem sem recarregar. Fora de Lojistas o
 * tempo real não entrega (não leva o cabeçalho da frente): pergunta de novo a
 * cada 10 segundos, como a caixa do WhatsApp.
 */
export function useTempoRealDoAssistente(conversaId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    const atualizar = (id?: string | null) => {
      qc.invalidateQueries({ queryKey: ['assistente', 'atendidas'] });
      qc.invalidateQueries({ queryKey: ['assistente', 'rascunhos'] });
      const alvo = id ?? conversaId;
      if (alvo) {
        qc.invalidateQueries({ queryKey: ['assistente', 'conversa', alvo] });
        qc.invalidateQueries({ queryKey: ['assistente', 'turnos', alvo] });
      }
    };
    if (frenteAtual() !== 'lojista') {
      const t = setInterval(() => atualizar(), 10_000);
      return () => clearInterval(t);
    }
    const canal = supabase.channel('assistente-tempo-real')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assistente_conversas' }, (p) => {
        atualizar(((p.new ?? p.old ?? {}) as { conversa_id?: string }).conversa_id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assistente_turnos' }, (p) => {
        atualizar(((p.new ?? p.old ?? {}) as { conversa_id?: string }).conversa_id);
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [qc, conversaId]);
}
