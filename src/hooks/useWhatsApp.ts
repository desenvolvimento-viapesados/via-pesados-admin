import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Dados da aba de WhatsApp.
 *
 * Tempo real não é enfeite aqui: sem ele, mensagem que chega enquanto a tela
 * está aberta só aparece se alguém recarregar — e quem está atendendo não
 * recarrega, fica olhando. O canal do Postgres avisa e o cache invalida.
 */

export type Instancia = {
  id: string; nome: string; telefone: string | null;
  origem: 'evolution' | 'cloud_api';
  evolution_instance: string | null;
  dono_nome: string | null;
  connection_state: string | null;
  precisa_qr: boolean;
};

export type Conversa = {
  id: string; instancia_id: string | null; telefone: string;
  nome: string | null; foto_url: string | null;
  ultima_mensagem: string | null; ultima_mensagem_em: string | null;
  ultima_direcao: string | null; nao_lidas: number; fixada: boolean;
  client_id: string | null; prospect_id: string | null;
};

export type Mensagem = {
  id: string; conversa_id: string; direcao: 'entrada' | 'saida';
  tipo: string; conteudo: string | null; media_url: string | null;
  status: string | null; enviada_por_nome: string | null; created_at: string;
};

async function chamar(acao: string, corpo: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wa-acao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify({ acao, ...corpo }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error || 'Falhou');
  return d;
}

export const useInstancias = () =>
  useQuery({
    queryKey: ['wa', 'instancias'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wa_instancias')
        .select('*').eq('is_active', true).order('origem').order('nome');
      if (error) throw error;
      return (data ?? []) as Instancia[];
    },
  });

export const useConversas = (instanciaId: string | null) =>
  useQuery({
    queryKey: ['wa', 'conversas', instanciaId ?? 'todas'],
    queryFn: async () => {
      let q = supabase.from('wa_conversas').select('*')
        .order('fixada', { ascending: false })
        .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
        .limit(200);
      if (instanciaId) q = q.eq('instancia_id', instanciaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Conversa[];
    },
  });

export const useMensagens = (conversaId: string | null) =>
  useQuery({
    queryKey: ['wa', 'mensagens', conversaId],
    enabled: !!conversaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('wa_mensagens')
        .select('*').eq('conversa_id', conversaId!)
        .order('created_at', { ascending: true }).limit(500);
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
  });

export function useEnviar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { conversa_id: string; texto: string }) => chamar('enviar', v),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['wa', 'mensagens', v.conversa_id] });
      qc.invalidateQueries({ queryKey: ['wa', 'conversas'] });
    },
  });
}

export const useAcaoWa = () => useMutation({
  mutationFn: (v: { acao: string } & Record<string, unknown>) => {
    const { acao, ...resto } = v;
    return chamar(acao, resto);
  },
});

/** Mensagem nova chegando: invalida o que estiver na tela. */
export function useTempoReal(conversaId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    const canal = supabase.channel('wa-tempo-real')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_mensagens' }, (p) => {
        const nova = (p.new ?? {}) as { conversa_id?: string };
        qc.invalidateQueries({ queryKey: ['wa', 'conversas'] });
        if (nova.conversa_id) qc.invalidateQueries({ queryKey: ['wa', 'mensagens', nova.conversa_id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversas' }, () => {
        qc.invalidateQueries({ queryKey: ['wa', 'conversas'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [qc, conversaId]);
}
