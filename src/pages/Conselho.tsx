import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  Send, Check, X, Loader2, MessageCircleQuestion, FlaskConical, History, Gavel, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Panel, SectionHeader } from '@/components/admin/ui';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import {
  useReunioes, useFalas, useDecisoes, useExperimentos, usePerguntas,
  usePerguntar, useCancelarPergunta, useDecidir, type Decisao, type Fala, type Reuniao,
} from '@/hooks/useConselho';
import {
  CEO, DIRETORIA, SEGUNDA_LEVA, TODA_A_DIRETORIA, quem, iniciais, posicaoNaOrbita, andamentoDoExperimento,
  ROTULO_RODADA, ORDEM_DAS_RODADAS, ROTULO_TIPO, ROTULO_EXPERIMENTO,
} from '@/lib/conselho';

/**
 * A Sala do Conselho.
 *
 * O dono lê aqui o que a diretoria decidiu, decide o que é dele e traz
 * perguntas. A reunião em si acontece no Claude (skill conselho-via-pesados),
 * que grava em conselho_*; esta tela nunca inventa fala nem decisão.
 */

const dataBR = (iso: string | null | undefined, comHora = false) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}) });
};

/** A ata vem em markdown enxuto: parágrafos, **negrito**, listas. Sem dependência nova. */
function Negrito({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return <>{partes.map((p, i) => p.startsWith('**') && p.endsWith('**')
    ? <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
    : <Fragment key={i}>{p}</Fragment>)}</>;
}

function Markdown({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  let lista: { tipo: 'ul' | 'ol'; itens: string[] } | null = null;
  const fechar = () => {
    if (!lista) return;
    const Tag = lista.tipo;
    blocos.push(
      <Tag key={blocos.length} className={cn('space-y-1 pl-5 text-[13px] leading-relaxed text-foreground/80', Tag === 'ul' ? 'list-disc' : 'list-decimal')}>
        {lista.itens.map((it, i) => <li key={i}><Negrito texto={it} /></li>)}
      </Tag>,
    );
    lista = null;
  };
  for (const linha of texto.split('\n')) {
    const t = linha.trim();
    const ul = t.match(/^[-*]\s+(.*)$/);
    const ol = t.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      const tipo = ul ? 'ul' : 'ol';
      if (lista && lista.tipo !== tipo) fechar();
      if (!lista) lista = { tipo, itens: [] };
      lista.itens.push((ul ?? ol)![1]);
      continue;
    }
    fechar();
    if (!t) continue;
    blocos.push(<p key={blocos.length} className="text-[13px] leading-relaxed text-foreground/80"><Negrito texto={t} /></p>);
  }
  fechar();
  return <div className="space-y-2.5">{blocos}</div>;
}

function Avatar({ slug, tamanho = 'md', aceso = true }: { slug: string; tamanho?: 'sm' | 'md' | 'lg'; aceso?: boolean }) {
  const d = quem(slug);
  const t = tamanho === 'lg' ? 'h-16 w-16 text-[17px]' : tamanho === 'md' ? 'h-11 w-11 text-[13px]' : 'h-8 w-8 text-[11px]';
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-background transition-all',
      d.cor, t, !aceso && 'opacity-30 grayscale')}>
      {iniciais(d.nome)}
    </span>
  );
}

/* ── A órbita: o CEO no centro, a diretoria executiva no anel de dentro,
   operação, risco, parceiros, pessoas e as unidades no anel de fora ───── */
function Cadeira({ slug, x, y, aceso }: { slug: string; x: number; y: number; aceso: boolean }) {
  const d = quem(slug);
  return (
    <div className="absolute left-1/2 top-1/2 w-[84px] text-center"
      style={{ transform: `translate(calc(-50% + ${x}px), calc(-20px + ${y}px))` }}>
      <Avatar slug={slug} tamanho="sm" aceso={aceso} />
      <p className={cn('mt-0.5 truncate text-[10px] font-semibold leading-tight', aceso ? 'text-foreground' : 'text-foreground/30')}>{d.nome.split(' ')[0]}</p>
      <p className="truncate text-[9px] leading-tight text-foreground/35">{d.cargo}</p>
    </div>
  );
}

function Orbita({ participantes }: { participantes: string[] }) {
  const aceso = (slug: string) => participantes.length === 0 || participantes.includes(slug);
  const dentro = 112;
  const fora = 196;
  return (
    <div className="relative mx-auto hidden h-[470px] w-[470px] shrink-0 sm:block">
      <div className="absolute rounded-full border border-dashed border-foreground/10" style={{ inset: 235 - fora }} />
      <div className="absolute rounded-full border border-dashed border-primary/30" style={{ inset: 235 - dentro }} />
      <div className="absolute inset-[170px] rounded-full bg-primary/10 blur-2xl" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <Avatar slug="ceo" tamanho="lg" />
        <p className="mt-1.5 text-[11px] font-semibold text-foreground">{CEO.nome}</p>
        <p className="text-[10px] text-foreground/40">CEO</p>
      </div>
      {DIRETORIA.map((d, i) => {
        const p = posicaoNaOrbita(i, DIRETORIA.length, dentro);
        return <Cadeira key={d.slug} slug={d.slug} x={p.x} y={p.y} aceso={aceso(d.slug)} />;
      })}
      {SEGUNDA_LEVA.map((d, i) => {
        // O anel de fora gira meia cadeira para ninguém ficar atrás de alguém de dentro.
        const p = posicaoNaOrbita(i + 0.5, SEGUNDA_LEVA.length, fora);
        return <Cadeira key={d.slug} slug={d.slug} x={p.x} y={p.y} aceso={aceso(d.slug)} />;
      })}
    </div>
  );
}

function DiretoriaEmLista({ participantes }: { participantes: string[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:hidden">
      {[CEO, ...TODA_A_DIRETORIA].map((d) => {
        const aceso = d.slug === 'ceo' || participantes.length === 0 || participantes.includes(d.slug);
        return (
          <div key={d.slug} className="text-center">
            <Avatar slug={d.slug} tamanho="sm" aceso={aceso} />
            <p className="mt-1 truncate text-[10.5px] font-semibold">{d.nome.split(' ')[0]}</p>
            <p className="truncate text-[9.5px] text-foreground/35">{d.cargo}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ── Perguntar ao conselho ───────────────────────────────────────────── */
function Perguntar() {
  const { member } = useAuth();
  const perguntar = usePerguntar();
  const cancelar = useCancelarPergunta();
  const { data: perguntas = [] } = usePerguntas();
  const [texto, setTexto] = useState('');
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const abertas = perguntas.filter((p) => p.status === 'aguardando' || p.status === 'em_reuniao');

  const enviar = async () => {
    if (texto.trim().length < 8) return;
    try {
      await perguntar.mutateAsync({ pergunta: texto, diretores: escolhidos, feita_por: member?.id ?? null });
      setTexto(''); setEscolhidos([]);
      toast.success('Pergunta na pauta do conselho');
    } catch (e) {
      toast.error('Não deu para enviar a pergunta', { description: (e as Error).message });
    }
  };

  return (
    <Panel className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4 text-primary" />
        <p className="text-[13px] font-semibold">Perguntar ao conselho</p>
      </div>
      <Textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder="Ex.: o que fazemos para chegar a 7 lojas pagando até o fim de novembro?"
        className="text-[13px]" />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-foreground/40 mr-1">Quem você quer ouvir (opcional):</span>
        {TODA_A_DIRETORIA.map((d) => {
          const on = escolhidos.includes(d.slug);
          return (
            <button key={d.slug} type="button"
              onClick={() => setEscolhidos(on ? escolhidos.filter((s) => s !== d.slug) : [...escolhidos, d.slug])}
              className={cn('rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                on ? 'border-primary bg-primary/10 text-primary' : 'border-black/[0.08] dark:border-white/[0.1] text-foreground/55 hover:border-primary/40')}>
              {d.nome.split(' ')[0]} · {d.cargo}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-foreground/40 leading-snug">
          A diretoria debate na próxima rodada do conselho e a resposta volta aqui. Pode demorar: é uma reunião de verdade.
        </p>
        <button onClick={enviar} disabled={perguntar.isPending || texto.trim().length < 8}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground disabled:opacity-40">
          {perguntar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Levar ao conselho
        </button>
      </div>
      {abertas.length > 0 && (
        <div className="space-y-1.5 border-t border-black/[0.06] dark:border-white/[0.06] pt-3">
          {abertas.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 text-[12px]">
              <p className="text-foreground/70 leading-snug">{p.pergunta}</p>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  p.status === 'em_reuniao' ? 'bg-primary/15 text-primary' : 'bg-foreground/[0.06] text-foreground/50')}>
                  {p.status === 'em_reuniao' ? 'Em reunião' : 'Na fila'}
                </span>
                {p.status === 'aguardando' && (
                  <button onClick={() => cancelar.mutate(p.id)} className="text-foreground/30 hover:text-red-500" aria-label="Retirar pergunta">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── O que precisa do dono ───────────────────────────────────────────── */
function DecisaoDoDono({ d }: { d: Decisao }) {
  const { member } = useAuth();
  const decidir = useDecidir();
  const [comentario, setComentario] = useState('');
  const responsavel = d.responsavel ? quem(d.responsavel) : null;
  const responder = async (status: 'aprovada' | 'vetada') => {
    try {
      await decidir.mutateAsync({ id: d.id, status, comentario, membroId: member?.id ?? null });
      toast.success(status === 'aprovada' ? 'Aprovado. O conselho executa.' : 'Vetado. O conselho vai saber por quê.');
    } catch (e) {
      toast.error('Não deu para registrar', { description: (e as Error).message });
    }
  };
  return (
    <Panel className="p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-semibold leading-snug">{d.titulo}</p>
        {d.prazo && <span className="shrink-0 text-[11px] text-foreground/40">até {dataBR(d.prazo)}</span>}
      </div>
      {d.descricao && <p className="text-[12.5px] text-foreground/65 leading-relaxed">{d.descricao}</p>}
      {d.recomendacao_ceo && (
        <p className="text-[12px] leading-snug"><span className="font-semibold text-primary">O CEO recomenda: </span>
          <span className="text-foreground/70">{d.recomendacao_ceo}</span></p>
      )}
      {d.divergencias && (
        <p className="text-[12px] leading-snug"><span className="font-semibold text-amber-600 dark:text-amber-400">Quem discordou: </span>
          <span className="text-foreground/65">{d.divergencias}</span></p>
      )}
      {responsavel && <p className="text-[11px] text-foreground/40">Executa: {responsavel.nome} ({responsavel.cargo})</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentário para o conselho (opcional)"
          className="h-9 flex-1 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-background px-3 text-[12px]" />
        <div className="flex gap-2">
          <button onClick={() => responder('vetada')} disabled={decidir.isPending}
            className="inline-flex items-center gap-1 rounded-xl border border-red-500/30 px-3 py-2 text-[12px] font-semibold text-red-500 hover:bg-red-500/10">
            <X className="h-3.5 w-3.5" /> Vetar
          </button>
          <button onClick={() => responder('aprovada')} disabled={decidir.isPending}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700">
            <Check className="h-3.5 w-3.5" /> Aprovar
          </button>
        </div>
      </div>
    </Panel>
  );
}

/* ── A conversa de uma reunião, por rodada ───────────────────────────── */
function Conversa({ falas }: { falas: Fala[] }) {
  const porRodada = useMemo(() => {
    const m = new Map<string, Fala[]>();
    for (const f of falas) m.set(f.rodada, [...(m.get(f.rodada) ?? []), f]);
    return ORDEM_DAS_RODADAS.filter((r) => m.has(r)).map((r) => ({ rodada: r, falas: m.get(r)! }));
  }, [falas]);
  const porId = useMemo(() => new Map(falas.map((f) => [f.id, f])), [falas]);
  return (
    <div className="space-y-5">
      {porRodada.map(({ rodada, falas: lista }) => (
        <div key={rodada}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-foreground/35">{ROTULO_RODADA[rodada] ?? rodada}</p>
          <div className="space-y-3">
            {lista.map((f) => {
              const alvo = f.em_resposta_a ? porId.get(f.em_resposta_a) : null;
              return (
                <div key={f.id} className="flex gap-3">
                  <Avatar slug={f.diretor} tamanho="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px]"><span className="font-semibold">{f.nome}</span>
                      <span className="text-foreground/40"> · {f.cargo ?? quem(f.diretor).cargo}</span>
                      {alvo && <span className="text-foreground/35"> · responde a {alvo.nome.split(' ')[0]}</span>}
                    </p>
                    <div className="mt-1"><Markdown texto={f.texto} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReuniaoAberta({ r }: { r: Reuniao }) {
  const { data: falas = [], isLoading } = useFalas(r.id);
  const [verConversa, setVerConversa] = useState(false);
  return (
    <Panel className="p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">{ROTULO_TIPO[r.tipo] ?? r.tipo}</p>
          <p className="text-[16px] font-bold leading-snug">{r.titulo}</p>
        </div>
        <span className="text-[11px] text-foreground/40">{dataBR(r.concluida_em ?? r.criado_em, true)}</span>
      </div>
      {r.ata ? <Markdown texto={r.ata} /> : r.conclusao && <p className="text-[13px] text-foreground/80">{r.conclusao}</p>}
      <button onClick={() => setVerConversa((v) => !v)}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline">
        {verConversa ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {verConversa ? 'Esconder a conversa' : `Ver a conversa inteira (${falas.length} falas)`}
      </button>
      {verConversa && (isLoading
        ? <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
        : <div className="border-t border-black/[0.06] dark:border-white/[0.06] pt-4"><Conversa falas={falas} /></div>)}
    </Panel>
  );
}

/* ── A página ─────────────────────────────────────────────────────────── */
export default function Conselho() {
  const { data: reunioes = [], isLoading } = useReunioes();
  const { data: decisoes = [] } = useDecisoes();
  const { data: experimentos = [] } = useExperimentos();
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const concluidas = reunioes.filter((r) => r.status === 'concluida');
  const aberta = concluidas.find((r) => r.id === abertaId) ?? concluidas[0] ?? null;
  const pendentes = decisoes.filter((d) => d.status === 'aguardando_dono');
  const emAndamento = decisoes.filter((d) => d.status === 'aprovada' || d.status === 'em_execucao');

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-md">
          <p className="text-[11px] font-light tracking-[0.22em] uppercase text-primary mb-3">Conselho</p>
          <h1 className="text-[28px] sm:text-[34px] leading-[1.1] tracking-tight">
            <span className="block font-extralight text-foreground/45">A diretoria debate.</span>
            <span className="block font-bold text-foreground">Você dá a palavra final.</span>
          </h1>
          <p className="mt-3 text-[12.5px] text-foreground/50 leading-relaxed">
            Toda semana e quando algo grande acontece, o CEO reúne a diretoria com os números reais da empresa.
            Cada um propõe, os outros contestam, o CEO decide, e o que é seu chega aqui.
          </p>
          <p className="mt-2 text-[11px] text-foreground/35">No anel de dentro, a diretoria executiva; no de fora, operação, risco, parceiros, pessoas e as unidades de negócio. Acesos: quem falou na reunião aberta.</p>
        </div>
        <Orbita participantes={aberta?.participantes ?? []} />
        <DiretoriaEmLista participantes={aberta?.participantes ?? []} />
      </header>

      <Perguntar />

      <div>
        <SectionHeader title={`Precisa de você${pendentes.length ? ` · ${pendentes.length}` : ''}`} />
        {pendentes.length === 0
          ? <p className="text-[12.5px] text-foreground/40">Nada esperando a sua decisão.</p>
          : <div className="grid gap-3 lg:grid-cols-2">{pendentes.map((d) => <DecisaoDoDono key={d.id} d={d} />)}</div>}
      </div>

      <div>
        <SectionHeader title="Última reunião" />
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
          : aberta ? <ReuniaoAberta key={aberta.id} r={aberta} />
          : <Panel className="p-5"><p className="text-[12.5px] text-foreground/50">O conselho ainda não se reuniu. A primeira reunião aparece aqui assim que terminar.</p></Panel>}
      </div>

      {emAndamento.length > 0 && (
        <div>
          <SectionHeader title="Em execução" />
          <div className="space-y-2">
            {emAndamento.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Gavel className="h-3.5 w-3.5 shrink-0 text-foreground/35" />
                  <p className="truncate text-[12.5px]">{d.titulo}</p>
                </div>
                <span className="shrink-0 text-[11px] text-foreground/40">
                  {d.responsavel ? quem(d.responsavel).nome.split(' ')[0] : '—'}{d.prazo ? ` · até ${dataBR(d.prazo)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionHeader title="Experimentos" />
        {experimentos.length === 0
          ? <p className="text-[12.5px] text-foreground/40">Nenhum ainda. Toda decisão que muda o jeito de vender, anunciar ou atender vira experimento com número de partida e data de revisão.</p>
          : (
            <div className="grid gap-3 lg:grid-cols-2">
              {experimentos.map((e) => {
                const { atual, fracao } = andamentoDoExperimento(e);
                return (
                  <Panel key={e.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <p className="text-[13px] font-semibold leading-snug">{e.hipotese}</p>
                      </div>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        e.status === 'funcionou' ? 'bg-emerald-500/15 text-emerald-600'
                          : e.status === 'nao_funcionou' ? 'bg-red-500/15 text-red-500'
                          : 'bg-foreground/[0.06] text-foreground/55')}>
                        {ROTULO_EXPERIMENTO[e.status] ?? e.status}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-foreground/50">
                      {e.descricao_metrica ?? e.metrica} · partida {e.linha_base ?? '—'} → meta {e.meta ?? '—'}
                      {atual != null && <> · agora <strong className="text-foreground">{atual}</strong></>}
                      {' '}· revisão {dataBR(e.revisar_em)}
                    </p>
                    {fracao != null && (
                      <div className="h-1.5 rounded-full bg-foreground/[0.06]">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.round(fracao * 100)}%` }} />
                      </div>
                    )}
                    {e.conclusao && <p className="text-[12px] text-foreground/65">{e.conclusao}</p>}
                  </Panel>
                );
              })}
            </div>
          )}
      </div>

      {concluidas.length > 1 && (
        <div>
          <SectionHeader title="Reuniões anteriores" />
          <div className="space-y-1.5">
            {concluidas.map((r) => (
              <button key={r.id} onClick={() => { setAbertaId(r.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className={cn('flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors',
                  r.id === aberta?.id ? 'border-primary/40 bg-primary/5' : 'border-black/[0.06] dark:border-white/[0.06] hover:border-primary/30')}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <History className="h-3.5 w-3.5 shrink-0 text-foreground/35" />
                  <p className="truncate text-[12.5px]"><span className="font-semibold">{ROTULO_TIPO[r.tipo]}</span>
                    <span className="text-foreground/55"> · {r.conclusao ?? r.titulo}</span></p>
                </div>
                <span className="shrink-0 text-[11px] text-foreground/40">{dataBR(r.concluida_em ?? r.criado_em)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
