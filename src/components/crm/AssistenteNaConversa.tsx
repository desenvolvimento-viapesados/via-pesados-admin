import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, ChevronDown, Check, Loader2, Send, Pencil, X, Undo2, AlertTriangle, CalendarClock, ExternalLink,
  PanelRightClose, Quote,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MODOS, ROTULO_DO_MODO, ROTULO_DA_ETAPA, horarioFalado, fiscal, dentroDoHorario, janelaAberta,
  useAcaoDoAssistente, useReuniaoDoAssistente, useTurnosDaConversa, useLinkDaMidia,
  type AssistenteConfig, type AssistenteConversa, type AssistenteTurno, type Modo, type Etapa, type ItemCitado,
} from '@/hooks/useAssistente';
import type { Mensagem } from '@/hooks/useWhatsApp';

/**
 * O assistente de vendas dentro da conversa do WhatsApp: o controle no
 * cabeçalho, o rascunho em cima da caixa de texto e o painel do que ele sabe.
 *
 * Nada aqui grava direto: mudar o modo, aprovar, descartar e devolver vão
 * pela função do servidor (useAcaoDoAssistente), que confere quem pediu.
 */

/* ── rótulos ──────────────────────────────────────────────────── */

const DESCRICAO_DO_MODO: Record<Modo, string> = {
  desligado: 'Nada sai. A conversa é só sua.',
  sugere: 'Escreve a resposta e espera você enviar, editar ou descartar.',
  sozinho: 'Responde sozinho das 08h às 20h e passa para você quando precisa.',
};

const MODO_CURTO: Record<Modo, string> = { desligado: 'Desligado', sugere: 'Sugere', sozinho: 'Sozinho' };

const SEGMENTO: Record<string, string> = {
  caminhoes: 'Caminhões', implementos: 'Implementos', maquinas: 'Máquinas', onibus: 'Ônibus', outro: 'Outro',
};

const DECISOR: Record<string, string> = { sim: 'Vem junto', nao: 'Não vem', nao_sei: 'Ainda não sabe' };

const MOTIVO_DE_ENCERRAR: Record<string, string> = {
  nao_quer: 'não quer', saiu: 'pediu para sair', engano: 'número errado', xingou: 'xingou', ja_cliente: 'já é cliente',
};

const PROXIMO_PASSO: Record<Etapa, string> = {
  conversa: 'Entender a rotina da loja e achar o que mais atrapalha a venda.',
  dor: 'Mostrar o que o sistema faz para essa dor.',
  prova: 'Oferecer dois horários para os 15 minutos com você.',
  compromisso: 'Fechar o horário e saber se quem decide vem junto.',
  agendado: 'Reunião marcada e link enviado. Confira o dossiê antes dos 15 minutos.',
  entregue: 'Reunião marcada e entregue a você.',
  pausa: 'Pausado.',
  frio: 'Esfriou: a loja parou de responder.',
  perdido: 'Encerrado. Ele não escreve mais nesta conversa.',
  saiu: 'Pediu para sair. Ninguém escreve mais nesta conversa.',
  com_xavier: 'Com você: responda ou devolva ao assistente.',
};

/** Cor do selo da etapa: laranja só quando é com você (pede ação). */
function corDaEtapa(e: Etapa): string {
  if (e === 'com_xavier') return 'bg-primary/15 text-primary';
  if (e === 'agendado' || e === 'entregue') return 'bg-emerald-500/15 text-emerald-500';
  if (e === 'perdido' || e === 'saiu' || e === 'frio' || e === 'pausa') return 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/45';
  return 'bg-violet-500/15 text-violet-400';
}

export function SeloDaEtapa({ etapa, className }: { etapa: Etapa; className?: string }) {
  return (
    <span className={cn('text-[10.5px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap', corDaEtapa(etapa), className)}>
      {ROTULO_DA_ETAPA[etapa] ?? etapa}
    </span>
  );
}

const dolar = (v: number) =>
  `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── controle do cabeçalho ────────────────────────────────────── */

export function ControleDoAssistente({
  conversaId, assistente, config, painelAberto, onPainel,
}: {
  conversaId: string;
  assistente: AssistenteConversa | null | undefined;
  config: AssistenteConfig | null | undefined;
  painelAberto: boolean;
  onPainel: () => void;
}) {
  const acao = useAcaoDoAssistente();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const modo: Modo = assistente?.modo ?? 'desligado';
  const etapa = assistente?.etapa;
  const comVoce = etapa === 'com_xavier';
  const geralDesligado = config ? !config.ligado : false;

  const mudar = async (novo: Modo) => {
    setAberto(false);
    if (novo === modo) return;
    try {
      await acao.mutateAsync({ acao: 'modo', conversa_id: conversaId, modo: novo });
      toast.success(novo === 'desligado' ? 'Assistente desligado nesta conversa.' : `Assistente: ${ROTULO_DO_MODO[novo]}.`);
    } catch (e) { toast.error((e as Error).message); }
  };

  const devolver = async () => {
    try {
      await acao.mutateAsync({ acao: 'devolver', conversa_id: conversaId });
      toast.success('Devolvida ao assistente. Ele responde na próxima mensagem da loja.');
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {etapa && (modo !== 'desligado' || etapa !== 'conversa') && <SeloDaEtapa etapa={etapa} className="hidden md:inline" />}

      {comVoce && (
        <button
          onClick={devolver}
          disabled={acao.isPending}
          className="h-8 px-2.5 rounded-lg text-[11.5px] font-medium text-primary border border-primary/30 hover:bg-primary/[0.08] disabled:opacity-50 flex items-center gap-1.5"
        >
          <Undo2 className="h-3.5 w-3.5" /> Devolver ao assistente
        </button>
      )}

      <div ref={caixa} className="relative">
        <button
          onClick={() => setAberto((v) => !v)}
          className={cn('h-8 px-2.5 rounded-lg border text-[11.5px] font-medium flex items-center gap-1.5 transition-colors',
            modo === 'desligado'
              ? 'border-black/[0.1] dark:border-white/[0.12] text-foreground/50 hover:text-foreground/80'
              : 'border-primary/30 text-foreground hover:bg-primary/[0.06]')}
        >
          {acao.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Bot className={cn('h-3.5 w-3.5', modo !== 'desligado' && 'text-primary')} />}
          <span className="hidden sm:inline">Assistente:</span> {MODO_CURTO[modo]}
          <ChevronDown className={cn('h-3 w-3 text-foreground/40 transition-transform', aberto && 'rotate-180')} />
        </button>

        {aberto && (
          <div className="absolute right-0 z-50 mt-2 w-[300px] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-background shadow-2xl overflow-hidden py-1.5">
            {MODOS.map((m) => (
              <button
                key={m}
                onClick={() => mudar(m)}
                className="w-full text-left flex items-start gap-3 px-3.5 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground">{ROTULO_DO_MODO[m]}</span>
                  <span className="block text-[11.5px] text-foreground/45 leading-snug mt-0.5">{DESCRICAO_DO_MODO[m]}</span>
                </span>
                {m === modo && <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />}
              </button>
            ))}
            {(geralDesligado || assistente?.pausado_motivo === 'voce_assumiu') && (
              <div className="mx-3 mt-1 mb-1 rounded-xl bg-amber-500/10 px-3 py-2 space-y-1">
                {geralDesligado && (
                  <p className="text-[11.5px] text-amber-600 dark:text-amber-400 leading-snug">
                    O assistente está desligado no geral: nada sai até você ligar na aba Assistente.
                  </p>
                )}
                {assistente?.pausado_motivo === 'voce_assumiu' && modo === 'desligado' && (
                  <p className="text-[11.5px] text-amber-600 dark:text-amber-400 leading-snug">
                    Você escreveu nesta conversa e ele saiu. Escolha um modo para devolver.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={onPainel}
        title={painelAberto ? 'Fechar o que o assistente sabe' : 'O que o assistente sabe'}
        className={cn('h-8 w-8 rounded-lg flex items-center justify-center transition-colors',
          painelAberto ? 'bg-primary/10 text-primary' : 'text-foreground/45 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]')}
      >
        <PanelRightClose className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ── ações pendentes em português ─────────────────────────────── */

function frasesDasAcoes(turno: AssistenteTurno): string[] {
  const frases: string[] = [];
  for (const a of turno.acoes ?? []) {
    if (a.estado !== 'pendente') continue;
    const args = (a.args ?? {}) as Record<string, unknown>;
    if (a.tipo === 'marcar_reuniao') {
      const d = typeof args.inicio === 'string' ? new Date(args.inicio) : null;
      const quando = d && !Number.isNaN(d.getTime()) ? horarioFalado(d) : 'o horário combinado';
      const quem = typeof args.quem_vem === 'string' && args.quem_vem ? ` com ${args.quem_vem}` : '';
      const decide = typeof args.decisor_vem === 'string' && DECISOR[args.decisor_vem]
        ? ` (quem decide: ${DECISOR[args.decisor_vem].toLowerCase()})` : '';
      frases.push(`Vai marcar ${quando}${quem}${decide} e mandar o link.`);
    } else if (a.tipo === 'chamar_xavier') {
      frases.push(`Vai passar a conversa para você${typeof args.motivo === 'string' && args.motivo ? `: ${args.motivo}` : '.'}`);
    } else if (a.tipo === 'encerrar') {
      const m = typeof args.motivo === 'string' ? MOTIVO_DE_ENCERRAR[args.motivo] ?? args.motivo : '';
      frases.push(`Vai encerrar a conversa${m ? ` (${m})` : ''} e não escrever mais.`);
    }
  }
  return frases;
}

/* ── rascunho (modo Sugere) ───────────────────────────────────── */

export function RascunhoDoAssistente({
  conversaId, turno, config, assistente, ultimaEntradaEm, oficial,
}: {
  conversaId: string;
  turno: AssistenteTurno;
  config: AssistenteConfig | null | undefined;
  assistente: AssistenteConversa | null | undefined;
  ultimaEntradaEm: string | null;
  /** Número da API oficial: fora da janela de 24h só sai modelo aprovado. */
  oficial: boolean;
}) {
  const acao = useAcaoDoAssistente();
  const [editando, setEditando] = useState(false);
  const [textos, setTextos] = useState<string[]>(turno.mensagens);
  useEffect(() => { setTextos(turno.mensagens); setEditando(false); }, [turno.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const acoes = useMemo(() => frasesDasAcoes(turno), [turno]);
  const finais = textos.map((t) => t.trim()).filter(Boolean);
  const editado = JSON.stringify(finais) !== JSON.stringify(turno.mensagens.map((t) => t.trim()).filter(Boolean));

  /* O que o fiscal do assistente diria do texto como está agora. Avisa, não
     trava: quem aprova é você. */
  const avisos = useMemo(() => {
    if (!finais.length) return [];
    const r = fiscal(finais, {
      linkReuniao: config?.link_reuniao ?? null,
      precisaApresentar: assistente ? !assistente.apresentou : false,
    });
    return Array.from(new Set(r.violacoes.map((v) => v.explicacao)));
  }, [finais.join('\u0000'), config?.link_reuniao, assistente?.apresentou]); // eslint-disable-line react-hooks/exhaustive-deps

  const foraDoHorario = !dentroDoHorario();
  /* Mesma regra do servidor: depois de 24h da última mensagem da loja, o assistente não
     escreve em nenhum número (no oficial, a Meta só aceita modelo aprovado). */
  const janelaFechada = finais.length > 0 && !janelaAberta(ultimaEntradaEm);
  const bloqueio = foraDoHorario
    ? 'Só sai das 08h às 20h. Aprove de novo a partir das 08h.'
    : janelaFechada
      ? oficial
        ? 'Passaram 24 horas da última mensagem da loja: por este número só sai modelo aprovado. Descarte o rascunho.'
        : 'Passaram 24 horas da última mensagem da loja: o assistente não retoma conversa parada. Descarte o rascunho e, se quiser, escreva você.'
      : null;

  const enviar = async () => {
    try {
      await acao.mutateAsync({ acao: 'aprovar', conversa_id: conversaId, turno_id: turno.id, mensagens: finais });
      toast.success(finais.length ? 'Enviado.' : 'Aprovado.');
    } catch (e) { toast.error((e as Error).message); }
  };
  const descartar = async () => {
    try {
      await acao.mutateAsync({ acao: 'descartar', conversa_id: conversaId, turno_id: turno.id });
      toast.success('Rascunho descartado.');
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="mx-3 mt-3 rounded-2xl border border-primary/25 bg-primary/[0.04] p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Bot className="h-3.5 w-3.5 text-primary" />
        <p className="text-[12px] font-semibold text-foreground">O assistente sugere</p>
        <p className="text-[10.5px] text-foreground/35 ml-auto">
          {new Date(turno.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {textos.length > 0 && (
        <div className="space-y-1.5">
          {textos.map((t, i) => editando ? (
            <textarea
              key={i}
              value={t}
              onChange={(e) => setTextos((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.12] text-[13px] resize-y focus:outline-none focus:border-primary/50"
            />
          ) : (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3 py-2 text-[13px] text-foreground whitespace-pre-wrap break-words">{t}</p>
            </div>
          ))}
        </div>
      )}

      {acoes.length > 0 && (
        <ul className="space-y-1">
          {acoes.map((f) => (
            <li key={f} className="flex gap-2 text-[12px] text-foreground/75">
              <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground/40" />{f}
            </li>
          ))}
        </ul>
      )}

      {avisos.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 px-3 py-2 space-y-1">
          {avisos.map((a) => (
            <p key={a} className="flex gap-2 text-[11.5px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />{a}
            </p>
          ))}
        </div>
      )}

      {bloqueio && <p className="text-[11.5px] text-foreground/50">{bloqueio}</p>}

      <div className="flex items-center gap-1.5">
        <button
          onClick={enviar}
          disabled={acao.isPending || !!bloqueio || (!finais.length && !acoes.length)}
          className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold disabled:opacity-40 flex items-center gap-1.5"
        >
          {acao.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {finais.length ? (editado ? 'Enviar editado' : 'Enviar') : 'Aprovar'}
        </button>
        {textos.length > 0 && (
          <button
            onClick={() => { if (editando) setTextos(turno.mensagens); setEditando((v) => !v); }}
            disabled={acao.isPending}
            className="h-8 px-2.5 rounded-lg text-[12px] font-medium text-foreground/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" /> {editando ? 'Desfazer edição' : 'Editar'}
          </button>
        )}
        <button
          onClick={descartar}
          disabled={acao.isPending}
          className="h-8 px-2.5 rounded-lg text-[12px] font-medium text-foreground/50 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center gap-1.5 ml-auto"
        >
          <X className="h-3.5 w-3.5" /> Descartar
        </button>
      </div>
    </div>
  );
}

/* ── painel: o que o assistente sabe ──────────────────────────── */

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30">{titulo}</p>
      {children}
    </div>
  );
}

function Citacao({ texto, citacao }: { texto?: string | null; citacao?: string | null }) {
  return (
    <div className="text-[12.5px] leading-snug">
      {citacao && (
        <p className="text-foreground/85 italic flex gap-1.5">
          <Quote className="h-3 w-3 mt-1 shrink-0 text-primary/60" />“{citacao.replace(/^["“]|["”]$/g, '')}”
        </p>
      )}
      {texto && <p className={cn('text-foreground/55', citacao && 'pl-[18px] mt-0.5')}>{texto}</p>}
    </div>
  );
}

const ROTULO_DA_SITUACAO: [string, string][] = [
  ['quem_fala', 'Quem está falando'],
  ['segmento', 'Segmento'],
  ['cidade', 'Cidade'],
  ['estoque', 'Estoque'],
  ['canais', 'Onde anuncia'],
  ['sistema_atual', 'O que usa hoje'],
];

export function PainelDoAssistente({
  conversaId, assistente, prospectId, onFechar,
}: {
  conversaId: string;
  assistente: AssistenteConversa | null | undefined;
  prospectId: string | null;
  onFechar: () => void;
}) {
  const navigate = useNavigate();
  const { data: reuniao } = useReuniaoDoAssistente(assistente?.reuniao_id);
  const { data: turnos } = useTurnosDaConversa(conversaId);
  const ultimo = turnos?.ultimo ?? null;
  const card = assistente?.prospect_id ?? prospectId;

  const situacao = assistente?.situacao ?? {};
  const linhasDaSituacao = ROTULO_DA_SITUACAO
    .map(([k, r]) => {
      const v = (situacao as Record<string, unknown>)[k];
      if (v == null || v === '') return null;
      return [r, k === 'segmento' ? SEGMENTO[String(v)] ?? String(v) : String(v)] as const;
    })
    .filter((x): x is readonly [string, string] => !!x);

  return (
    <aside className="w-[300px] shrink-0 border-l border-black/[0.08] dark:border-white/[0.08] flex flex-col min-h-0">
      <div className="h-14 px-4 border-b border-black/[0.08] dark:border-white/[0.08] flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <p className="text-[13px] font-semibold text-foreground">O que o assistente sabe</p>
        <button onClick={onFechar} className="ml-auto h-7 w-7 rounded-lg text-foreground/40 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] flex items-center justify-center">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {!assistente ? (
          <p className="text-[12.5px] text-foreground/45 leading-relaxed">
            O assistente ainda não atendeu esta conversa. Escolha "Sugere, você aprova" ou "Atende sozinho" no botão
            Assistente, lá em cima, e ele responde a próxima mensagem da loja.
          </p>
        ) : (
          <>
            <Bloco titulo="Onde está">
              <div className="flex flex-wrap items-center gap-2">
                <SeloDaEtapa etapa={assistente.etapa} />
                <span className="text-[11.5px] text-foreground/45">{ROTULO_DO_MODO[assistente.modo]}</span>
              </div>
              <p className="text-[12.5px] text-foreground/70 leading-snug">{PROXIMO_PASSO[assistente.etapa]}</p>
              {reuniao && (
                <p className="text-[12.5px] text-foreground leading-snug">
                  Reunião: <span className="font-medium">{horarioFalado(new Date(reuniao.scheduled_at))}</span>
                  {reuniao.status === 'cancelada' ? ' (cancelada)' : ''}
                </p>
              )}
            </Bloco>

            {ultimo && (ultimo.status === 'barrado' || ultimo.status === 'erro') && (
              <div className="rounded-xl bg-amber-500/10 px-3 py-2">
                <p className="text-[11.5px] text-amber-600 dark:text-amber-400 leading-snug">
                  {ultimo.status === 'barrado'
                    ? 'A última resposta dele não passou na conferência e não saiu. A conversa veio para você.'
                    : 'A última rodada deu erro e nada saiu. A conversa veio para você.'}
                </p>
              </div>
            )}

            {assistente.memoria && (
              <Bloco titulo="Resumo">
                <p className="text-[12.5px] text-foreground/75 leading-relaxed whitespace-pre-wrap">{assistente.memoria}</p>
              </Bloco>
            )}

            <Bloco titulo="Dores">
              {assistente.dores.length ? (
                <div className="space-y-2">
                  {assistente.dores.map((d, i) => <Citacao key={i} texto={d.texto} citacao={d.citacao} />)}
                </div>
              ) : <p className="text-[12px] text-foreground/35">Nenhuma ainda.</p>}
            </Bloco>

            {assistente.objecoes.length > 0 && (
              <Bloco titulo="Objeções">
                <div className="space-y-2.5">
                  {assistente.objecoes.map((o: ItemCitado, i) => (
                    <div key={i}>
                      <Citacao texto={o.texto} citacao={o.citacao} />
                      {o.resposta && <p className="text-[11.5px] text-foreground/45 pl-[18px] mt-0.5">Respondeu: {o.resposta}</p>}
                    </div>
                  ))}
                </div>
              </Bloco>
            )}

            {linhasDaSituacao.length > 0 && (
              <Bloco titulo="A loja">
                <dl className="space-y-1">
                  {linhasDaSituacao.map(([r, v]) => (
                    <div key={r} className="text-[12.5px] leading-snug">
                      <dt className="inline text-foreground/45">{r}: </dt>
                      <dd className="inline text-foreground/80">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Bloco>
            )}

            <Bloco titulo="Quem vem e quem decide">
              {assistente.quem_vem || assistente.decisor_vem ? (
                <div className="space-y-1 text-[12.5px] leading-snug">
                  {assistente.quem_vem && <p className="text-foreground/80">Vem: {assistente.quem_vem}</p>}
                  {assistente.decisor_vem && (
                    <p className="text-foreground/80">Quem decide: {DECISOR[assistente.decisor_vem].toLowerCase()}</p>
                  )}
                  {assistente.decisor_citacao && <Citacao citacao={assistente.decisor_citacao} />}
                </div>
              ) : <p className="text-[12px] text-foreground/35">Ainda não perguntou.</p>}
            </Bloco>

            {assistente.pedidos_preco > 0 && (
              <p className="text-[12px] text-foreground/55">
                Pediu o preço {assistente.pedidos_preco === 1 ? 'uma vez' : `${assistente.pedidos_preco} vezes`}.
              </p>
            )}

            {assistente.dossie && <Dossie dossie={assistente.dossie} />}

            <div className="pt-1 space-y-1.5 border-t border-black/[0.06] dark:border-white/[0.06]">
              {card && (
                <button
                  onClick={() => navigate(`/crm/prospect/${card}`)}
                  className="mt-3 text-[12px] text-primary hover:underline flex items-center gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir a ficha do prospect
                </button>
              )}
              <p className="text-[11px] text-foreground/35 tabular-nums">
                {assistente.mensagens_enviadas} {assistente.mensagens_enviadas === 1 ? 'mensagem' : 'mensagens'} do assistente
                · gasto {dolar(Number(assistente.custo_usd) || 0)}
              </p>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

/* ── dossiê ───────────────────────────────────────────────────── */

/** A ordem do dossiê como o Xavier lê antes da reunião. Chave que não está aqui vai no fim. */
const ORDEM_DO_DOSSIE: [string, string][] = [
  ['loja', 'Loja'],
  ['cidade_uf', 'Cidade'],
  ['segmento', 'Segmento'],
  ['reuniao', 'Reunião'],
  ['com_quem_falou', 'Com quem falou'],
  ['quem_vem', 'Quem vem'],
  ['decisor', 'Quem decide'],
  ['situacao', 'A loja hoje'],
  ['dores', 'Dores'],
  ['objecoes', 'Objeções e o que foi respondido'],
  ['promessas', 'O que o assistente prometeu'],
  ['perguntas', 'Perguntas para você fazer'],
  ['abertura', 'Abertura sugerida'],
  ['fechamento', 'Fechamento sugerido'],
  ['risco', 'Risco'],
];

const humano = (k: string) => {
  const t = k.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Valor({ v, aspas }: { v: unknown; aspas?: boolean }) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' || typeof v === 'number') {
    const t = String(v);
    return aspas && !/^["“]/.test(t)
      ? <p className="text-[12.5px] text-foreground/85 italic leading-snug">“{t}”</p>
      : <p className="text-[12.5px] text-foreground/80 leading-snug whitespace-pre-wrap">{t}</p>;
  }
  if (typeof v === 'boolean') return <p className="text-[12.5px] text-foreground/80">{v ? 'Sim' : 'Não'}</p>;
  if (Array.isArray(v)) {
    if (!v.length) return null;
    return <ul className="space-y-1.5">{v.map((x, i) => <li key={i}><Valor v={x} aspas={aspas} /></li>)}</ul>;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('citacao' in o || 'texto' in o) {
      return (
        <div>
          <Citacao texto={typeof o.texto === 'string' ? o.texto : null} citacao={typeof o.citacao === 'string' ? o.citacao : null} />
          {typeof o.resposta === 'string' && o.resposta && <p className="text-[11.5px] text-foreground/45 pl-[18px] mt-0.5">Respondeu: {o.resposta}</p>}
        </div>
      );
    }
    const pares = Object.entries(o).filter(([, x]) => x != null && x !== '');
    return (
      <dl className="space-y-1">
        {pares.map(([k, x]) => (
          <div key={k} className="text-[12.5px] leading-snug">
            <dt className="text-foreground/45">{humano(k)}</dt>
            <dd><Valor v={x} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  return null;
}

export function Dossie({ dossie }: { dossie: Record<string, unknown> }) {
  const conhecidas = new Set(ORDEM_DO_DOSSIE.map(([k]) => k));
  const itens: [string, string, unknown][] = [
    ...ORDEM_DO_DOSSIE.filter(([k]) => dossie[k] != null && dossie[k] !== '').map(([k, r]) => [k, r, dossie[k]] as [string, string, unknown]),
    /* Chave começando com "_" é do sistema (ids, carimbos, tentativa que falhou): não aparece. */
    ...Object.entries(dossie).filter(([k, v]) => !k.startsWith('_') && !conhecidas.has(k) && v != null && v !== '').map(([k, v]) => [k, humano(k), v] as [string, string, unknown]),
  ];
  if (!itens.length) return null;
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-3 space-y-3">
      <p className="text-[12px] font-semibold text-foreground flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5 text-primary" /> Dossiê da reunião
      </p>
      {itens.map(([k, r, v]) => (
        <Bloco key={k} titulo={r}>
          <Valor v={v} aspas={k === 'dores'} />
        </Bloco>
      ))}
    </div>
  );
}

/* ── mídia da mensagem (áudio com transcrição, foto) ──────────── */

const ehMarcador = (t: string | null | undefined) => /^\[[a-z_]+\]$/i.test(String(t ?? '').trim());

/**
 * O corpo da bolha: player do áudio com a transcrição embaixo, a foto, e o
 * texto. "[audio]" e "[imagem]" somem quando há o que mostrar no lugar.
 */
export function CorpoDaMensagem({ m, saida }: { m: Mensagem; saida: boolean }) {
  const { data: link } = useLinkDaMidia(m.media_salva);
  /* Só o arquivo guardado (link assinado): o media_url é o link cifrado do WhatsApp ou o da
     YCloud, que só abre com a chave — no navegador viraria player e foto quebrados. Sem
     arquivo guardado, a bolha mostra o marcador "[audio]"/"[imagem]". */
  const url = link ?? null;
  const audio = m.tipo === 'audio';
  const imagem = m.tipo === 'imagem';
  const temMidia = (audio || imagem) && !!url;
  const mostrarTexto = m.conteudo && !(ehMarcador(m.conteudo) && (temMidia || m.transcricao));

  return (
    <>
      {audio && url && <audio controls preload="none" src={url} className="h-9 max-w-[260px]" />}
      {imagem && url && (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="Foto" className="max-h-60 rounded-xl mb-1" loading="lazy" />
        </a>
      )}
      {mostrarTexto && <p className="text-[13px] whitespace-pre-wrap break-words">{m.conteudo}</p>}
      {audio && m.transcricao && (
        <p className={cn('text-[12px] italic whitespace-pre-wrap break-words mt-1',
          saida ? 'text-primary-foreground/80' : 'text-foreground/65')}>
          “{m.transcricao}”
        </p>
      )}
      {audio && !m.transcricao && !saida && (
        <p className="text-[10.5px] text-foreground/35 mt-0.5">Sem transcrição</p>
      )}
    </>
  );
}
