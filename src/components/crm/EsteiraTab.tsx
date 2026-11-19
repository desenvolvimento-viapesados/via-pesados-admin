import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFrente } from '@/contexts/FrenteContext';
import { useEsteira } from '@/hooks/useEsteira';
import { useLigacoesDoDia, useMetaDeLigacoes } from '@/hooks/useLigacoes';
import { ESTACOES, porEstacao, telaDo, type ItemDaEsteira } from '@/lib/esteira';
import { haQuanto, telefoneFalado, type FonteConversa } from '@/lib/oportunidades';
import { ConversaLateral, type AlvoDaConversa } from './ConversaLateral';
import { LigacoesTab } from './LigacoesTab';
import { NovaOportunidade } from './NovaOportunidade';

/**
 * A esteira de vendas, em colunas com cabeçalho de seta (dono, 19/11/2026: escolheu a opção
 * "colunas com setas", "ao clicar em cada um, abre uma página bem objetiva, uma coisa de cada vez").
 *
 * Uma coluna por etapa, na ordem. Cada loja é um cartão com uma linha do que está acontecendo e
 * UM botão com o que fazer; o botão laranja é o que é com você agora. Tocar no cartão ou no botão
 * abre a página da loja (/crm/esteira/:id), uma pergunta por vez.
 */

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
  /** A lista de ligações do dia, que abre embaixo do quadro. */
  prospeccao: ReactNode;
  carregando?: boolean;
};

/** O botão do cartão: o que se faz com a loja na tela que vai abrir. */
export function rotuloDoBotao(i: ItemDaEsteira, agora: Date): string {
  switch (telaDo(i, agora)) {
    case 'preparar': return i.temAmostra ? 'Ver a reunião' : 'Montar amostra';
    case 'reuniao': return 'Como foi?';
    case 'resultado': return 'Fechou?';
    case 'pagamento': return 'Mandar link';
    case 'implantacao': return 'Implantar';
    case 'cliente': return 'Ver ficha';
    case 'marcar': return i.o?.etapa === 'novo' ? 'Chamar' : i.suaVez ? 'Responder' : 'Marcar reunião';
    default: return 'Abrir';
  }
}

const SETA = 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';
const SETA_PRIMEIRA = 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)';

export function EsteiraView({ agora, itens, soltas, ligacoes, naFila, aoAbrir, aoAbrirConversa, prospeccao, carregando }: EsteiraProps) {
  const colunas = useMemo(() => porEstacao(itens), [itens]);
  const [ligando, setLigando] = useState(false);

  if (carregando) return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>;

  const faltam = Math.max(0, ligacoes.meta - ligacoes.feitas);
  const cartao = 'rounded-xl border border-black/[0.07] dark:border-white/[0.08] bg-background p-3.5 text-left';
  const botao = (vez: boolean) => cn('mt-3 w-full h-10 rounded-xl text-[13.5px] font-semibold transition-colors',
    vez ? 'bg-primary text-primary-foreground hover:opacity-90' : 'border border-black/[0.1] dark:border-white/[0.12] text-foreground/80 hover:border-primary/50 hover:text-primary');

  return (
    <div className="space-y-5 pb-10">
      <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pb-2">
        <div className="flex gap-2.5 min-w-max">
          {ESTACOES.map((e, n) => {
            const lista = colunas[e.chave];
            const total = e.chave === 'prospeccao' ? naFila : lista.length + (e.chave === 'conversa' ? soltas.length : 0);
            return (
              <div key={e.chave} className="w-[248px] shrink-0 flex flex-col">
                <div style={{ clipPath: n === 0 ? SETA_PRIMEIRA : SETA }}
                  className={cn('h-12 flex items-center gap-2 pl-6 pr-7', n === 0 && 'pl-4',
                    total > 0 && e.chave !== 'prospeccao' && e.chave !== 'cliente' ? 'bg-primary/15' : 'bg-black/[0.05] dark:bg-white/[0.07]')}>
                  <span className="text-[11px] font-bold text-foreground/40 tabular-nums">{n + 1}</span>
                  <span className="text-[14px] font-semibold text-foreground truncate">{e.rotulo}</span>
                  <span className="ml-auto text-[13px] font-semibold text-foreground/60 tabular-nums">{total.toLocaleString('pt-BR')}</span>
                </div>
                <div className="mt-2.5 space-y-2 min-h-[120px]">
                  {e.chave === 'prospeccao' && (
                    <div className={cartao}>
                      <p className="text-[14.5px] font-semibold text-foreground">Ligações de hoje</p>
                      <p className="text-[12.5px] text-foreground/50 mt-0.5">{ligacoes.meta ? `${ligacoes.feitas} de ${ligacoes.meta} feitas` : 'Só na frente Lojistas'}</p>
                      {ligacoes.meta > 0 && <button className={botao(faltam > 0)} onClick={() => setLigando((v) => !v)}>{ligando ? 'Fechar a lista' : 'Ligar'}</button>}
                    </div>
                  )}
                  {e.chave === 'conversa' && soltas.map((c) => {
                    const nome = c.nome?.trim() || telefoneFalado(c.telefone);
                    return (
                      <div key={c.id} className={cartao}>
                        <p className="text-[14.5px] font-semibold text-foreground leading-tight">{nome}</p>
                        <p className="text-[12.5px] text-foreground/50 mt-0.5 line-clamp-2">Escreveu no WhatsApp {haQuanto(c.ultima_mensagem_em, agora)}</p>
                        <button className={botao(true)} onClick={() => aoAbrirConversa({ nome, conversaId: c.id })}>Responder</button>
                      </div>
                    );
                  })}
                  {lista.map((i) => (
                    <div key={i.id} role="button" tabIndex={0} onClick={() => aoAbrir(i)} onKeyDown={(ev) => { if (ev.key === 'Enter') aoAbrir(i); }}
                      className={cn(cartao, 'cursor-pointer hover:border-primary/40 transition-colors')}>
                      <p className="text-[14.5px] font-semibold text-foreground leading-tight">{i.nome}</p>
                      <p className={cn('text-[12.5px] mt-1 leading-snug line-clamp-2', i.suaVez ? 'text-foreground/80' : 'text-foreground/50')}>{i.fazer}</p>
                      <button className={botao(i.suaVez)} onClick={(ev) => { ev.stopPropagation(); aoAbrir(i); }}>{rotuloDoBotao(i, agora)}</button>
                    </div>
                  ))}
                  {total === 0 && e.chave !== 'prospeccao' && (
                    <p className="rounded-xl border border-dashed border-black/[0.1] dark:border-white/[0.1] px-3 py-4 text-center text-[12.5px] text-foreground/35">Ninguém aqui</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {ligando && (
        <section className="max-w-5xl">
          <h2 className="text-[18px] font-semibold tracking-tight text-foreground mb-3">Ligações de hoje</h2>
          {prospeccao}
        </section>
      )}
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
