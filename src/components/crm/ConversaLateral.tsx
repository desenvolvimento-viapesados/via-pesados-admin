import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useAcaoWa, useInstancias, useMensagens, useTempoReal, type Conversa,
} from '@/hooks/useWhatsApp';
import {
  useAssistenteConfig, useAssistenteDaConversa, useTempoRealDoAssistente, useTurnosDaConversa,
} from '@/hooks/useAssistente';
import { ControleDoAssistente, RascunhoDoAssistente } from './AssistenteNaConversa';
import { CampoDeEscrever, Mensagens, fone } from './WhatsAppTab';
import { WaAvatar } from './wa/WaAvatar';

/** De quem é a conversa: pelo id dela, pelo card ou, na falta dos dois, pelo telefone. */
export type AlvoDaConversa = { nome: string; conversaId?: string | null; prospectId?: string | null; telefone?: string | null };

/**
 * A conversa numa gaveta à direita, sem sair da tela em que se está (pedido do dono, 17/11/2026:
 * "um botão com a logo do WhatsApp para que eu abra o menu lateral e consiga ver o chat").
 *
 * Acha a conversa pelo id; sem id, pelo vínculo com o card; sem vínculo, pelo telefone (os 8
 * últimos dígitos, para o nono dígito não atrapalhar). Havendo mais de uma, abre a mais recente.
 */
export function ConversaLateral({ alvo, onFechar }: { alvo: AlvoDaConversa; onFechar: () => void }) {
  const navigate = useNavigate();
  const digitos = (alvo.telefone ?? '').replace(/\D/g, '');

  const { data: conversa = null, isLoading } = useQuery({
    queryKey: ['wa', 'conversa-lateral', alvo.conversaId ?? '', alvo.prospectId ?? '', digitos],
    queryFn: async () => {
      if (alvo.conversaId) {
        const direta = await supabase.from('wa_conversas').select('*').eq('id', alvo.conversaId).maybeSingle();
        if (direta.error) throw direta.error;
        if (direta.data) return direta.data as Conversa;
      }
      if (alvo.prospectId) {
        const ligada = await supabase.from('wa_conversas').select('*')
          .eq('prospect_id', alvo.prospectId).order('ultima_mensagem_em', { ascending: false, nullsFirst: false }).limit(1);
        if (ligada.error) throw ligada.error;
        if (ligada.data?.length) return ligada.data[0] as Conversa;
      }
      if (digitos.length < 10) return null;
      const ddd = (digitos.startsWith('55') && digitos.length >= 12 ? digitos.slice(2) : digitos).slice(0, 2);
      const pelo = await supabase.from('wa_conversas').select('*')
        .like('telefone', `%${digitos.slice(-8)}`).order('ultima_mensagem_em', { ascending: false, nullsFirst: false });
      if (pelo.error) throw pelo.error;
      const doMesmoDdd = (pelo.data ?? []).find((c) => (c.telefone.startsWith('55') ? c.telefone.slice(2) : c.telefone).startsWith(ddd));
      return (doMesmoDdd ?? null) as Conversa | null;
    },
  });

  const conversaId = conversa?.id ?? null;
  const { data: mensagens = [] } = useMensagens(conversaId);
  const { data: instancias = [] } = useInstancias();
  const instancia = instancias.find((i) => i.id === conversa?.instancia_id) ?? null;
  const acao = useAcaoWa();
  useTempoReal(conversaId);

  const { data: config } = useAssistenteConfig();
  const { data: assistente } = useAssistenteDaConversa(conversaId);
  const { data: turnos } = useTurnosDaConversa(conversaId);
  useTempoRealDoAssistente(conversaId);
  const rascunho = turnos?.rascunho ?? null;

  const ultimaEntradaEm = useMemo(() => {
    for (let i = mensagens.length - 1; i >= 0; i--) if (mensagens[i].direcao === 'entrada') return mensagens[i].created_at;
    return null;
  }, [mensagens]);

  // Abrir a conversa aqui também conta como lida, igual na aba WhatsApp.
  useEffect(() => {
    if (conversa && conversa.nao_lidas > 0) acao.mutate({ acao: 'ler', conversa_id: conversa.id });
  }, [conversa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  const abrirNoWhatsApp = () => conversa && navigate(`/crm?tab=whatsapp&conversa=${conversa.id}`);
  const nome = alvo.nome;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in-0" onClick={onFechar} />
      <aside className="relative h-full w-full sm:w-[460px] flex flex-col bg-[var(--wa-fundo)] border-l border-[var(--wa-linha)] shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="bg-[var(--wa-barra)] border-b border-[var(--wa-linha-fraca)] shrink-0">
          <div className="flex items-center px-3 gap-2.5 h-14">
            <WaAvatar name={conversa?.nome || nome} src={conversa?.foto_url ?? null} className="w-10 h-10 shrink-0" size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-[var(--wa-texto)] font-bold truncate">{nome}</div>
              <div className="text-[var(--wa-texto2)] text-xs truncate">
                {conversa ? fone(conversa.telefone) : digitos ? fone(digitos.length >= 12 ? digitos : `55${digitos}`) : 'Sem WhatsApp no cadastro'}
                {instancia && ` · ${instancia.nome}`}
              </div>
            </div>
            {conversa && (
              <ControleDoAssistente
                conversaId={conversa.id}
                telefone={conversa.telefone}
                oficial={instancia?.origem === 'ycloud'}
                assistente={assistente}
                config={config}
                painelAberto={false}
                onPainel={abrirNoWhatsApp}
              />
            )}
            {conversa && (
              <button
                onClick={abrirNoWhatsApp}
                title="Abrir na aba WhatsApp"
                className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-[var(--wa-texto2)] hover:bg-[var(--wa-realce-forte)] hover:text-[var(--wa-texto)] transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onFechar}
              title="Fechar"
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-[var(--wa-texto2)] hover:bg-[var(--wa-realce-forte)] hover:text-[var(--wa-texto)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--wa-texto2)]" /></div>
        ) : !conversa ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-1">
            <p className="text-[var(--wa-texto)] text-sm font-medium">Ainda não há conversa com este contato</p>
            <p className="text-[var(--wa-texto2)] text-xs">
              {digitos ? 'Quando ele escrever ou receber uma mensagem, a conversa aparece aqui.' : 'Coloque o WhatsApp no cadastro para a conversa aparecer.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 flex flex-col">
              <Mensagens conversaId={conversa.id} mensagens={mensagens} />
            </div>
            {rascunho && (
              <div className="border-t border-[var(--wa-linha-fraca)] bg-[var(--wa-barra)]">
                <RascunhoDoAssistente
                  conversaId={conversa.id}
                  turno={rascunho}
                  config={config}
                  assistente={assistente}
                  ultimaEntradaEm={ultimaEntradaEm}
                  oficial={!!instancia && instancia.origem !== 'evolution'}
                />
              </div>
            )}
            <CampoDeEscrever conversaId={conversa.id} comAssistente={!!assistente && assistente.modo !== 'desligado'} />
          </>
        )}
      </aside>
    </div>
  );
}
