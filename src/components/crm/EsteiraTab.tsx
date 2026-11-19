import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFrente } from '@/contexts/FrenteContext';
import { useEsteira } from '@/hooks/useEsteira';
import { useLigacoesDoDia, useMetaDeLigacoes } from '@/hooks/useLigacoes';
import {
  ESTACOES, porEstacao, proximaCoisa, rotinaDoDia, type Estacao, type ItemDaEsteira,
} from '@/lib/esteira';
import { haQuanto, telefoneFalado, type FonteConversa } from '@/lib/oportunidades';
import { ConversaLateral, type AlvoDaConversa } from './ConversaLateral';
import { LigacoesTab } from './LigacoesTab';
import { NovaOportunidade } from './NovaOportunidade';
import { IconeWhatsApp } from './wa/IconeWhatsApp';

/**
 * A esteira de vendas (dono, 18/11/2026): "o cliente chega, aparece em tal lugar, depois nesse;
 * uma esteira que de fato vai rolando".
 *
 * De cima para baixo: a próxima coisa a fazer, bem grande; as sete estações em ordem; a rotina
 * do dia em cinco linhas; e a estação escolhida, com o que acontece nela, o que é a parte dele,
 * quem está ali e para onde vai depois. Tocar numa loja abre a esteira dela, uma tela por vez.
 */

const BOTAO = 'h-10 px-4 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap';

export type EsteiraProps = {
  agora: Date;
  itens: ItemDaEsteira[];
  /** Conversas com mensagem por ler de quem não é oportunidade. */
  soltas: FonteConversa[];
  ligacoes: { feitas: number; meta: number };
  /** Quantas lojas esperam a vez de receber a primeira mensagem. */
  naFila: number;
  aoAbrir: (i: ItemDaEsteira) => void;
  aoAbrirConversa: (alvo: AlvoDaConversa) => void;
  /** O que a estação Prospecção mostra (a lista de ligações do dia). */
  prospeccao: ReactNode;
  carregando?: boolean;
};

export function EsteiraView({ agora, itens, soltas, ligacoes, naFila, aoAbrir, aoAbrirConversa, prospeccao, carregando }: EsteiraProps) {
  const colunas = useMemo(() => porEstacao(itens), [itens]);
  const proxima = useMemo(() => proximaCoisa(itens, agora), [itens, agora]);
  const rotina = useMemo(() => rotinaDoDia(itens, ligacoes, soltas.length, agora), [itens, ligacoes, soltas.length, agora]);
  const [escolhida, setEscolhida] = useState<Estacao | null>(null);
  const atual: Estacao = escolhida ?? proxima?.item.estacao ?? rotina.find((r) => r.quantos > 0)?.estacao ?? 'prospeccao';
  const estacao = ESTACOES.find((e) => e.chave === atual)!;
  const n = ESTACOES.indexOf(estacao) + 1;
  const daEstacao = colunas[atual];

  if (carregando) return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>;

  const quantos = (e: Estacao) => (e === 'prospeccao' ? naFila : colunas[e].length);
  const suaVez = (e: Estacao) => rotina.find((r) => r.estacao === e)?.quantos ?? 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      {/* A próxima coisa: uma só, grande. */}
      <section className="rounded-3xl border border-black/[0.07] dark:border-white/[0.08] bg-background px-6 py-6 sm:px-8 sm:py-7 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="min-w-[260px] flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary mb-1.5">Agora</p>
          <h1 className="text-[26px] sm:text-[30px] leading-tight font-bold tracking-tight text-foreground">
            {proxima ? proxima.titulo : 'Nada esperando você'}
          </h1>
          <p className="text-[15px] text-foreground/55 mt-1.5 leading-relaxed">
            {proxima ? proxima.detalhe : 'Ninguém na esteira precisa de você agora. Hora de ligar para lojas novas.'}
          </p>
        </div>
        <button
          onClick={() => (proxima ? aoAbrir(proxima.item) : setEscolhida('prospeccao'))}
          className="h-12 px-6 rounded-2xl bg-primary text-primary-foreground text-[15px] font-semibold flex items-center gap-2 hover:opacity-90 transition-all"
        >
          {proxima ? proxima.botao : 'Ver as ligações'} <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      {/* As sete estações, em ordem. */}
      <section>
        <p className="text-[13px] text-foreground/45 mb-2.5">A esteira: a loja entra na 1 e anda até a 7.</p>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <div className="flex items-stretch gap-1.5 min-w-[860px]">
            {ESTACOES.map((e, i) => {
              const ativa = e.chave === atual;
              const vez = suaVez(e.chave);
              return (
                <div key={e.chave} className="flex items-center gap-1.5 flex-1 min-w-0">
                  <button onClick={() => setEscolhida(e.chave)}
                    className={cn('flex-1 min-w-0 text-left rounded-2xl border px-3.5 py-3 transition-all',
                      ativa ? 'border-primary bg-primary/[0.06]' : 'border-black/[0.07] dark:border-white/[0.08] bg-background hover:border-primary/40')}>
                    <p className={cn('text-[11px] font-bold tabular-nums', ativa ? 'text-primary' : 'text-foreground/35')}>{i + 1}</p>
                    <p className="text-[14.5px] font-semibold text-foreground truncate">{e.rotulo}</p>
                    <p className="text-[12.5px] text-foreground/50 tabular-nums mt-0.5">
                      {e.chave === 'prospeccao' ? `${quantos(e.chave).toLocaleString('pt-BR')} na fila` : quantos(e.chave) === 0 ? 'ninguém' : quantos(e.chave) === 1 ? '1 loja' : `${quantos(e.chave)} lojas`}
                    </p>
                    <p className={cn('text-[11.5px] font-semibold mt-1 h-4', vez > 0 ? 'text-primary' : 'text-transparent')}>
                      {e.chave === 'prospeccao' ? `ligar ${vez}` : `${vez} com você`}
                    </p>
                  </button>
                  {i < ESTACOES.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-foreground/20 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] gap-6 items-start">
        {/* A rotina do dia: cinco linhas, sempre na mesma ordem. */}
        <section className="rounded-3xl border border-black/[0.07] dark:border-white/[0.08] bg-background px-6 py-5">
          <h2 className="text-[17px] font-semibold tracking-tight text-foreground">Sua rotina de hoje</h2>
          <p className="text-[13px] text-foreground/45 mt-0.5 mb-2">Nesta ordem: primeiro quem está mais perto de pagar.</p>
          {rotina.map((r, i) => (
            <button key={r.estacao} onClick={() => setEscolhida(r.estacao)}
              className={cn('w-full flex items-center gap-3 py-3 text-left border-t border-black/[0.06] dark:border-white/[0.06] group', r.estacao === atual && 'text-primary')}>
              <span className="w-5 text-[13px] font-semibold text-foreground/35 tabular-nums">{i + 1}</span>
              <span className={cn('flex-1 text-[15px]', r.quantos > 0 ? 'text-foreground font-medium' : 'text-foreground/40', 'group-hover:text-primary transition-colors')}>{r.titulo}</span>
              <span className={cn('text-[13.5px] tabular-nums', r.quantos > 0 ? 'text-primary font-semibold' : 'text-foreground/30')}>{r.resumo}</span>
            </button>
          ))}
        </section>

        {/* A estação escolhida. */}
        <section className="rounded-3xl border border-black/[0.07] dark:border-white/[0.08] bg-background px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/40">Etapa {n} de {ESTACOES.length}</p>
          <h2 className="text-[22px] font-bold tracking-tight text-foreground mt-0.5">{estacao.rotulo}</h2>
          <p className="text-[15px] text-foreground/60 mt-1">{estacao.acontece}</p>

          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-4">
            <div>
              <p className="text-[12px] font-semibold text-foreground/40 mb-1">O que você faz aqui</p>
              {estacao.voce.map((v, i) => <p key={v} className="text-[14px] text-foreground leading-relaxed">{i + 1}. {v}</p>)}
            </div>
            <div>
              <p className="text-[12px] font-semibold text-foreground/40 mb-1">Depois</p>
              <p className="text-[14px] text-foreground leading-relaxed">{estacao.depois}</p>
            </div>
          </div>

          <div className="mt-5">
            {atual === 'prospeccao' ? prospeccao : (
              <>
                <p className="text-[12px] font-semibold text-foreground/40 mb-1">Quem está aqui</p>
                {daEstacao.length === 0 && (atual !== 'conversa' || soltas.length === 0) && (
                  <p className="rounded-2xl border border-dashed border-black/[0.1] dark:border-white/[0.1] px-4 py-3.5 text-[14px] text-foreground/40">Ninguém nesta etapa agora.</p>
                )}
                <div className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
                  {daEstacao.map((i) => (
                    <button key={i.id} onClick={() => aoAbrir(i)} className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 text-left group">
                      <span className="min-w-[200px] flex-1">
                        <span className="block text-[15.5px] font-semibold text-foreground group-hover:text-primary transition-colors">{i.nome}</span>
                        <span className="block text-[12.5px] text-foreground/45">{[i.lugar, i.o?.origem, haQuanto(i.mexeuEm, agora)].filter(Boolean).join(' · ')}</span>
                        <span className={cn('block text-[14px] mt-1 leading-snug', i.suaVez ? 'text-primary font-medium' : 'text-foreground/60')}>{i.fazer}</span>
                      </span>
                      <span className={cn(BOTAO, 'border border-black/[0.1] dark:border-white/[0.12] text-foreground/75 group-hover:border-primary/50 group-hover:text-primary')}>
                        Abrir <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))}
                  {atual === 'conversa' && soltas.map((c) => {
                    const nome = c.nome?.trim() || telefoneFalado(c.telefone);
                    return (
                      <button key={c.id} onClick={() => aoAbrirConversa({ nome, conversaId: c.id })} className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 text-left group">
                        <span className="min-w-[200px] flex-1">
                          <span className="block text-[15.5px] font-semibold text-foreground group-hover:text-primary transition-colors">{nome}</span>
                          <span className="block text-[12.5px] text-foreground/45">Escreveu no WhatsApp · {haQuanto(c.ultima_mensagem_em, agora)}</span>
                          {c.ultima_mensagem && <span className="block text-[14px] mt-1 text-primary font-medium line-clamp-1">“{c.ultima_mensagem}”</span>}
                        </span>
                        <span className={cn(BOTAO, 'border border-black/[0.1] dark:border-white/[0.12] text-foreground/75')}>
                          <IconeWhatsApp className="h-4 w-4 text-[#25D366]" /> Abrir conversa
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function EsteiraTab({ newOpen, onCloseNew }: { newOpen: boolean; onCloseNew: () => void }) {
  const navigate = useNavigate();
  const { frente } = useFrente();
  const lojista = frente === 'lojista';
  const { itens, soltas, naFila, carregando } = useEsteira();
  const { data: lista = [] } = useLigacoesDoDia(lojista);
  const { data: meta = 20 } = useMetaDeLigacoes();
  const [conversa, setConversa] = useState<AlvoDaConversa | null>(null);
  const agora = useMemo(() => new Date(), [itens]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <EsteiraView
        agora={agora}
        itens={itens}
        soltas={soltas}
        naFila={naFila}
        carregando={carregando}
        ligacoes={lojista ? { feitas: lista.filter((l) => l.ligada_hoje).length, meta } : { feitas: 0, meta: 0 }}
        aoAbrir={(i) => navigate(`/crm/esteira/${encodeURIComponent(i.id)}`)}
        aoAbrirConversa={setConversa}
        prospeccao={lojista ? (
          <div className="space-y-3">
            <LigacoesTab aoAbrirConversa={setConversa} />
            <button onClick={() => navigate('/crm?tab=prospeccao')} className="text-[13px] text-primary font-medium hover:underline">
              Ver o envio automático e a fila de lojas
            </button>
          </div>
        ) : <p className="text-[14px] text-foreground/40">A prospecção automática é só da frente Lojistas.</p>}
      />
      {conversa && <ConversaLateral alvo={conversa} onFechar={() => setConversa(null)} />}
      <NovaOportunidade open={newOpen} onClose={onCloseNew} />
    </>
  );
}
