import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, Send, QrCode, RefreshCw, ChevronDown, Check, Settings2, Radio, Bot, Pin, ArrowLeft, Smile,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import {
  useInstancias, useConversas, useMensagens, useEnviar, useAcaoWa, useTempoReal,
  type Conversa, type Instancia, type Mensagem,
} from '@/hooks/useWhatsApp';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useAssistenteConfig, useAssistenteDaConversa, useTurnosDaConversa, useRascunhosEsperando,
  useTempoRealDoAssistente,
} from '@/hooks/useAssistente';
import {
  ControleDoAssistente, RascunhoDoAssistente, PainelDoAssistente, CorpoDaMensagem,
} from './AssistenteNaConversa';
import { WaAvatar } from './wa/WaAvatar';
import { ChatsFilledIcon, SearchAltIcon } from './wa/RepoIcons';
import viaCrmLogoEscuro from '@/assets/via-crm-logo-dark.png';
import viaCrmLogoClaro from '@/assets/via-crm-logo-light.png';

/**
 * WhatsApp da Via Pesados.
 *
 * O visual é cópia do WhatsApp do sistema do lojista (pedido do dono em 16/11/2026: "deixa
 * igualzinho"): trilho de ícones, lista com abas, balões verde e branco sobre o fundo do
 * WhatsApp, a mesma paleta --wa-* nos dois temas. O que só existe aqui continua: o Davi
 * (controle, rascunho e painel), a troca de número e o QR.
 *
 * Abre no número oficial (YCloud): é por ele que saem a prospecção e os avisos, e é onde o
 * dono quer olhar primeiro.
 */

export const fone = (t: string) => {
  const d = String(t).replace(/\D/g, '');
  const n = d.startsWith('55') ? d.slice(2) : d;
  if (n.length < 10) return t;
  return `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}`;
};

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

/** Na lista: hora se foi hoje, dia/mês se não. */
function quandoNaLista(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return hora(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** A régua de dia da conversa: Hoje, Ontem, o dia da semana ou a data. */
function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((hoje.getTime() - dia.getTime()) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const mesmoDia = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

/** Quem escreveu a mensagem que saiu, quando não foi digitada aqui sem nome. */
function remetente(m: Mensagem): string | null {
  if (m.direcao !== 'saida') return null;
  if (m.turno_id || m.enviada_por_nome === 'Assistente') return 'Davi';
  return m.enviada_por_nome || null;
}

/* "Responder" (18/11/2026): a caixa do número oficial tem mais de cem conversas em que só a nossa
   mensagem de prospecção saiu. Este filtro deixa só aquelas em que a última palavra é do cliente. */
type Filtro = 'todas' | 'responder' | 'nao-lidas' | 'fixadas';
const ABAS: { id: Filtro; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'responder', rotulo: 'Responder' },
  { id: 'nao-lidas', rotulo: 'Não lidas' },
  { id: 'fixadas', rotulo: 'Fixadas' },
];

const EMOJIS = [
  '😀','😂','😍','🥰','😎','🤔','😢','😡','🙏','👍','👎','❤️',
  '🔥','✅','⭐','🎉','💯','🚀','💪','🤝','👋','😊','🫡','🤣',
  '😭','😤','🥹','😇','🤩','😏','😒','🙄','😳','🤯','😱','🥺',
  '🫶','💙','💚','💛','🧡','💜','🖤','🤍','💔','💸','🎊','🎁',
  '🚗','🚛','🏎️','⚡','🔧','📞','📱','💻','📊','✍️','📝','🔑',
];

export function WhatsAppTab({ newOpen, onCloseNew }: { newOpen: boolean; onCloseNew: () => void }) {
  const { data: instancias = [], isLoading: carregandoInst } = useInstancias();
  /* ?numero=&conversa= abre direto numa conversa — é o "Abrir conversa" da
     aba Prospecção. */
  const [params] = useSearchParams();
  const [instanciaId, setInstanciaId] = useState<string | null>(params.get('numero'));
  /* ?conversa= sem ?numero= (o botão do aviso de reunião): o número é o da conversa. */
  const [numeroDaConversa, setNumeroDaConversa] = useState<'buscando' | 'pronto'>(
    params.get('conversa') && !params.get('numero') ? 'buscando' : 'pronto',
  );
  useEffect(() => {
    const c = params.get('conversa');
    if (!c || params.get('numero')) return;
    supabase.from('wa_conversas').select('instancia_id').eq('id', c).maybeSingle()
      .then(({ data }) => { if (data?.instancia_id) setInstanciaId(data.instancia_id); setNumeroDaConversa('pronto'); },
        () => setNumeroDaConversa('pronto'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* Sem número escolhido, abre no oficial (YCloud): é por ele que saem a prospecção e os
     avisos. Antes abria no primeiro da lista em ordem alfabética de origem, que era o
     número antigo da API da Meta, parado desde setembro. */
  useEffect(() => {
    if (numeroDaConversa === 'pronto' && !instanciaId && instancias.length) {
      setInstanciaId((instancias.find((i) => i.origem === 'ycloud') ?? instancias[0]).id);
    }
  }, [instancias, instanciaId, numeroDaConversa]);
  const [conversaId, setConversaId] = useState<string | null>(params.get('conversa'));
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [qr, setQr] = useState<{ instancia: Instancia; imagem: string | null; codigo: string | null } | null>(null);
  const [novoAqui, setNovoAqui] = useState(false);
  const fecharNovo = () => { setNovoAqui(false); onCloseNew(); };

  const { data: conversas = [], isLoading: carregandoConv } = useConversas(instanciaId);
  const { data: mensagens = [] } = useMensagens(conversaId);
  const acao = useAcaoWa();
  useTempoReal(conversaId);

  /* O assistente de vendas desta conversa: modo, etapa, rascunho. */
  const { data: configAssistente } = useAssistenteConfig();
  const { data: assistente } = useAssistenteDaConversa(conversaId);
  const { data: turnos } = useTurnosDaConversa(conversaId);
  const { data: comRascunho } = useRascunhosEsperando();
  useTempoRealDoAssistente(conversaId);
  const [painelAberto, setPainelAberto] = useState(false);
  const rascunho = turnos?.rascunho ?? null;

  /* A conversa aberta pelo link (?conversa=) pode estar fora das 200 mais recentes da lista. */
  const naLista = conversas.find((c) => c.id === conversaId) ?? null;
  const { data: foraDaLista = null } = useQuery({
    queryKey: ['wa', 'conversa', conversaId],
    enabled: !!conversaId && !naLista && !carregandoConv,
    queryFn: async () => {
      const { data, error } = await supabase.from('wa_conversas').select('*').eq('id', conversaId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Conversa | null;
    },
  });
  const conversa = naLista ?? (foraDaLista && foraDaLista.instancia_id === instanciaId ? foraDaLista : null);
  const instAtual = instancias.find((i) => i.id === (conversa?.instancia_id ?? instanciaId)) ?? null;

  /* A janela de 24h da Meta conta da última mensagem da loja. */
  const ultimaEntradaEm = useMemo(() => {
    for (let i = mensagens.length - 1; i >= 0; i--) if (mensagens[i].direcao === 'entrada') return mensagens[i].created_at;
    return null;
  }, [mensagens]);

  // Abrir conversa zera o não lidas — no servidor, para valer entre abas.
  useEffect(() => {
    if (!conversaId) return;
    const c = conversas.find((x) => x.id === conversaId);
    if (c && c.nao_lidas > 0) acao.mutate({ acao: 'ler', conversa_id: conversaId });
  }, [conversaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      if (filtro === 'responder' && c.ultima_direcao !== 'entrada') return false;
      if (filtro === 'nao-lidas' && !(c.nao_lidas > 0)) return false;
      if (filtro === 'fixadas' && !c.fixada) return false;
      if (!q) return true;
      return (c.nome ?? '').toLowerCase().includes(q) || (!!q.replace(/\D/g, '') && c.telefone.includes(q.replace(/\D/g, '')));
    });
  }, [busca, conversas, filtro]);

  const conectar = async (inst: Instancia) => {
    try {
      const r = await acao.mutateAsync({ acao: 'conectar', instancia_id: inst.id }) as
        { qr?: string | null; codigo?: string | null };
      setQr({ instancia: inst, imagem: r.qr ?? null, codigo: r.codigo ?? null });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (carregandoInst) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>;
  }

  return (
    <div className="flex h-[calc(100vh-190px)] min-h-[420px] w-full min-w-0 overflow-hidden rounded-2xl border border-[var(--wa-linha)] bg-[var(--wa-fundo)]">
      {/* Trilho — só no computador */}
      <div className="hidden md:flex w-[52px] shrink-0 h-full">
        <Trilho />
      </div>

      {/* Lista — tela toda no celular enquanto nenhuma conversa está aberta */}
      <div className={cn('shrink-0 h-full min-h-0 flex-col border-r border-r-[var(--wa-linha)] md:w-[370px]',
        conversa ? 'hidden md:flex' : 'flex w-full')}>
        <div className="bg-[var(--wa-painel)] h-full border-l border-l-[var(--wa-linha-fraca)] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-3 shrink-0">
            <SeletorDeNumero
              instancias={instancias}
              selecionada={instanciaId}
              onSelecionar={(id) => { setInstanciaId(id); setConversaId(null); }}
              onNovo={() => setNovoAqui(true)}
              onConectar={conectar}
            />
          </div>

          <div className="relative mx-3 mb-2 shrink-0">
            <span className="text-[var(--wa-icone)] p-2 rounded-full absolute -top-1">
              <SearchAltIcon className="w-6 h-6" />
            </span>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="bg-[var(--wa-fundo)] w-full p-1 ps-14 rounded focus:outline-0 text-[var(--wa-icone)]"
              placeholder="Pesquisar"
            />
          </div>

          <div className="flex gap-2 px-3 pb-3 shrink-0">
            {ABAS.map((a) => (
              <button
                key={a.id}
                onClick={() => setFiltro(a.id)}
                className={cn('rounded-2xl px-3 py-1 text-sm transition-colors',
                  filtro === a.id
                    ? 'bg-[var(--wa-input)] text-[var(--wa-texto)]'
                    : 'bg-[var(--wa-fundo)] text-[var(--wa-texto2)] hover:text-[var(--wa-icone)]')}
              >
                {a.rotulo}
              </button>
            ))}
          </div>

          {/* Número da equipe caído: o aviso fica no topo da lista dele, com o conserto a um toque. */}
          {instancias
            .filter((i) => i.origem === 'evolution' && i.connection_state !== 'open' && i.id === instanciaId)
            .map((i) => (
              <button
                key={i.id}
                onClick={() => conectar(i)}
                className="mx-3 mb-2 p-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/25 text-left shrink-0"
              >
                <p className="text-[12px] font-medium text-amber-500">{i.nome} desconectado</p>
                <p className="text-[11px] text-[var(--wa-texto2)] mt-0.5">Toque para ler o QR Code</p>
              </button>
            ))}

          <div className="flex-1 overflow-y-auto">
            {carregandoConv && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-[var(--wa-texto2)]" /></div>}
            {filtradas.map((c) => {
              const nome = c.nome || fone(c.telefone);
              return (
                <div
                  key={c.id}
                  onClick={() => setConversaId(c.id)}
                  className={cn('flex gap-3 cursor-pointer transition-colors relative',
                    conversaId === c.id ? 'bg-[var(--wa-realce-forte)]' : 'hover:bg-[var(--wa-realce)]')}
                >
                  <span className="inline-flex m-3 shrink-0">
                    <WaAvatar name={nome} src={c.foto_url} className="w-12 h-12" size={48} />
                  </span>
                  <div className="flex-1 border-t border-[var(--wa-realce)] pt-5 pb-3 min-w-0 pe-2">
                    <div className="flex justify-between items-center gap-2">
                      <div className="text-[var(--wa-texto)] flex-1 min-w-0 truncate flex items-center gap-1.5">
                        {c.fixada && <Pin className="w-3 h-3 text-[var(--wa-texto2)] shrink-0" />}
                        <span className="truncate">{nome}</span>
                      </div>
                      <div className={cn('text-xs shrink-0', c.nao_lidas > 0 ? 'text-primary font-medium' : 'text-[var(--wa-texto2)]')}>
                        {quandoNaLista(c.ultima_mensagem_em)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[var(--wa-texto2)] text-sm truncate flex-1 min-w-0">
                        {c.ultima_mensagem || '—'}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {comRascunho?.has(c.id) && (
                          <span title="O Davi sugeriu uma resposta" className="flex items-center gap-0.5 text-[10px] font-semibold text-primary">
                            <Bot className="h-3 w-3" /> rascunho
                          </span>
                        )}
                        {c.nao_lidas > 0 && (
                          <div className="bg-primary text-primary-foreground rounded-full text-xs px-1.5 py-0.5 min-w-[20px] text-center font-semibold">
                            {c.nao_lidas}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!carregandoConv && !filtradas.length && (
              <div className="text-[var(--wa-texto2)] text-center py-10 text-sm">
                Nenhuma conversa encontrada
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conversa */}
      <div className={cn('min-w-0 h-full min-h-0 flex-col md:flex md:flex-1', conversa ? 'flex flex-1' : 'hidden')}>
        {!conversa ? <Vazio /> : (
          <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col bg-[var(--wa-fundo)]">
            <div className="bg-[var(--wa-barra)] border-b border-[var(--wa-linha-fraca)] shrink-0" style={{ boxShadow: '0 1px 0 var(--wa-realce)' }}>
              <div className="flex items-center px-3 gap-2.5 h-14">
                <button
                  onClick={() => setConversaId(null)}
                  className="md:hidden shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-[var(--wa-texto2)] hover:bg-[var(--wa-realce-forte)] hover:text-[var(--wa-texto)] transition-colors"
                  title="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <WaAvatar name={conversa.nome || fone(conversa.telefone)} src={conversa.foto_url} className="w-10 h-10 shrink-0" size={40} />
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--wa-texto)] font-bold truncate">{conversa.nome || fone(conversa.telefone)}</div>
                  <div className="text-[var(--wa-texto2)] text-xs truncate">{fone(conversa.telefone)}</div>
                </div>
                <ControleDoAssistente
                  conversaId={conversa.id}
                  telefone={conversa.telefone}
                  oficial={instAtual?.origem === 'ycloud'}
                  assistente={assistente}
                  config={configAssistente}
                  painelAberto={painelAberto}
                  onPainel={() => setPainelAberto((v) => !v)}
                />
                {instAtual && (
                  <span className={cn('hidden md:inline shrink-0 text-[10.5px] px-2 py-1 rounded-lg border',
                    instAtual.origem !== 'evolution'
                      ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.08]'
                      : 'text-[var(--wa-texto2)] border-[var(--wa-linha)]')}>
                    {instAtual.nome}
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col border-r border-l border-[var(--wa-linha)]">
              <Mensagens conversaId={conversa.id} mensagens={mensagens} />
            </div>

            {rascunho && (
              <div className="border-t border-[var(--wa-linha-fraca)] bg-[var(--wa-barra)]">
                <RascunhoDoAssistente
                  conversaId={conversa.id}
                  turno={rascunho}
                  config={configAssistente}
                  assistente={assistente}
                  ultimaEntradaEm={ultimaEntradaEm}
                  oficial={!!instAtual && instAtual.origem !== 'evolution'}
                />
              </div>
            )}

            <CampoDeEscrever
              conversaId={conversa.id}
              comAssistente={!!assistente && assistente.modo !== 'desligado'}
            />
          </div>
        )}
      </div>

      {conversa && painelAberto && (
        <PainelDoAssistente
          conversaId={conversa.id}
          assistente={assistente}
          prospectId={conversa.prospect_id}
          onFechar={() => setPainelAberto(false)}
        />
      )}

      <QrDialog qr={qr} onClose={() => setQr(null)} onRefazer={conectar} />
      <NovoNumeroDialog open={newOpen || novoAqui} onClose={fecharNovo} />
    </div>
  );
}

/** O trilho de ícones da esquerda, como no WhatsApp Web: conversas no alto, você embaixo. */
function Trilho() {
  const { member, user } = useAuth();
  const nome = member?.full_name || user?.email || 'Eu';
  return (
    <div className="h-full w-full bg-[var(--wa-painel)] border-r border-r-[var(--wa-linha-fraca)]">
      <div className="flex flex-col pt-2 pb-4 items-center justify-between h-full">
        <div className="mt-2">
          <button className="p-2 rounded-full bg-[var(--wa-painel)] text-[var(--wa-icone)]" aria-label="Conversas">
            <ChatsFilledIcon className="w-6 h-6" />
          </button>
        </div>
        <WaAvatar
          name={nome}
          src={member?.avatar_url}
          className="w-8 h-8 ring-2 ring-[var(--wa-linha-fraca)]"
          size={32}
        />
      </div>
    </div>
  );
}

function Vazio() {
  const { theme } = useTheme();
  return (
    <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col items-center justify-center gap-8 select-none" style={{ background: 'var(--wa-chat)' }}>
      <div className="relative flex items-center justify-center">
        <div className="absolute rounded-full" style={{ width: 260, height: 260, background: 'radial-gradient(circle, rgba(240,112,32,0.07) 0%, transparent 70%)' }} />
        <img src={theme === 'dark' ? viaCrmLogoEscuro : viaCrmLogoClaro} alt="Via CRM" draggable={false} style={{ width: 180, position: 'relative', zIndex: 1 }} />
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-[var(--wa-texto)] font-semibold text-base tracking-wide">Via CRM</p>
        <p className="text-[var(--wa-texto2)] text-sm text-center" style={{ maxWidth: 260 }}>
          Selecione uma conversa na lista ao lado para começar
        </p>
      </div>
      <div className="rounded-full" style={{ width: 48, height: 3, background: 'var(--primary-hex)', opacity: 0.5 }} />
    </div>
  );
}

/** Os balões, com a régua do dia. Quem mandou (Davi, aviso automático, alguém da equipe) vai no alto do balão. */
export function Mensagens({ conversaId, mensagens }: { conversaId: string; mensagens: Mensagem[] }) {
  const rolagem = useRef<HTMLDivElement>(null);
  const rolouPara = useRef<string | null>(null);

  useEffect(() => {
    const el = rolagem.current;
    if (!el || !mensagens.length) return;
    if (rolouPara.current !== conversaId) {
      rolouPara.current = conversaId;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) el.scrollTop = el.scrollHeight;
  }, [conversaId, mensagens.length]);

  return (
    <div ref={rolagem} className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col" style={{ background: 'var(--wa-chat)' }}>
      {mensagens.map((m, i) => {
        const anterior = i > 0 ? mensagens[i - 1] : null;
        const novoDia = !anterior || !mesmoDia(anterior.created_at, m.created_at);
        const outroLado = !anterior || anterior.direcao !== m.direcao;
        const minha = m.direcao === 'saida';
        const quem = remetente(m);
        return (
          <div key={m.id} className={!novoDia && outroLado ? 'mt-3' : 'mt-0.5'}>
            {novoDia && (
              <div className="flex items-center justify-center my-3">
                <span className="bg-[var(--wa-fundo)] text-[var(--wa-texto2)] text-xs rounded-lg px-3 py-1 shadow">
                  {rotuloDoDia(m.created_at)}
                </span>
              </div>
            )}
            <div className={cn('flex mb-[2px]', minha && 'justify-end')}>
              <div className="relative w-fit max-w-[75%]">
                <div
                  className={cn('text-[var(--wa-texto)] text-sm rounded-lg p-1.5 px-2 flex flex-col gap-0.5 pe-14 min-w-[60px]',
                    minha ? 'bg-[var(--wa-balao-meu)]' : 'bg-[var(--wa-balao-dele)]')}
                  style={{ boxShadow: '0 1px .5px rgba(0,0,0,.13)' }}
                >
                  {quem && (
                    <span className="text-[11px] font-bold leading-tight flex items-center gap-1 mb-0.5 opacity-80">
                      {quem === 'Davi' && <Bot className="h-3 w-3" />}{quem}
                    </span>
                  )}
                  <CorpoDaMensagem m={m} saida={minha} />
                  <span className={cn('text-[.6875rem] absolute bottom-1 right-1.5 shrink-0',
                    minha ? 'text-[var(--wa-hora-minha)]' : 'text-[var(--wa-texto2)]')}>
                    {hora(m.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div className="h-2 shrink-0" />
    </div>
  );
}

/** O campo de escrever do WhatsApp. Só texto: o número oficial e a Evolution recebem
 *  texto por aqui; foto e áudio continuam saindo do celular. */
export function CampoDeEscrever({ conversaId, comAssistente }: { conversaId: string; comAssistente: boolean }) {
  const enviar = useEnviar();
  const [texto, setTexto] = useState('');
  const [emojis, setEmojis] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setTexto(''); setEmojis(false); }, [conversaId]);

  const mandar = async () => {
    const t = texto.trim();
    if (!t) return;
    setTexto('');
    setEmojis(false);
    try {
      await enviar.mutateAsync({ conversa_id: conversaId, texto: t });
    } catch (e) {
      setTexto(t); // devolve o texto: perder o que foi digitado é pior que o erro
      toast.error((e as Error).message);
    }
    campo.current?.focus();
  };

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar(); }
  };

  return (
    <div className="relative shrink-0 bg-[var(--wa-barra)] border-t border-[var(--wa-linha-fraca)]">
      {emojis && (
        <div className="absolute bottom-full left-0 right-0 bg-[var(--wa-barra)] border-t border-[var(--wa-linha-fraca)] p-2 z-10">
          <div className="grid grid-cols-12 gap-0.5 max-h-44 overflow-y-auto">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => { setTexto((v) => v + e); campo.current?.focus(); }}
                className="text-xl hover:bg-[var(--wa-linha)] rounded p-1 leading-none text-center"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => { setEmojis((v) => !v); campo.current?.focus(); }}
          className={cn('p-2 rounded-full transition-colors shrink-0',
            emojis ? 'text-[var(--wa-texto)]' : 'text-[var(--wa-icone)] hover:text-[var(--wa-texto)]')}
          aria-label="Emojis"
        >
          <Smile className="w-6 h-6" />
        </button>
        <div className="w-px h-6 bg-[var(--wa-linha)] shrink-0" />
        <div className="flex-1 min-w-0">
          <textarea
            ref={campo}
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={aoTeclar}
            className="bg-transparent w-full py-2 resize-none max-h-28 focus:outline-none text-[var(--wa-texto)] placeholder-[var(--wa-texto2)] text-sm"
            placeholder={comAssistente
              ? 'Digite uma mensagem (se você escrever, o Davi sai desta conversa)'
              : 'Digite uma mensagem'}
          />
        </div>
        <button
          onClick={mandar}
          disabled={!texto.trim() || enviar.isPending}
          className="p-2 rounded-full text-[var(--wa-texto)] hover:bg-[var(--wa-linha)] shrink-0 disabled:text-[var(--wa-icone)] disabled:hover:bg-transparent"
          aria-label="Enviar"
        >
          {enviar.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Troca de número, no formato do WhatsApp do lojista: o nome grande com chevron, e a lista
 * abrindo por baixo. Número caído ganha "Conectar" no lugar do ponto de estado.
 */
function SeletorDeNumero({
  instancias, selecionada, onSelecionar, onNovo, onConectar,
}: {
  instancias: Instancia[];
  selecionada: string | null;
  onSelecionar: (id: string | null) => void;
  onNovo: () => void;
  onConectar: (i: Instancia) => void;
}) {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const atual = instancias.find((i) => i.id === selecionada);
  const bruto = atual?.nome ?? 'WhatsApp';
  const titulo = bruto.length > 24 ? bruto.slice(0, 22) + '…' : bruto;

  return (
    <div ref={caixa} className="relative max-w-[90%]">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1 text-[var(--wa-texto)] text-2xl font-bold truncate hover:bg-[var(--wa-linha-fraca)] rounded-xl px-2 py-1 -ml-1 transition-colors group"
        aria-label="Trocar número"
      >
        <span className="truncate">{titulo}</span>
        <ChevronDown className={cn('w-4 h-4 shrink-0 text-[var(--wa-texto2)] group-hover:text-[var(--wa-texto)] transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="absolute z-50 mt-1.5 w-72 p-1.5 bg-[var(--wa-fundo)] border border-[var(--wa-linha)] shadow-xl rounded-xl">
          {instancias.map((i) => {
            const ligado = i.origem !== 'evolution' || i.connection_state === 'open';
            return (
              <ItemDoSeletor
                key={i.id}
                nome={i.nome}
                detalhe={i.telefone ? fone(i.telefone) : undefined}
                marcado={selecionada === i.id}
                ligado={ligado}
                oficial={i.origem !== 'evolution'}
                acao={!ligado && i.origem === 'evolution'
                  ? { rotulo: 'Conectar', ao: () => { onConectar(i); setAberto(false); } }
                  : undefined}
                onClick={() => { onSelecionar(i.id); setAberto(false); }}
              />
            );
          })}
          <div className="h-px bg-[var(--wa-linha-fraca)] my-1.5 mx-3" />
          {/* O canal oficial (avisos automáticos, modelos, diagnóstico) mora aqui, junto dos outros números. */}
          <button
            onClick={() => { setAberto(false); navigate('/whatsapp'); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--wa-linha-fraca)] transition-colors"
          >
            <span className="h-8 w-8 rounded-full bg-[var(--wa-input)] flex items-center justify-center shrink-0">
              <Radio className="h-3.5 w-3.5 text-[var(--wa-texto2)]" />
            </span>
            <span className="text-sm text-[var(--wa-texto2)]">Canal oficial: modelos e diagnóstico</span>
          </button>
          <button
            onClick={() => { onNovo(); setAberto(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--wa-linha-fraca)] transition-colors"
          >
            <span className="h-8 w-8 rounded-full bg-[var(--wa-input)] flex items-center justify-center shrink-0">
              <Settings2 className="h-3.5 w-3.5 text-[var(--wa-texto2)]" />
            </span>
            <span className="text-sm text-[var(--wa-texto2)]">Adicionar número da equipe</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ItemDoSeletor({
  nome, detalhe, marcado, ligado, oficial, acao, onClick,
}: {
  nome: string; detalhe?: string; marcado?: boolean;
  ligado?: boolean; oficial?: boolean;
  acao?: { rotulo: string; ao: () => void };
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer',
        marcado ? 'bg-[var(--wa-linha-fraca)]' : 'hover:bg-[var(--wa-linha-fraca)]')}
    >
      <WaAvatar name={nome} className="w-8 h-8 shrink-0" size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--wa-texto)] truncate">{nome}</p>
        {detalhe && <p className="text-[11px] text-[var(--wa-texto2)] truncate">{detalhe}</p>}
      </div>
      {acao ? (
        <button onClick={(e) => { e.stopPropagation(); acao.ao(); }} className="shrink-0 text-[11.5px] text-primary hover:underline">
          {acao.rotulo}
        </button>
      ) : ligado !== undefined ? (
        <span className={cn('shrink-0 h-2 w-2 rounded-full', ligado ? 'bg-[var(--wa-verde)]' : 'bg-[var(--wa-texto2)]/40')}
              title={ligado ? 'Conectado' : 'Desconectado'} />
      ) : null}
      {oficial && <span className="shrink-0 text-[9.5px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">API</span>}
      {marcado && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
    </div>
  );
}

function QrDialog({ qr, onClose, onRefazer }: {
  qr: { instancia: Instancia; imagem: string | null; codigo: string | null } | null;
  onClose: () => void;
  onRefazer: (i: Instancia) => void;
}) {
  if (!qr) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-[15px]">Conectar {qr.instancia.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1 text-center">
          {qr.imagem ? (
            <img src={qr.imagem} alt="QR Code" className="w-56 h-56 mx-auto rounded-xl bg-white p-2" />
          ) : (
            <div className="w-56 h-56 mx-auto rounded-xl bg-black/[0.04] dark:bg-white/[0.04] flex items-center justify-center">
              <QrCode className="h-8 w-8 text-foreground/20" />
            </div>
          )}
          <p className="text-[12px] text-foreground/50 leading-relaxed">
            No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
          </p>
          {/* O QR expira em segundos. Sem este botão, a pessoa fecha e reabre
              a tela toda para conseguir outro. */}
          <button
            onClick={() => onRefazer(qr.instancia)}
            className="text-[12px] text-primary hover:underline inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3 w-3" /> Gerar outro código
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NovoNumeroDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const acao = useAcaoWa();
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');

  const salvar = async () => {
    if (!nome.trim()) { toast.error('Informe de quem é o número'); return; }
    try {
      await acao.mutateAsync({ acao: 'nova', nome: nome.trim(), telefone });
      toast.success('Número cadastrado — agora conecte pelo QR');
      setNome(''); setTelefone(''); onClose();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (!open) return null;
  const campo = 'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] focus:outline-none focus:border-primary/50';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-[15px]">Novo número da equipe</DialogTitle></DialogHeader>
        <div className="space-y-2.5 pt-1">
          <input className={campo} placeholder="De quem é? ex: Kauã" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className={campo} placeholder="Telefone (opcional)" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          <p className="text-[11.5px] text-foreground/40 leading-relaxed">
            Cada pessoa da equipe conecta o próprio WhatsApp lendo um QR Code — o
            aparelho continua sendo dela, e as conversas aparecem aqui.
          </p>
          <button
            onClick={salvar}
            disabled={acao.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {acao.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Cadastrar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
