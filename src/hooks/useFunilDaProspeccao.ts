import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AssistenteConversa } from '@/hooks/useAssistente';
import { posicaoNoFunil, type PosicaoNoFunil, type StatusDaLoja } from '@/lib/funilDaProspeccao';

/**
 * O funil da prospecção automática: as lojas abordadas, a conversa de cada uma
 * com o Davi, a reunião e o card do funil principal, juntos. A fase de cada
 * loja é calculada aqui (lib/funilDaProspeccao), nunca gravada.
 */

export type LojaDoFunil = {
  id: string; nome: string; cidade: string | null; uf: string | null; telefone: string;
  dados: Record<string, unknown> | null; status: StatusDaLoja; contatos: number;
  primeiro_contato_em: string | null; ultimo_contato_em: string | null; respondeu_em: string | null;
  conversa_id: string | null; motivo: string | null; humano_assumiu: boolean; atualizada_em: string; fonte_ref: string | null;
};

export type ConversaDoFunil = Pick<AssistenteConversa,
  'conversa_id' | 'modo' | 'etapa' | 'situacao' | 'dores' | 'objecoes' | 'memoria' | 'decisor_vem' | 'decisor_citacao'
  | 'quem_vem' | 'pedidos_preco' | 'horarios_oferecidos' | 'reuniao_id' | 'prospect_id' | 'loja_id' | 'dossie'
  | 'pausado_motivo' | 'atualizado_em'>;

export type ReuniaoDoFunil = { id: string; scheduled_at: string; status: string; meet_link: string | null };
export type CardDoFunil = { id: string; stage: string; company_name: string | null };

export type LinhaDoFunil = {
  loja: LojaDoFunil;
  conversa: ConversaDoFunil | null;
  reuniao: ReuniaoDoFunil | null;
  card: CardDoFunil | null;
  posicao: PosicaoNoFunil;
  /** A última novidade da loja (mensagem, resposta, conversa). */
  mexeuEm: string;
};

const ABORDADAS: StatusDaLoja[] = ['em_contato', 'sem_resposta', 'conversando', 'com_voce', 'sem_interesse'];
const PAGINA = 1000;
const MAX_PAGINAS = 10;

/** Todas as linhas, de mil em mil (o banco devolve no máximo mil por vez). */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const linhas: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await consulta(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return linhas;
}

/** `.in()` em pedaços: lista longa de ids não cabe numa URL só. */
async function porIds<T>(ids: string[], consulta: (pedaco: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const linhas: T[] = [];
  for (let i = 0; i < unicos.length; i += 100) {
    const { data, error } = await consulta(unicos.slice(i, i + 100));
    if (error) throw error;
    linhas.push(...(data ?? []));
  }
  return linhas;
}

const maisRecente = (...datas: (string | null | undefined)[]) =>
  datas.filter((d): d is string => !!d).sort().pop() ?? '';

export const useFunilDaProspeccao = () =>
  useQuery({
    queryKey: ['prospeccao', 'funil'],
    queryFn: async () => {
      const [lojas, conversas, { count: naFila }] = await Promise.all([
        todas<LojaDoFunil>((de, ate) => supabase.from('prospeccao_lojas')
          .select('id, nome, cidade, uf, telefone, dados, status, contatos, primeiro_contato_em, ultimo_contato_em, respondeu_em, conversa_id, motivo, humano_assumiu, atualizada_em, fonte_ref')
          .in('status', ABORDADAS).order('atualizada_em', { ascending: false }).range(de, ate)),
        todas<ConversaDoFunil>((de, ate) => supabase.from('assistente_conversas')
          .select('conversa_id, modo, etapa, situacao, dores, objecoes, memoria, decisor_vem, decisor_citacao, quem_vem, pedidos_preco, horarios_oferecidos, reuniao_id, prospect_id, loja_id, dossie, pausado_motivo, atualizado_em')
          .not('loja_id', 'is', null).order('atualizado_em', { ascending: false }).range(de, ate)),
        supabase.from('prospeccao_lojas').select('id', { count: 'exact', head: true }).in('status', ['nova', 'pronta']),
      ]);

      const [reunioes, cards] = await Promise.all([
        porIds<ReuniaoDoFunil>(conversas.map((c) => c.reuniao_id ?? ''), (ids) =>
          supabase.from('meetings').select('id, scheduled_at, status, meet_link').in('id', ids)),
        porIds<CardDoFunil>(conversas.map((c) => c.prospect_id ?? ''), (ids) =>
          supabase.from('prospects').select('id, stage, company_name').in('id', ids)),
      ]);

      /* Uma conversa por loja: a mais recente, se houver mais de uma. */
      const conversaDaLoja = new Map<string, ConversaDoFunil>();
      for (const c of conversas) if (c.loja_id && !conversaDaLoja.has(c.loja_id)) conversaDaLoja.set(c.loja_id, c);
      const reuniaoPorId = new Map(reunioes.map((r) => [r.id, r]));
      const cardPorId = new Map(cards.map((c) => [c.id, c]));

      const agora = new Date();
      const linhas: LinhaDoFunil[] = lojas.map((loja) => {
        const conversa = conversaDaLoja.get(loja.id) ?? null;
        const reuniao = conversa?.reuniao_id ? reuniaoPorId.get(conversa.reuniao_id) ?? null : null;
        const card = conversa?.prospect_id ? cardPorId.get(conversa.prospect_id) ?? null : null;
        const posicao = posicaoNoFunil({
          loja: { status: loja.status, humano_assumiu: loja.humano_assumiu, respondeu_em: loja.respondeu_em, nome: nomeDaLoja(loja) },
          conversa, reuniao, card,
        }, agora);
        return {
          loja, conversa, reuniao, card, posicao,
          mexeuEm: maisRecente(loja.ultimo_contato_em, loja.respondeu_em, conversa?.atualizado_em, loja.atualizada_em),
        };
      });
      linhas.sort((a, b) => b.mexeuEm.localeCompare(a.mexeuEm));
      return { linhas, naFila: naFila ?? 0 };
    },
    refetchInterval: 60_000,
  });

/** O nome que a mensagem usou (corrigido à mão quando o do portal veio torto). */
export function nomeDaLoja(l: Pick<LojaDoFunil, 'nome' | 'dados'>): string {
  const corrigido = l.dados?.nome_mensagem;
  return typeof corrigido === 'string' && corrigido.trim() ? corrigido.trim() : l.nome;
}
