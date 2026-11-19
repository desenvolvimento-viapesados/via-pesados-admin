import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MessageCircle, ExternalLink, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kpi } from '@/components/admin/ui';
import { horarioFalado } from '@/hooks/useAssistente';
import { useFunilDaProspeccao, nomeDaLoja, type LinhaDoFunil } from '@/hooks/useFunilDaProspeccao';
import { FASES, LADOS, chegaramAte, respostas, taxa, vendedorDoAnuncio } from '@/lib/funilDaProspeccao';
import { Dossie } from './AssistenteNaConversa';

/**
 * A ficha de uma loja da prospecção: em que pé está, a reunião, o que o Davi descobriu, o que
 * veio do anúncio no portal e a linha do tempo. É o que abre ao clicar no card do Funil.
 *
 * O quadro "Prospecção automática" que morava aqui saiu em 18/11/2026: as mesmas lojas apareciam
 * em dois funis com nomes de etapa diferentes, e o dono não entendia qual valia. Hoje há um funil
 * só (FunilTab, lib/oportunidades); daqui ficaram a ficha e os números do envio.
 */

const fone = (t: string) => {
  const n = t.startsWith('55') ? t.slice(2) : t;
  return n.length < 10 ? t : `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}`;
};

const quando = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '';

const ETIQUETA = 'text-[10px] font-medium rounded-full px-1.5 py-px';
const NEUTRA = 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/55';

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

export function Detalhe({ l, onClose, topo, onConversa, acoes }: {
  l: LinhaDoFunil | null; onClose: () => void;
  /** A etapa e o próximo passo, no lugar da trilha antiga da prospecção. */
  topo?: ReactNode;
  /** Abrir a conversa ao lado em vez de trocar de aba. */
  onConversa?: () => void;
  /** Os botões do próximo passo (marcar reunião, contar como foi, fechar). */
  acoes?: ReactNode;
}) {
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
    { quando: l.loja.primeiro_contato_em, o_que: 'Recebeu a mensagem da prospecção' },
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

        {topo ?? (
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
        )}

        <div className="flex flex-wrap gap-2">
          {l.loja.conversa_id && (
            <button onClick={onConversa ?? (() => navigate(`/crm?tab=whatsapp&conversa=${l.loja.conversa_id}`))}
              className="h-10 px-4 rounded-xl text-[13px] font-semibold bg-[#25D366]/12 text-[#128C4B] dark:text-[#25D366] flex items-center gap-1.5 hover:bg-[#25D366]/20">
              <MessageCircle className="h-4 w-4" /> Abrir a conversa
            </button>
          )}
          {acoes}
          {l.card && (
            <button onClick={() => navigate(`/crm/prospect/${l.card!.id}`)}
              className="h-10 px-4 rounded-xl text-[13px] font-semibold border border-black/[0.1] dark:border-white/[0.12] text-foreground/75 hover:text-foreground flex items-center gap-1.5">
              Ficha completa
            </button>
          )}
        </div>

        {l.reuniao && (
          <Secao titulo="Reunião">
            <div className="rounded-xl border border-black/[0.07] dark:border-white/[0.08] p-3 space-y-1">
              <p className="text-[13px] text-foreground font-medium">
                {horarioFalado(new Date(l.reuniao.scheduled_at))} · {STATUS_DA_REUNIAO[l.reuniao.status] ?? l.reuniao.status}
              </p>
              {l.posicao.reuniaoPassou && <p className="text-[12px] text-amber-600 dark:text-amber-400">Já passou. Conte como foi para ela andar no funil.</p>}
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

/**
 * O resultado do envio em números: de quantas lojas abordadas, quantas responderam,
 * quantas marcaram reunião e quantas fecharam.
 */
export function NumerosDaProspeccao() {
  const { data, isLoading } = useFunilDaProspeccao();
  const n = useMemo(() => chegaramAte((data?.linhas ?? []).filter((l) => !l.teste).map((l) => l.posicao)), [data]);
  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></div>;
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      <Kpi label="Na fila" value={(data?.naFila ?? 0).toLocaleString('pt-BR')} sub="esperando a vez de receber" />
      <Kpi label="Já receberam" value={n.abordada.toLocaleString('pt-BR')} sub="a mensagem ou a ligação" />
      <Kpi label="Responderam" value={n.conversando.toLocaleString('pt-BR')} sub={taxa(n.conversando, n.abordada) ? `${taxa(n.conversando, n.abordada)} de quem recebeu` : undefined} />
      <Kpi label="Reuniões" value={n.reuniao.toLocaleString('pt-BR')} sub={taxa(n.reuniao, n.conversando) ? `${taxa(n.reuniao, n.conversando)} de quem respondeu` : undefined} accent="text-primary" />
      <Kpi label="Clientes" value={n.cliente.toLocaleString('pt-BR')} sub={taxa(n.cliente, n.reuniao) ? `${taxa(n.cliente, n.reuniao)} das reuniões` : undefined} />
    </div>
  );
}
