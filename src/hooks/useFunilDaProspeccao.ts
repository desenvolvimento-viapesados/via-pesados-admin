import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AssistenteConversa } from '@/hooks/useAssistente';
import {
  maiorEtapaDoCard, posicaoNoFunil, reuniaoQueVale, type PosicaoNoFunil, type StatusDaLoja,
} from '@/lib/funilDaProspeccao';

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

export type ReuniaoDoFunil = { id: string; scheduled_at: string; status: string; meet_link: string | null; prospect_id: string | null };
export type CardDoFunil = { id: string; stage: string; company_name: string | null; maiorEtapa: string | null };

export type LinhaDoFunil = {
  loja: LojaDoFunil;
  conversa: ConversaDoFunil | null;
  reuniao: ReuniaoDoFunil | null;
  card: CardDoFunil | null;
  posicao: PosicaoNoFunil;
  /** A última novidade da loja (mensagem, resposta, conversa). */
  mexeuEm: string;
  /** Loja do número de teste do dono: aparece marcada e fica fora das contas. */
  teste: boolean;
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
      /* Ordem por id: único e imutável, então nenhuma loja se repete nem some entre uma página e outra. */
      const [lojas, conversas, comCard, { count: naFila }, { data: cfg }] = await Promise.all([
        todas<LojaDoFunil>((de, ate) => supabase.from('prospeccao_lojas')
          .select('id, nome, cidade, uf, telefone, dados, status, contatos, primeiro_contato_em, ultimo_contato_em, respondeu_em, conversa_id, motivo, humano_assumiu, atualizada_em, fonte_ref')
          .in('status', ABORDADAS).order('id').range(de, ate)),
        todas<ConversaDoFunil>((de, ate) => supabase.from('assistente_conversas')
          .select('conversa_id, modo, etapa, situacao, dores, objecoes, memoria, decisor_vem, decisor_citacao, quem_vem, pedidos_preco, horarios_oferecidos, reuniao_id, prospect_id, loja_id, dossie, pausado_motivo, atualizado_em')
          .not('loja_id', 'is', null).order('conversa_id').range(de, ate)),
        /* O card de cada conversa, inclusive o que a equipe criou à mão. */
        todas<{ id: string; prospect_id: string }>((de, ate) => supabase.from('wa_conversas')
          .select('id, prospect_id').not('prospect_id', 'is', null).order('id').range(de, ate)),
        supabase.from('prospeccao_lojas').select('id', { count: 'exact', head: true }).in('status', ['nova', 'pronta']),
        supabase.from('assistente_config').select('telefones_teste').eq('id', 1).maybeSingle(),
      ]);

      /* Uma conversa por loja: a mexida mais recentemente. */
      const conversaDaLoja = new Map<string, ConversaDoFunil>();
      for (const c of conversas) {
        const atual = c.loja_id ? conversaDaLoja.get(c.loja_id) : undefined;
        if (c.loja_id && (!atual || c.atualizado_em > atual.atualizado_em)) conversaDaLoja.set(c.loja_id, c);
      }
      const cardDaConversa = new Map(comCard.map((w) => [w.id, w.prospect_id]));
      const cardDaLoja = (l: LojaDoFunil) => conversaDaLoja.get(l.id)?.prospect_id ?? (l.conversa_id ? cardDaConversa.get(l.conversa_id) : undefined) ?? null;
      const idsDosCards = lojas.map(cardDaLoja).filter((x): x is string => !!x);

      const [cards, eventos, reunioesDoCard, reunioesDoDavi] = await Promise.all([
        porIds<{ id: string; stage: string; company_name: string | null }>(idsDosCards, (ids) =>
          supabase.from('prospects').select('id, stage, company_name').in('id', ids)),
        porIds<{ prospect_id: string; to_stage: string }>(idsDosCards, (ids) =>
          supabase.from('prospect_events').select('prospect_id, to_stage').in('prospect_id', ids)),
        /* A reunião marcada à mão na Agenda fica no card, não na conversa do Davi. */
        porIds<ReuniaoDoFunil>(idsDosCards, (ids) =>
          supabase.from('meetings').select('id, scheduled_at, status, meet_link, prospect_id').in('prospect_id', ids)),
        porIds<ReuniaoDoFunil>(conversas.map((c) => c.reuniao_id ?? ''), (ids) =>
          supabase.from('meetings').select('id, scheduled_at, status, meet_link, prospect_id').in('id', ids)),
      ]);

      const etapasDoCard = new Map<string, string[]>();
      for (const e of eventos) etapasDoCard.set(e.prospect_id, [...(etapasDoCard.get(e.prospect_id) ?? []), e.to_stage]);
      const cardPorId = new Map(cards.map((c) => [c.id, { ...c, maiorEtapa: maiorEtapaDoCard(etapasDoCard.get(c.id) ?? []) }]));
      const reuniaoPorId = new Map([...reunioesDoCard, ...reunioesDoDavi].map((r) => [r.id, r]));
      const reunioesDoCardPor = new Map<string, ReuniaoDoFunil[]>();
      for (const r of reunioesDoCard) if (r.prospect_id) reunioesDoCardPor.set(r.prospect_id, [...(reunioesDoCardPor.get(r.prospect_id) ?? []), r]);

      const soDigitos = (t: string) => t.replace(/\D/g, '');
      const deTeste = new Set(((cfg?.telefones_teste ?? []) as string[]).map(soDigitos));

      const agora = new Date();
      const vistas = new Set<string>();
      const linhas: LinhaDoFunil[] = [];
      for (const loja of lojas) {
        if (vistas.has(loja.id)) continue;
        vistas.add(loja.id);
        const conversa = conversaDaLoja.get(loja.id) ?? null;
        const cardId = cardDaLoja(loja);
        const card = cardId ? cardPorId.get(cardId) ?? null : null;
        const candidatas = [
          ...(conversa?.reuniao_id && reuniaoPorId.get(conversa.reuniao_id) ? [reuniaoPorId.get(conversa.reuniao_id)!] : []),
          ...(cardId ? reunioesDoCardPor.get(cardId) ?? [] : []),
        ];
        const reuniao = reuniaoQueVale([...new Map(candidatas.map((r) => [r.id, r])).values()]);
        const posicao = posicaoNoFunil({
          loja: {
            status: loja.status, nome: nomeDaLoja(loja), respondeu_em: loja.respondeu_em,
            primeiro_contato_em: loja.primeiro_contato_em, contatos: loja.contatos,
          },
          conversa, reuniao, card,
        }, agora);
        linhas.push({
          loja, conversa, reuniao, card, posicao,
          mexeuEm: maisRecente(loja.ultimo_contato_em, loja.respondeu_em, conversa?.atualizado_em, loja.atualizada_em),
          teste: deTeste.has(soDigitos(loja.telefone)),
        });
      }
      linhas.sort((a, b) => b.mexeuEm.localeCompare(a.mexeuEm));
      return { linhas, naFila: naFila ?? 0, cortado: lojas.length >= PAGINA * MAX_PAGINAS };
    },
    refetchInterval: 60_000,
  });

/** O nome que a mensagem usou (corrigido à mão quando o do portal veio torto). */
export function nomeDaLoja(l: Pick<LojaDoFunil, 'nome' | 'dados'>): string {
  const corrigido = l.dados?.nome_mensagem;
  return typeof corrigido === 'string' && corrigido.trim() ? corrigido.trim() : l.nome;
}
