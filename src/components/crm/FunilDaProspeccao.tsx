import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Search, MessageCircle, CalendarClock, AlertTriangle, ExternalLink, Kanban, ChevronDown, Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, Kpi } from '@/components/admin/ui';
import { horarioFalado } from '@/hooks/useAssistente';
import { useFunilDaProspeccao, nomeDaLoja, type LinhaDoFunil } from '@/hooks/useFunilDaProspeccao';
import {
  FASES, LADOS, cargoCurto, chegaramAte, estoqueCurto, respostas, taxa, vendedorDoAnuncio, type Fase, type Lado,
} from '@/lib/funilDaProspeccao';
import { Dossie } from './AssistenteNaConversa';

/**
 * O funil da prospecção automática (dono, 09/11/2026), separado do funil
 * principal. Ninguém arrasta card: a fase de cada loja sai do que já aconteceu
 * (mensagens, conversa com o Davi, Agenda, card do funil) e anda sozinha.
 */

const fone = (t: string) => {
  const n = t.startsWith('55') ? t.slice(2) : t;
  return n.length < 10 ? t : `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}`;
};

function haQuanto(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

const quando = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '';

const POR_COLUNA = 30;

const ETIQUETA = 'text-[10px] font-medium rounded-full px-1.5 py-px';
const NEUTRA = 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/55';

/** As etiquetas do card: o que se sabe e o que pede atenção, em poucas palavras. */
function Etiquetas({ l }: { l: LinhaDoFunil }) {
  const s = l.conversa?.situacao ?? {};
  const itens: { texto: string; cls: string; icone?: ReactNode }[] = [];
  const dePe = l.reuniao && (l.reuniao.status === 'agendada' || l.reuniao.status === 'remarcada');
  if (l.teste) itens.push({ texto: 'Teste', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' });
  if (l.posicao.reuniaoPassou) itens.push({ texto: 'Reunião passou: conte na Agenda como foi', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', icone: <AlertTriangle className="h-2.5 w-2.5" /> });
  else if (dePe) itens.push({ texto: horarioFalado(new Date(l.reuniao!.scheduled_at)), cls: 'bg-primary/10 text-primary', icone: <CalendarClock className="h-2.5 w-2.5" /> });
  else if (l.posicao.reuniaoCancelada) itens.push({ texto: 'Reunião cancelada', cls: NEUTRA });
  const estoque = estoqueCurto(s.estoque), cargo = cargoCurto(s.cargo);
  if (estoque) itens.push({ texto: estoque, cls: NEUTRA });
  if (cargo) itens.push({ texto: cargo, cls: NEUTRA });
  if ((l.conversa?.pedidos_preco ?? 0) > 0) itens.push({ texto: 'Perguntou o preço', cls: NEUTRA });
  if (l.conversa?.etapa === 'pausa') itens.push({ texto: 'Pediu para falar depois', cls: NEUTRA });
  if (l.conversa?.etapa === 'frio') itens.push({ texto: 'Esfriou', cls: NEUTRA });
  if (!itens.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {itens.map((e) => <span key={e.texto} className={cn(ETIQUETA, e.cls, 'inline-flex items-center gap-0.5')}>{e.icone}{e.texto}</span>)}
    </div>
  );
}

function Cartao({ l, onAbrir }: { l: LinhaDoFunil; onAbrir: () => void }) {
  const lugar = [l.loja.cidade, l.loja.uf].filter(Boolean).join('/');
  return (
    <button onClick={onAbrir}
      className="w-full text-left rounded-xl border border-black/[0.07] dark:border-white/[0.08] bg-background p-3 hover:border-primary/40 hover:shadow-md transition-all">
      <p className="text-[12.5px] font-semibold text-foreground leading-tight">{nomeDaLoja(l.loja)}</p>
      {lugar && <p className="text-[11px] text-foreground/45 mt-0.5">{lugar}</p>}
      <Etiquetas l={l} />
      <p className="text-[10px] text-foreground/35 mt-1.5">{haQuanto(l.mexeuEm)}</p>
    </button>
  );
}

function Coluna({ titulo, explica, linhas, onAbrir, destaque }: {
  titulo: string; explica: string; linhas: LinhaDoFunil[]; onAbrir: (l: LinhaDoFunil) => void; destaque?: boolean;
}) {
  const [todas, setTodas] = useState(false);
  const visiveis = todas ? linhas : linhas.slice(0, POR_COLUNA);
  return (
    <div className={cn('w-[250px] shrink-0 flex flex-col rounded-2xl border',
      destaque ? 'bg-primary/[0.04] border-primary/25' : 'bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.05] dark:border-white/[0.05]')}>
      <div className="px-3.5 pt-3 pb-2" title={explica}>
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-semibold text-foreground">{titulo}</p>
          <span className={cn('text-[10.5px] font-medium rounded-full px-1.5 py-0.5 tabular-nums',
            destaque && linhas.length ? 'bg-primary/15 text-primary' : 'text-foreground/35 bg-black/[0.05] dark:bg-white/[0.06]')}>{linhas.length}</span>
        </div>
        <p className="text-[10.5px] text-foreground/35 mt-0.5 leading-snug">{explica}</p>
      </div>
      <div className="flex-1 px-2 pb-2 space-y-1.5 min-h-[100px]">
        {visiveis.map((l) => <Cartao key={l.loja.id} l={l} onAbrir={() => onAbrir(l)} />)}
        {linhas.length > visiveis.length && (
          <button onClick={() => setTodas(true)} className="w-full h-8 rounded-lg text-[11.5px] text-foreground/50 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
            Ver mais {linhas.length - visiveis.length}
          </button>
        )}
      </div>
    </div>
  );
}

/** As de lado que não pedem nada agora: lista recolhida, abre quando quiser. */
function Recolhida({ titulo, explica, linhas, onAbrir }: { titulo: string; explica: string; linhas: LinhaDoFunil[]; onAbrir: (l: LinhaDoFunil) => void }) {
  const [aberta, setAberta] = useState(false);
  const [quantas, setQuantas] = useState(300);
  if (!linhas.length) return null;
  const rotuloDaFase = (f: Fase | null) => FASES.find((x) => x.chave === f)?.rotulo ?? '';
  return (
    <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08]">
      <button onClick={() => setAberta((a) => !a)} className="w-full flex items-center gap-2 px-4 h-11 text-left">
        <p className="text-[12.5px] font-semibold text-foreground">{titulo}</p>
        <span className="text-[10.5px] text-foreground/40 tabular-nums">{linhas.length}</span>
        <span className="text-[11px] text-foreground/35 truncate">{explica}</span>
        <ChevronDown className={cn('h-4 w-4 ml-auto text-foreground/35 transition-transform', aberta && 'rotate-180')} />
      </button>
      {aberta && (
        <div className="divide-y divide-black/[0.06] dark:divide-white/[0.06] border-t border-black/[0.06] dark:border-white/[0.06]">
          {linhas.slice(0, quantas).map((l) => (
            <button key={l.loja.id} onClick={() => onAbrir(l)} className="w-full flex flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-2.5 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
              <span className="text-[12.5px] font-medium text-foreground min-w-[200px] flex-1 truncate">{nomeDaLoja(l.loja)}</span>
              <span className="text-[11px] text-foreground/45 w-[160px] truncate">{[l.loja.cidade, l.loja.uf].filter(Boolean).join('/')}</span>
              <span className="text-[11px] text-foreground/45 w-[140px]">Chegou até: {rotuloDaFase(l.posicao.fase)}</span>
              <span className="text-[11px] text-foreground/35 w-[90px] text-right">{haQuanto(l.mexeuEm)}</span>
            </button>
          ))}
          {linhas.length > quantas && (
            <button onClick={() => setQuantas((q) => q + 300)} className="w-full h-10 text-[12px] text-foreground/50 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
              Ver mais {Math.min(300, linhas.length - quantas)} de {linhas.length - quantas}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold tracking-wide uppercase text-foreground/35">{rotulo}</p>
      <div className="text-[13px] text-foreground mt-0.5">{children}</div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[12px] font-semibold text-foreground">{titulo}</p>
      {children}
    </div>
  );
}

const DECISOR: Record<string, string> = { sim: 'Vem à reunião', nao: 'Não vem à reunião', nao_sei: 'Não se sabe se vem' };
const STATUS_DA_REUNIAO: Record<string, string> = { agendada: 'Marcada', remarcada: 'Remarcada', realizada: 'Aconteceu', cancelada: 'Cancelada' };

function Detalhe({ l, onClose }: { l: LinhaDoFunil | null; onClose: () => void }) {
  const navigate = useNavigate();
  if (!l) return null;
  const c = l.conversa;
  const sabe = respostas(c?.situacao);
  const iFase = FASES.findIndex((f) => f.chave === l.posicao.fase);
  const lado = LADOS.find((x) => x.chave === l.posicao.lado);
  const dados = (l.loja.dados ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const vendedor = vendedorDoAnuncio(dados);
  const portal = texto(l.loja.fonte_ref)?.startsWith('http') ? l.loja.fonte_ref! : null;

  const linhaDoTempo = [
    { quando: l.loja.primeiro_contato_em, o_que: 'Recebeu as mensagens da prospecção' },
    { quando: l.loja.respondeu_em, o_que: 'Respondeu' },
    { quando: l.reuniao?.scheduled_at, o_que: `Reunião (${STATUS_DA_REUNIAO[l.reuniao?.status ?? ''] ?? l.reuniao?.status ?? ''})` },
  ].filter((x) => !!x.quando).sort((a, b) => String(a.quando).localeCompare(String(b.quando)));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[17px]">{nomeDaLoja(l.loja)}</DialogTitle>
          <p className="text-[12px] text-foreground/45">
            {[[l.loja.cidade, l.loja.uf].filter(Boolean).join('/'), fone(l.loja.telefone)].filter(Boolean).join(' · ')}
          </p>
        </DialogHeader>

        {/* Em que fase está: o caminho todo, com o ponto em que ela parou. */}
        <div className="space-y-2">
          <div className="flex gap-1">
            {FASES.map((f, i) => (
              <div key={f.chave} title={f.rotulo} className={cn('h-1.5 flex-1 rounded-full', i <= iFase ? 'bg-primary' : 'bg-black/[0.07] dark:bg-white/[0.08]')} />
            ))}
          </div>
          <p className="text-[12.5px] text-foreground">
            <span className="font-semibold">{FASES[iFase]?.rotulo ?? 'Na fila'}</span>
            {lado && <span className={cn('ml-2', ETIQUETA, lado.chave === 'com_voce' ? 'bg-primary/15 text-primary' : NEUTRA)}>{lado.rotulo}</span>}
            <span className="text-foreground/45"> · {FASES[iFase]?.explica ?? ''}</span>
          </p>
          {l.loja.motivo && <p className="text-[12px] text-foreground/60">{l.loja.motivo}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {l.loja.conversa_id && (
            <button onClick={() => navigate(`/crm?tab=whatsapp&conversa=${l.loja.conversa_id}`)}
              className="h-9 px-3 rounded-xl text-[12.5px] font-medium bg-primary text-primary-foreground flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" /> Abrir a conversa
            </button>
          )}
          {l.card && (
            <button onClick={() => navigate(`/crm/prospect/${l.card!.id}`)}
              className="h-9 px-3 rounded-xl text-[12.5px] font-medium border border-black/[0.1] dark:border-white/[0.1] text-foreground/75 flex items-center gap-1.5">
              <Kanban className="h-4 w-4" /> Card no funil principal
            </button>
          )}
        </div>

        {l.reuniao && (
          <Secao titulo="Reunião">
            <div className="rounded-xl border border-black/[0.07] dark:border-white/[0.08] p-3 space-y-1">
              <p className="text-[13px] text-foreground font-medium">
                {horarioFalado(new Date(l.reuniao.scheduled_at))} · {STATUS_DA_REUNIAO[l.reuniao.status] ?? l.reuniao.status}
              </p>
              {l.posicao.reuniaoPassou && <p className="text-[12px] text-amber-600 dark:text-amber-400">Já passou. Marque na Agenda se aconteceu: a loja anda para "Reunião feita".</p>}
              {l.reuniao.meet_link && (
                <a href={l.reuniao.meet_link} target="_blank" rel="noreferrer" className="text-[12px] text-primary inline-flex items-center gap-1">
                  <Video className="h-3.5 w-3.5" /> {l.reuniao.meet_link.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </Secao>
        )}

        <Secao titulo="O que o Davi descobriu">
          {!c ? (
            <p className="text-[12.5px] text-foreground/45">
              {l.loja.respondeu_em
                ? 'Respondeu, mas o Davi não entrou nesta conversa (estava desligado ou alguém da equipe já estava nela).'
                : 'Ainda não respondeu: o Davi não conversou com esta loja.'}
            </p>
          ) : (
            <div className="space-y-3">
              {sabe.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {sabe.map((r) => <Campo key={r.rotulo} rotulo={r.rotulo}>{r.valor}</Campo>)}
                  {(c.pedidos_preco ?? 0) > 0 && <Campo rotulo="Preço">Perguntou {c.pedidos_preco === 1 ? 'uma vez' : `${c.pedidos_preco} vezes`}</Campo>}
                  {c.quem_vem && <Campo rotulo="Quem vem">{c.quem_vem}</Campo>}
                  {c.decisor_vem && (
                    <Campo rotulo="Quem decide">
                      {DECISOR[c.decisor_vem] ?? c.decisor_vem}{c.decisor_citacao && <span className="text-foreground/45"> · "{c.decisor_citacao}"</span>}
                    </Campo>
                  )}
                </div>
              ) : <p className="text-[12.5px] text-foreground/45">Nada registrado ainda.</p>}
              {c.dores?.length > 0 && (
                <Campo rotulo="O que atrapalha">
                  <ul className="space-y-1">{c.dores.map((d, i) => <li key={i}>{d.texto}{d.citacao && <span className="text-foreground/45"> · "{d.citacao}"</span>}</li>)}</ul>
                </Campo>
              )}
              {c.objecoes?.length > 0 && (
                <Campo rotulo="Objeções">
                  <ul className="space-y-1">{c.objecoes.map((o, i) => <li key={i}>{o.texto}{o.citacao && <span className="text-foreground/45"> · "{o.citacao}"</span>}</li>)}</ul>
                </Campo>
              )}
              {c.memoria && <Campo rotulo="Resumo do Davi"><p className="whitespace-pre-line text-foreground/80">{c.memoria}</p></Campo>}
            </div>
          )}
        </Secao>

        {c?.dossie && <Dossie dossie={c.dossie} />}

        {(vendedor || texto(dados.tipo) || portal) && (
          <Secao titulo="Do anúncio no portal">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {vendedor && <Campo rotulo="Vendedor">{vendedor}</Campo>}
              {texto(dados.tipo) && <Campo rotulo="Anuncia">{texto(dados.tipo)}</Campo>}
              {portal && (
                <Campo rotulo="Página no portal">
                  <a href={portal} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">Abrir <ExternalLink className="h-3 w-3" /></a>
                </Campo>
              )}
            </div>
          </Secao>
        )}

        {linhaDoTempo.length > 0 && (
          <Secao titulo="Linha do tempo">
            <ol className="space-y-1.5">
              {linhaDoTempo.map((x) => (
                <li key={x.o_que} className="flex gap-3 text-[12.5px]">
                  <span className="w-[120px] shrink-0 text-foreground/45 tabular-nums">{quando(x.quando)}</span>
                  <span className="text-foreground/80">{x.o_que}</span>
                </li>
              ))}
            </ol>
          </Secao>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function FunilDaProspeccao() {
  const { data, isLoading, error } = useFunilDaProspeccao();
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<LinhaDoFunil | null>(null);

  const linhas = useMemo(() => {
    const todas = data?.linhas ?? [];
    const q = busca.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    if (!q) return todas;
    return todas.filter((l) => `${nomeDaLoja(l.loja)} ${l.loja.nome} ${l.loja.cidade ?? ''} ${l.loja.uf ?? ''}`
      .toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(q));
  }, [data, busca]);

  const porColuna = useMemo(() => {
    const fases = Object.fromEntries(FASES.map((f) => [f.chave, [] as LinhaDoFunil[]])) as Record<Fase, LinhaDoFunil[]>;
    const lados = Object.fromEntries(LADOS.map((x) => [x.chave, [] as LinhaDoFunil[]])) as Record<Lado, LinhaDoFunil[]>;
    for (const l of linhas) {
      if (l.posicao.lado) lados[l.posicao.lado].push(l);
      else if (l.posicao.fase) fases[l.posicao.fase].push(l);
    }
    return { fases, lados };
  }, [linhas]);

  /* As contas valem para todas as abordadas, não só para a busca. */
  const n = useMemo(() => chegaramAte((data?.linhas ?? []).filter((l) => !l.teste).map((l) => l.posicao)), [data]);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>;
  if (error) return <EmptyState icon={<AlertTriangle />} title="Não deu para carregar o funil" sub={(error as Error).message} />;

  const comVoce = LADOS.find((x) => x.chave === 'com_voce')!;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Na fila" value={(data?.naFila ?? 0).toLocaleString('pt-BR')} sub="esperando a vez" />
        <Kpi label="Abordadas" value={n.abordada.toLocaleString('pt-BR')} />
        <Kpi label="Responderam" value={n.conversando.toLocaleString('pt-BR')} sub={taxa(n.conversando, n.abordada) && `${taxa(n.conversando, n.abordada)} das abordadas`} />
        <Kpi label="Reuniões" value={n.reuniao.toLocaleString('pt-BR')} sub={taxa(n.reuniao, n.conversando) && `${taxa(n.reuniao, n.conversando)} de quem respondeu`} accent="text-primary" />
        <Kpi label="Clientes" value={n.cliente.toLocaleString('pt-BR')} sub={taxa(n.cliente, n.reuniao) && `${taxa(n.cliente, n.reuniao)} das reuniões`} />
      </div>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar loja ou cidade"
          className="w-full h-9 pl-9 pr-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[12.5px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50" />
      </div>

      {data?.cortado && (
        <p className="text-[11.5px] text-amber-600 dark:text-amber-400">Mais de 10 mil lojas abordadas: o quadro mostra as 10 mil primeiras.</p>
      )}

      {(data?.linhas.length ?? 0) === 0 ? (
        <EmptyState icon={<Kanban />} title="Nenhuma loja abordada ainda" sub="Quando a prospecção estiver ligada, cada loja aparece aqui e anda sozinha pelas fases." />
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="flex gap-3 min-w-max">
            {porColuna.lados.com_voce.length > 0 && (
              <Coluna titulo={comVoce.rotulo} explica={comVoce.explica} linhas={porColuna.lados.com_voce} onAbrir={setAberta} destaque />
            )}
            {FASES.map((f) => (
              <Coluna key={f.chave} titulo={f.rotulo} explica={f.explica} linhas={porColuna.fases[f.chave]} onAbrir={setAberta} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {LADOS.filter((x) => x.chave !== 'com_voce').map((x) => (
          <Recolhida key={x.chave} titulo={x.rotulo} explica={x.explica} linhas={porColuna.lados[x.chave]} onAbrir={setAberta} />
        ))}
      </div>

      <Detalhe l={aberta} onClose={() => setAberta(null)} />
    </div>
  );
}
