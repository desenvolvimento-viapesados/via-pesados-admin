import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateMeeting, useUpdateMeeting, useUpdateProspect, type Prospect } from '@/hooks/useAdmin';
import { useAssistenteConfig } from '@/hooks/useAssistente';
import { useEsteira } from '@/hooks/useEsteira';
import { useGarantirCard, useJaRespondi } from '@/hooks/useOportunidades';
import { LOJISTA_APP_URL, demoUrl } from '@/integrations/supabase/client';
import { telaDo, type ItemDaEsteira } from '@/lib/esteira';
import { NAO_APARECEU, diaFalado, horaFalada } from '@/lib/oportunidades';
import { DemoDialog } from '@/components/crm/AmostrasTab';
import { ConversaLateral } from '@/components/crm/ConversaLateral';
import { TelaDaLoja, type AcoesDaLoja } from '@/components/crm/esteira/TelaDaLoja';

/**
 * A esteira de uma loja, em tela cheia: `/crm/esteira/:id`. A tela que aparece é a do ponto em
 * que a loja está; cada resposta grava o que aconteceu e a próxima tela vem sozinha.
 */
export default function EsteiraDaLoja() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { member } = useAuth();
  const { itens, oportunidades, linhas, prospects, amostras, carregando } = useEsteira();
  const { data: cfg } = useAssistenteConfig();
  const garantir = useGarantirCard();
  const criarReuniao = useCreateMeeting();
  const mudarReuniao = useUpdateMeeting();
  const mudarCard = useUpdateProspect();
  const respondi = useJaRespondi();
  const [conversa, setConversa] = useState(false);
  const [amostraDe, setAmostraDe] = useState<string | null>(null);

  /* Depois da venda o card vira cliente e o endereço muda de `card:` para `cliente:`: acha pelos dois. */
  const item = useMemo((): ItemDaEsteira | null => {
    const direto = itens.find((i) => i.id === id);
    if (direto) return direto;
    const o = oportunidades.find((x) => x.id === id);
    if (!o) return null;
    const virouCliente = o.cardId ? itens.find((i) => i.cliente?.prospectId === o.cardId) : null;
    if (virouCliente) return virouCliente;
    /* Perdida: sai da esteira, mas a tela ainda diz por quê. */
    return { id: o.id, nome: o.nome, lugar: o.lugar, telefone: o.telefone, estacao: 'conversa', o, cliente: null, temAmostra: false, suaVez: false, fazer: o.passo.texto, mexeuEm: o.mexeuEm };
  }, [itens, oportunidades, id]);

  /* Na tela do pagamento, confere de 15 em 15 segundos se já entrou. */
  const esperandoPagar = item?.estacao === 'fechamento';
  useEffect(() => {
    if (!esperandoPagar) return;
    const t = setInterval(() => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['clients'] }); }, 15_000);
    return () => clearInterval(t);
  }, [esperandoPagar, qc]);

  if (carregando) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-foreground/30" /></div>;
  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-[15px] text-foreground/60">Não achei esta loja na esteira.</p>
        <button className="text-[14px] text-primary font-medium hover:underline" onClick={() => navigate('/crm?tab=esteira')}>Voltar para a esteira</button>
      </div>
    );
  }

  const o = item.o;
  const atualizar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['meetings'] }), qc.invalidateQueries({ queryKey: ['prospeccao'] }),
    qc.invalidateQueries({ queryKey: ['prospects'] }), qc.invalidateQueries({ queryKey: ['demos'] }),
  ]);
  const card = async (): Promise<Prospect> => garantir.mutateAsync({ o: o!, prospects, linhas });
  const reuniaoId = () => { if (!o?.reuniao) throw new Error('Esta loja não tem reunião marcada.'); return o.reuniao.id; };
  const amostra = o?.cardId ? amostras.get(o.cardId) ?? null : null;
  const token = item.cliente?.checkoutToken;

  const acoes: AcoesDaLoja = {
    voltar: () => navigate('/crm?tab=esteira'),
    conversa: () => setConversa(true),
    marcar: async (quando) => {
      const p = await card();
      await criarReuniao.mutateAsync({
        prospect_id: p.id, title: `Demonstração · ${item.nome}`, scheduled_at: quando.toISOString(),
        duration_min: cfg?.duracao_min ?? 15, kind: 'demo', status: 'agendada', meet_link: cfg?.link_reuniao || null, owner_id: member?.id ?? null,
      });
      if (p.stage === 'contato' || p.stage === 'amostra' || p.stage === 'oportunidade') await mudarCard.mutateAsync({ id: p.id, stage: 'reuniao' });
      await atualizar();
      toast.success(`Reunião marcada para ${diaFalado(quando)} às ${horaFalada(quando)}.`);
    },
    montarAmostra: async () => { try { setAmostraDe((await card()).id); } catch { toast.error('Não consegui abrir a amostra desta loja.'); } },
    apareceu: async () => { await mudarReuniao.mutateAsync({ id: reuniaoId(), status: 'realizada' }); await atualizar(); },
    naoApareceu: async () => {
      await mudarReuniao.mutateAsync({ id: reuniaoId(), status: 'cancelada', outcome: NAO_APARECEU });
      await atualizar();
      toast.success('Anotado. Ela voltou para Conversa: marque outra.');
    },
    remarcar: async (quando) => {
      await mudarReuniao.mutateAsync({ id: reuniaoId(), scheduled_at: quando.toISOString(), status: 'agendada', outcome: null });
      await atualizar();
      toast.success(`Remarcada para ${diaFalado(quando)} às ${horaFalada(quando)}.`);
    },
    fechou: async () => { try { navigate(`/crm/venda/${(await card()).id}?de=esteira`); } catch { toast.error('Não consegui abrir a venda.'); } },
    vaiTestar: async () => { try { navigate(`/crm/teste/${(await card()).id}?de=esteira`); } catch { toast.error('Não consegui abrir o teste.'); } },
    ficouDePensar: async () => {
      if (o?.reuniao) await mudarReuniao.mutateAsync({ id: o.reuniao.id, outcome: 'Ficou de decidir' });
      toast.success('Anotado. Em dois dias ela volta para você cobrar.');
      navigate('/crm?tab=esteira');
    },
    naoQuer: async (motivo) => {
      const p = await card();
      await mudarCard.mutateAsync({ id: p.id, stage: 'perdido', lost_reason: motivo });
      await atualizar();
      toast.success('Anotado. Saiu da esteira.');
      navigate('/crm?tab=esteira');
    },
    abrirCobranca: () => item.cliente && navigate(`/clientes/${item.cliente.id}/cobranca`),
    abrirImplantacao: () => navigate(item.cliente ? `/clientes/${item.cliente.id}/onboarding` : '/crm?tab=implantacao'),
    abrirFicha: () => item.cliente && navigate(`/clientes/${item.cliente.id}`),
    jaRespondi: async () => { await respondi.mutateAsync((await card()).id); toast.success('Anotado. Ela não está mais esperando você.'); },
  };

  return (
    <>
      <TelaDaLoja
        key={item.id}
        item={item}
        tela={telaDo(item)}
        acoes={acoes}
        dados={{
          amostraUrl: amostra ? amostra.demo_url ?? demoUrl(amostra.slug) : null,
          linkDePagamento: token ? `${LOJISTA_APP_URL}/bemvindo/${token}` : null,
        }}
      />
      {conversa && (
        <ConversaLateral alvo={{ nome: item.nome, conversaId: o?.conversaId, prospectId: o?.cardId ?? item.cliente?.prospectId, telefone: item.telefone }} onFechar={() => setConversa(false)} />
      )}
      {amostraDe && (
        <DemoDialog open onClose={() => { setAmostraDe(null); atualizar(); }} defaultProspectId={amostraDe} demo={amostra ?? undefined} />
      )}
    </>
  );
}
