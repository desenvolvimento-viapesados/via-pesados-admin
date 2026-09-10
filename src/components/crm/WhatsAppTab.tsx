import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Send, Search, Plus, QrCode, RefreshCw, ChevronDown, Check, Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useInstancias, useConversas, useMensagens, useEnviar, useAcaoWa, useTempoReal,
  type Conversa, type Instancia,
} from '@/hooks/useWhatsApp';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * WhatsApp da Via Pesados.
 *
 * Duas origens na mesma tela, e a diferença entre elas importa para quem
 * atende: pelo número da API oficial, fora da janela de 24h a Meta só aceita
 * template. Por isso a origem aparece no cabeçalho da conversa, e o servidor
 * devolve o motivo em português quando recusa.
 */

const fone = (t: string) => {
  const d = String(t).replace(/\D/g, '');
  const n = d.startsWith('55') ? d.slice(2) : d;
  if (n.length < 10) return t;
  return `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}`;
};

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export function WhatsAppTab({ newOpen, onCloseNew }: { newOpen: boolean; onCloseNew: () => void }) {
  const { data: instancias = [], isLoading: carregandoInst } = useInstancias();
  const [instanciaId, setInstanciaId] = useState<string | null>(null);
  /* Sempre num número concreto. Uma visão "todas" misturaria caixas de
     pessoas diferentes na mesma lista — e quem atende precisa saber por qual
     número a conversa entrou antes de responder, porque a regra das 24h só
     vale num deles. */
  useEffect(() => {
    if (!instanciaId && instancias.length) setInstanciaId(instancias[0].id);
  }, [instancias, instanciaId]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [texto, setTexto] = useState('');
  const [qr, setQr] = useState<{ instancia: Instancia; imagem: string | null; codigo: string | null } | null>(null);

  const { data: conversas = [], isLoading: carregandoConv } = useConversas(instanciaId);
  const { data: mensagens = [] } = useMensagens(conversaId);
  const enviar = useEnviar();
  const acao = useAcaoWa();
  useTempoReal(conversaId);

  const conversa = conversas.find((c) => c.id === conversaId) ?? null;
  const instAtual = instancias.find((i) => i.id === (conversa?.instancia_id ?? instanciaId)) ?? null;

  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens.length, conversaId]);

  // Abrir conversa zera o não lidas — no servidor, para valer entre abas.
  useEffect(() => {
    if (!conversaId) return;
    const c = conversas.find((x) => x.id === conversaId);
    if (c && c.nao_lidas > 0) acao.mutate({ acao: 'ler', conversa_id: conversaId });
  }, [conversaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return conversas;
    return conversas.filter((c) =>
      (c.nome ?? '').toLowerCase().includes(q) || c.telefone.includes(q.replace(/\D/g, '')));
  }, [busca, conversas]);

  /* Agrupa por dia: sem a régua de data, uma thread longa vira um bloco só e
     ninguém acha onde parou ontem. */
  const porDia = useMemo(() => {
    const g: Array<{ dia: string; itens: typeof mensagens }> = [];
    for (const m of mensagens) {
      const d = dia(m.created_at);
      const ultimo = g[g.length - 1];
      if (ultimo?.dia === d) ultimo.itens.push(m);
      else g.push({ dia: d, itens: [m] });
    }
    return g;
  }, [mensagens]);

  const mandar = async () => {
    const t = texto.trim();
    if (!t || !conversaId) return;
    setTexto('');
    try {
      await enviar.mutateAsync({ conversa_id: conversaId, texto: t });
    } catch (e) {
      setTexto(t); // devolve o texto: perder o que foi digitado é pior que o erro
      toast.error((e as Error).message);
    }
  };

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
    <div className="flex h-[calc(100vh-190px)] min-h-[420px] rounded-2xl overflow-hidden border border-black/[0.08] dark:border-white/[0.08]">
      {/* ── Lista de conversas ────────────────────────────── */}
      <div className="w-[320px] shrink-0 border-r border-black/[0.08] dark:border-white/[0.08] flex flex-col">
        <div className="p-3 border-b border-black/[0.08] dark:border-white/[0.08] space-y-2.5">
          <SeletorDeNumero
            instancias={instancias}
            selecionada={instanciaId}
            onSelecionar={(id) => { setInstanciaId(id); setConversaId(null); }}
            onNovo={onCloseNew}
            onConectar={conectar}
          />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/30" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar"
              className="w-full h-9 pl-8 pr-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] text-[12.5px] focus:outline-none"
            />
          </div>
        </div>

        {/* Aviso só do número que está sendo visto — ou de todos, quando a
            visão é "Todos os números". Avisar sobre um número enquanto se
            trabalha em outro é ruído: a pessoa não vai parar o atendimento
            para resolver, e o alerta perde o efeito quando importar. O
            seletor lá em cima já mostra "Conectar" ao lado de quem caiu. */}
        {instancias
          .filter((i) => i.origem === 'evolution' && i.connection_state !== 'open')
          .filter((i) => i.id === instanciaId)
          .map((i) => (
          <button
            key={i.id}
            onClick={() => conectar(i)}
            className="mx-2.5 mt-2.5 p-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/25 text-left"
          >
            <p className="text-[12px] font-medium text-amber-500">{i.nome} desconectado</p>
            <p className="text-[11px] text-foreground/45 mt-0.5">Toque para ler o QR Code</p>
          </button>
        ))}

        <div className="flex-1 overflow-y-auto">
          {carregandoConv && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></div>}
          {!carregandoConv && !filtradas.length && (
            <p className="text-[12px] text-foreground/35 text-center px-4 py-10 leading-relaxed">
              Nenhuma conversa ainda.<br />Elas aparecem aqui quando alguém escrever para um dos números.
            </p>
          )}
          {filtradas.map((c) => (
            <button
              key={c.id}
              onClick={() => setConversaId(c.id)}
              className={cn('w-full text-left px-3 py-2.5 border-b border-black/[0.05] dark:border-white/[0.04] transition-colors',
                conversaId === c.id ? 'bg-primary/[0.08]' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium text-foreground truncate">{c.nome || fone(c.telefone)}</span>
                <span className="text-[10.5px] text-foreground/35 shrink-0">{hora(c.ultima_mensagem_em)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-[11.5px] text-foreground/45 truncate">
                  {c.ultima_direcao === 'saida' && <span className="text-foreground/30">você: </span>}
                  {c.ultima_mensagem || '—'}
                </span>
                {c.nao_lidas > 0 && (
                  <span className="shrink-0 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                    {c.nao_lidas}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Conversa ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!conversa ? (
          <div className="flex-1 flex items-center justify-center px-8">
            <p className="text-[13px] text-foreground/30 text-center leading-relaxed">
              Escolha uma conversa à esquerda.
            </p>
          </div>
        ) : (
          <>
            <header className="h-14 px-4 border-b border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground truncate">{conversa.nome || fone(conversa.telefone)}</p>
                <p className="text-[11px] text-foreground/40">{fone(conversa.telefone)}</p>
              </div>
              {instAtual && (
                <span className={cn('shrink-0 text-[10.5px] px-2 py-1 rounded-lg border',
                  instAtual.origem === 'cloud_api'
                    ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/[0.08]'
                    : 'text-foreground/50 border-black/[0.1] dark:border-white/[0.12]')}>
                  {instAtual.nome}
                </span>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-black/[0.015] dark:bg-black/[0.25]">
              {porDia.map(({ dia: d, itens }) => (
                <div key={d} className="space-y-1.5">
                  <p className="text-center text-[10.5px] text-foreground/30 py-1">{d}</p>
                  {itens.map((m) => (
                    <div key={m.id} className={cn('flex', m.direcao === 'saida' ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[75%] rounded-2xl px-3 py-2',
                        m.direcao === 'saida'
                          ? 'bg-primary/90 text-primary-foreground rounded-br-md'
                          : 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground rounded-bl-md')}>
                        <p className="text-[13px] whitespace-pre-wrap break-words">{m.conteudo}</p>
                        <p className={cn('text-[10px] mt-1 text-right',
                          m.direcao === 'saida' ? 'text-primary-foreground/60' : 'text-foreground/35')}>
                          {m.enviada_por_nome ? `${m.enviada_por_nome.split(' ')[0]} · ` : ''}{hora(m.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={fim} />
            </div>

            <div className="p-3 border-t border-black/[0.08] dark:border-white/[0.08] flex items-end gap-2">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar(); } }}
                rows={1}
                placeholder="Escreva uma mensagem"
                className="flex-1 max-h-28 px-3 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] text-[13px] resize-none focus:outline-none"
              />
              <button
                onClick={mandar}
                disabled={!texto.trim() || enviar.isPending}
                className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 flex items-center justify-center"
              >
                {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </>
        )}
      </div>

      <QrDialog qr={qr} onClose={() => setQr(null)} onRefazer={conectar} />
      <NovoNumeroDialog open={newOpen} onClose={onCloseNew} />
    </div>
  );
}

/**
 * Troca de número, no formato do WhatsApp do lojista: o nome grande com
 * chevron, e a lista abrindo por baixo.
 *
 * O ponto de estado ao lado de cada nome é o que faz esta lista valer: número
 * caído é atendimento parado, e sem o aviso aqui ninguém descobre até um
 * cliente reclamar. Quem está desconectado ganha "Conectar" no lugar do
 * ponto — o conserto fica a um clique de onde o problema aparece.
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
  const titulo = atual?.nome ?? 'Carregando…';

  return (
    <div ref={caixa} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 text-left w-full group"
      >
        <span className="text-[19px] font-semibold text-foreground truncate">{titulo}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-foreground/40 transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="absolute z-50 mt-2 w-[290px] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-background shadow-2xl overflow-hidden py-1.5">
          {instancias.map((i) => {
            const ligado = i.connection_state === 'open';
            return (
              <ItemDoSeletor
                key={i.id}
                nome={i.nome}
                detalhe={i.telefone ? fone(i.telefone) : undefined}
                marcado={selecionada === i.id}
                ligado={ligado}
                oficial={i.origem === 'cloud_api'}
                acao={!ligado && i.origem === 'evolution'
                  ? { rotulo: 'Conectar', ao: () => { onConectar(i); setAberto(false); } }
                  : undefined}
                onClick={() => { onSelecionar(i.id); setAberto(false); }}
              />
            );
          })}
          <div className="h-px bg-black/[0.06] dark:bg-white/[0.06] my-1.5 mx-3" />
          <button
            onClick={() => { onNovo(); setAberto(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
          >
            <span className="h-8 w-8 rounded-full bg-black/[0.05] dark:bg-white/[0.07] flex items-center justify-center shrink-0">
              <Settings2 className="h-3.5 w-3.5 text-foreground/40" />
            </span>
            <span className="text-[13.5px] text-foreground/50">Adicionar número da equipe</span>
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
      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
    >
      <span className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-[13px] font-semibold',
        ligado ? 'bg-emerald-500/20 text-emerald-500' : 'bg-black/[0.06] dark:bg-white/[0.08] text-foreground/50')}>
        {nome.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] text-foreground truncate">{nome}</p>
        {detalhe && <p className="text-[11px] text-foreground/35 truncate">{detalhe}</p>}
      </div>
      {acao ? (
        <button
          onClick={(e) => { e.stopPropagation(); acao.ao(); }}
          className="shrink-0 text-[11.5px] text-primary hover:underline"
        >
          {acao.rotulo}
        </button>
      ) : ligado !== undefined ? (
        <span className={cn('shrink-0 h-2 w-2 rounded-full', ligado ? 'bg-emerald-500' : 'bg-foreground/25')}
              title={ligado ? 'Conectado' : 'Desconectado'} />
      ) : null}
      {oficial && <span className="shrink-0 text-[9.5px] text-emerald-500/70 uppercase tracking-wide">API</span>}
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
