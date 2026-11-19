import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFrente } from '@/contexts/FrenteContext';
import { useAuth } from '@/contexts/AuthContext';
import { useChannels, useMeetings, useProspects, type Meeting, type Prospect } from '@/hooks/useAdmin';
import { useFunilDaProspeccao, nomeDaLoja, type LinhaDoFunil } from '@/hooks/useFunilDaProspeccao';
import { cargoCurto, estoqueCurto } from '@/lib/funilDaProspeccao';
import { mascaraTelefoneDoBanco } from '@/lib/mascaras';
import {
  conversasSoltas, montarOportunidades, type FonteConversa, type FonteLoja, type Oportunidade,
} from '@/lib/oportunidades';

/**
 * Tudo o que a tela de vendas precisa, junto: as lojas da prospecção, os cards, as reuniões e as
 * conversas viram uma lista só de oportunidades (lib/oportunidades). Hoje e Funil leem daqui,
 * então os dois mostram sempre a mesma coisa.
 */

const COLUNAS_DA_CONVERSA = 'id, prospect_id, nao_lidas, ultima_direcao, ultima_mensagem, ultima_mensagem_em, telefone, nome';
/** De quanto em quanto tempo a tela confere se chegou gente nova. */
const CONFERIR_A_CADA = 20_000;

async function emPedacos<T>(ids: string[], consulta: (pedaco: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const linhas: T[] = [];
  for (let i = 0; i < unicos.length; i += 100) {
    const { data, error } = await consulta(unicos.slice(i, i + 100));
    if (error) throw error;
    linhas.push(...(data ?? []));
  }
  return linhas;
}

/** Já respondeu, ou tem card, reunião ou o Davi chamou: é dessas que a conversa interessa. */
const interessa = (l: LinhaDoFunil) => l.posicao.fase !== 'abordada' || l.posicao.lado === 'com_voce' || !!l.card || !!l.reuniao;

const paraFonte = (l: LinhaDoFunil): FonteLoja => {
  const s = (l.conversa?.situacao ?? {}) as Record<string, unknown>;
  return {
    lojaId: l.loja.id, nome: nomeDaLoja(l.loja), cidade: l.loja.cidade, uf: l.loja.uf, telefone: l.loja.telefone,
    status: l.loja.status, motivo: l.loja.motivo, atualizadaEm: l.loja.atualizada_em, contatos: l.loja.contatos,
    ligacoes: l.loja.ligacoes ?? 0, conversaId: l.loja.conversa_id, primeiroContatoEm: l.loja.primeiro_contato_em,
    mexeuEm: l.mexeuEm, posicao: l.posicao, reuniao: l.reuniao, cardId: l.card?.id ?? null,
    davi: l.conversa ? { etapa: l.conversa.etapa ?? null, modo: l.conversa.modo ?? null } : null,
    sabe: [estoqueCurto(s.estoque), cargoCurto(s.cargo)].filter((x): x is string => !!x),
    teste: l.teste,
  };
};

export function useOportunidades() {
  const { frente } = useFrente();
  const lojista = frente === 'lojista';
  const funil = useFunilDaProspeccao(lojista);
  const prospects = useProspects();
  const meetings = useMeetings();
  const { data: canais = [] } = useChannels();

  const linhas = useMemo(() => (lojista ? funil.data?.linhas ?? [] : []), [lojista, funil.data]);
  const idsDeLoja = useMemo(() => linhas.filter(interessa).map((l) => l.loja.conversa_id).filter((x): x is string => !!x).sort(), [linhas]);
  const chamadas = useMemo(() => linhas.filter((l) => l.posicao.lado === 'com_voce').map((l) => l.loja.conversa_id).filter((x): x is string => !!x).sort(), [linhas]);

  const conversas = useQuery({
    queryKey: ['wa', 'conversas-das-oportunidades', idsDeLoja.join(',')],
    refetchInterval: CONFERIR_A_CADA,
    queryFn: async () => {
      const [doCardOuNaoLidas, dasLojas] = await Promise.all([
        supabase.from('wa_conversas').select(COLUNAS_DA_CONVERSA).or('prospect_id.not.is.null,nao_lidas.gt.0').limit(500),
        emPedacos<FonteConversa>(idsDeLoja, (ids) => supabase.from('wa_conversas').select(COLUNAS_DA_CONVERSA).in('id', ids)),
      ]);
      if (doCardOuNaoLidas.error) throw doCardOuNaoLidas.error;
      return [...new Map([...(doCardOuNaoLidas.data ?? []) as FonteConversa[], ...dasLojas].map((c) => [c.id, c])).values()];
    },
  });

  const atividades = useQuery({
    queryKey: ['activities', 'das-oportunidades'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select('prospect_id, kind, created_at')
        .not('prospect_id', 'is', null).order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as { prospect_id: string | null; kind: string; created_at: string }[];
    },
  });

  /* Você já escreveu depois que o Davi chamou? Então a loja não está mais esperando você. */
  const respostas = useQuery({
    queryKey: ['wa', 'respostas-da-equipe', chamadas.join(',')],
    enabled: chamadas.length > 0,
    refetchInterval: CONFERIR_A_CADA,
    queryFn: async () => {
      const linhasDeMsg = await emPedacos<{ conversa_id: string; created_at: string }>(chamadas, (ids) =>
        supabase.from('wa_mensagens').select('conversa_id, created_at').in('conversa_id', ids)
          .eq('direcao', 'saida').not('enviada_por', 'is', null).order('created_at', { ascending: false }).limit(300));
      const m: Record<string, string> = {};
      for (const x of linhasDeMsg) if (!m[x.conversa_id] || x.created_at > m[x.conversa_id]) m[x.conversa_id] = x.created_at;
      return m;
    },
  });

  const todos = useMemo(() => prospects.data ?? [], [prospects.data]);
  const reunioes = useMemo(() => meetings.data ?? [], [meetings.data]);

  const oportunidades = useMemo(() => {
    const canal = new Map(canais.map((c) => [c.id, c]));
    return montarOportunidades({
      lojas: linhas.map(paraFonte),
      cards: todos.map((p) => ({
        id: p.id, company_name: p.company_name, contact_name: p.contact_name, whatsapp: p.whatsapp, city: p.city, state: p.state,
        stage: p.stage, notes: p.notes, lost_reason: p.lost_reason, created_at: p.created_at, updated_at: p.updated_at,
        canalSlug: p.channel_id ? canal.get(p.channel_id)?.slug ?? null : null,
        canalNome: p.channel_id ? canal.get(p.channel_id)?.name ?? null : null,
      })),
      reunioes,
      conversas: conversas.data ?? [],
      atividades: atividades.data ?? [],
      respostasDaEquipe: respostas.data ?? {},
    });
  }, [linhas, todos, reunioes, canais, conversas.data, atividades.data, respostas.data]);

  const soltas = useMemo(() => conversasSoltas(conversas.data ?? [], oportunidades), [conversas.data, oportunidades]);

  return {
    oportunidades,
    /** Conversas com mensagem por ler que não são de nenhuma oportunidade. */
    soltas,
    reunioes,
    /** As lojas da prospecção, com tudo o que o Davi anotou (para a ficha). */
    linhas,
    prospects: todos,
    naFila: lojista ? funil.data?.naFila ?? 0 : 0,
    carregando: prospects.isLoading || meetings.isLoading || (lojista && funil.isLoading),
    erro: (prospects.error ?? meetings.error ?? (lojista ? funil.error : null)) as Error | null,
  };
}

/** A linha da prospecção por trás de uma oportunidade (para abrir a ficha com o que o Davi anotou). */
export const linhaDa = (linhas: LinhaDoFunil[], o: Oportunidade | null) =>
  (o?.lojaId ? linhas.find((l) => l.loja.id === o.lojaId) ?? null : null);

/**
 * O card da oportunidade. Loja da prospecção que respondeu pode ainda não ter card (o Davi só
 * abre na primeira dor): marcar reunião, começar teste e registrar venda precisam de um, então
 * ele nasce aqui, ligado à conversa.
 */
export function useGarantirCard() {
  const qc = useQueryClient();
  const { member } = useAuth();
  const { data: canais = [] } = useChannels();
  return useMutation({
    mutationFn: async ({ o, prospects, linhas }: { o: Oportunidade; prospects: Prospect[]; linhas: LinhaDoFunil[] }): Promise<Prospect> => {
      if (o.cardId) {
        const achado = prospects.find((p) => p.id === o.cardId);
        if (achado) return achado;
      }
      const l = linhaDa(linhas, o);
      const canal = canais.find((c) => c.slug === 'outbound') ?? canais.find((c) => c.slug === 'assistente');
      const { data, error } = await supabase.from('prospects').insert({
        company_name: o.nome, whatsapp: mascaraTelefoneDoBanco(o.telefone) || null,
        city: l?.loja.cidade ?? null, state: l?.loja.uf ?? null,
        channel_id: canal?.id ?? null, funil: 'fria', stage: 'contato', source: 'prospecção', owner_id: member?.id ?? null,
      }).select().single();
      if (error) throw error;
      if (o.conversaId) await supabase.from('wa_conversas').update({ prospect_id: data.id }).eq('id', o.conversaId).is('prospect_id', null);
      return data as Prospect;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospects'] });
      qc.invalidateQueries({ queryKey: ['prospeccao'] });
      qc.invalidateQueries({ queryKey: ['wa'] });
    },
  });
}

export type ComoFoiOContato = 'conversando' | 'nao_atendeu' | 'sem_interesse';

/** O primeiro contato com quem chegou (formulário, indicação): o que aconteceu quando você chamou. */
export function useRegistrarContato() {
  const qc = useQueryClient();
  const { member } = useAuth();
  return useMutation({
    mutationFn: async ({ cardId, como, nota }: { cardId: string; como: ComoFoiOContato; nota?: string }) => {
      const texto = (nota ?? '').trim();
      if (como === 'sem_interesse') {
        const { error } = await supabase.from('prospects').update({ stage: 'perdido', lost_reason: texto || 'Sem interesse.' }).eq('id', cardId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('activities').insert({
        prospect_id: cardId, author_id: member?.id ?? null,
        kind: como === 'nao_atendeu' ? 'tentativa' : 'contato',
        content: como === 'nao_atendeu' ? `Tentou falar e não atendeu.${texto ? ` ${texto}` : ''}` : `Primeiro contato feito.${texto ? ` ${texto}` : ''}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospects'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/**
 * "Já respondi": você falou com a loja por fora do CRM (ligação, o seu WhatsApp). Fica anotado
 * no card e ela sai de "Responder agora".
 */
export function useJaRespondi() {
  const qc = useQueryClient();
  const { member } = useAuth();
  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.from('activities').insert({
        prospect_id: cardId, author_id: member?.id ?? null, kind: 'contato',
        content: 'Respondido por fora do CRM (ligação ou outro WhatsApp).',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
  });
}

export type { Meeting };
