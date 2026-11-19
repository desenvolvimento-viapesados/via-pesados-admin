import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateMeeting, useUpdateProspect, type Prospect } from '@/hooks/useAdmin';
import { linhaDa, useGarantirCard, useJaRespondi, useRegistrarContato, type ComoFoiOContato } from '@/hooks/useOportunidades';
import type { LinhaDoFunil } from '@/hooks/useFunilDaProspeccao';
import {
  ETAPAS, NAO_APARECEU, diaFalado, horaFalada, type Oportunidade, type ReuniaoDaOportunidade, type Tom,
} from '@/lib/oportunidades';
import { AgendarReuniaoDialog } from './AgendarReuniaoDialog';
import { ConversaLateral, type AlvoDaConversa } from './ConversaLateral';
import { Detalhe } from './FunilDaProspeccao';

/**
 * O que se faz com uma oportunidade, igual em toda tela: abrir a conversa ao lado, marcar a
 * reunião, contar como ela foi, registrar o primeiro contato, começar o teste e fechar a venda.
 * Hoje e Funil usam as mesmas ações, então o mesmo gesto dá sempre no mesmo lugar.
 */

export const COR_DO_TOM: Record<Tom, string> = {
  agora: 'text-primary',
  atencao: 'text-amber-600 dark:text-amber-400',
  calmo: 'text-foreground/50',
};

export const BOTAO = 'h-10 px-4 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap';
export const BOTAO_PRINCIPAL = cn(BOTAO, 'bg-primary text-primary-foreground hover:opacity-90');
export const BOTAO_CALMO = cn(BOTAO, 'border border-black/[0.1] dark:border-white/[0.12] text-foreground/75 hover:text-foreground hover:border-black/20 dark:hover:border-white/25');

const escolha = (ativo = false) => cn(
  'min-h-[52px] px-4 py-2.5 rounded-xl text-left border transition-colors',
  ativo ? 'border-primary bg-primary/[0.07]' : 'border-black/[0.1] dark:border-white/[0.1] hover:border-primary/50',
);
const campo =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50';

function Escolha({ titulo, sub, onClick, disabled }: { titulo: string; sub?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn(escolha(), 'disabled:opacity-50')}>
      <p className="text-[14px] font-semibold text-foreground">{titulo}</p>
      {sub && <p className="text-[12px] text-foreground/50 mt-0.5">{sub}</p>}
    </button>
  );
}

/** datetime-local quer o horário LOCAL, sem fuso. */
const paraCampo = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ── Como foi a reunião ──────────────────────────────────────────── */

type Reuniao = ReuniaoDaOportunidade & { title?: string | null };

export function ComoFoiAReuniao({ reuniao, nome, onClose, onFechou, onTeste, onPerdida }: {
  reuniao: Reuniao | null; nome: string; onClose: () => void;
  /** Fechou a venda / vai testar / não quer: quem chama resolve o card. */
  onFechou: () => void; onTeste: () => void; onPerdida: (motivo: string) => Promise<void>;
}) {
  const atualizar = useUpdateMeeting();
  const [tela, setTela] = useState<'aconteceu' | 'remarcar' | 'resultado' | 'nao_quer'>('aconteceu');
  const [novoHorario, setNovoHorario] = useState('');
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);
  if (!reuniao) return null;

  /* Reunião que já foi marcada como realizada abre direto na pergunta do resultado. */
  const telaAtual = reuniao.status === 'realizada' && tela === 'aconteceu' ? 'resultado' : tela;
  const fechar = () => { setTela('aconteceu'); setNota(''); setNovoHorario(''); onClose(); };
  const gravar = async (patch: Record<string, unknown>, aviso?: string) => {
    setSalvando(true);
    try {
      await atualizar.mutateAsync({ id: reuniao.id, ...patch } as never);
      if (aviso) toast.success(aviso);
      return true;
    } catch {
      toast.error('Não consegui salvar. Tente de novo.');
      return false;
    } finally { setSalvando(false); }
  };

  const quando = `${diaFalado(reuniao.scheduled_at)} às ${horaFalada(reuniao.scheduled_at)}`;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px]">
            {telaAtual === 'resultado' ? 'E como terminou?' : telaAtual === 'remarcar' ? 'Remarcar a reunião' : telaAtual === 'nao_quer' ? 'Por que não quis?' : 'A reunião aconteceu?'}
          </DialogTitle>
          <p className="text-[12.5px] text-foreground/50">{nome} · {quando}</p>
        </DialogHeader>

        {telaAtual === 'aconteceu' && (
          <div className="grid gap-2">
            <Escolha titulo="Aconteceu" sub="Você mostrou o sistema." disabled={salvando}
              onClick={async () => { if (await gravar({ status: 'realizada' })) setTela('resultado'); }} />
            <Escolha titulo="Não apareceu" sub="Marcou e não entrou na chamada." disabled={salvando}
              onClick={async () => { if (await gravar({ status: 'cancelada', outcome: NAO_APARECEU }, 'Anotado. Ela volta para Em conversa: marque outra.')) fechar(); }} />
            <Escolha titulo="Remarcar" sub="Combinaram outro dia." disabled={salvando}
              onClick={() => { setNovoHorario(paraCampo(new Date(Date.now() + 86_400_000))); setTela('remarcar'); }} />
          </div>
        )}

        {telaAtual === 'remarcar' && (
          <div className="space-y-3">
            <input type="datetime-local" className={campo} value={novoHorario} onChange={(e) => setNovoHorario(e.target.value)} />
            <div className="flex justify-between gap-2">
              <button className={BOTAO_CALMO} onClick={() => setTela('aconteceu')}>Voltar</button>
              <button className={BOTAO_PRINCIPAL} disabled={salvando} onClick={async () => {
                const d = new Date(novoHorario);
                if (Number.isNaN(d.getTime())) { toast.error('Escolha o dia e a hora.'); return; }
                if (await gravar({ scheduled_at: d.toISOString(), status: 'agendada', outcome: null }, `Remarcada para ${diaFalado(d)} às ${horaFalada(d)}.`)) fechar();
              }}>
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Remarcar
              </button>
            </div>
          </div>
        )}

        {telaAtual === 'resultado' && (
          <div className="grid gap-2">
            <Escolha titulo="Fechou" sub="Registrar a venda agora." onClick={() => { fechar(); onFechou(); }} />
            <Escolha titulo="Vai testar grátis" sub="Começar o teste agora." onClick={() => { fechar(); onTeste(); }} />
            <Escolha titulo="Ficou de decidir" sub="Fica em Reunião feita, e o sistema lembra você de cobrar." disabled={salvando}
              onClick={async () => { if (await gravar({ outcome: 'Ficou de decidir' }, 'Anotado. Em dois dias ela aparece para você cobrar.')) fechar(); }} />
            <Escolha titulo="Não quer" sub="Sai do funil." onClick={() => setTela('nao_quer')} />
          </div>
        )}

        {telaAtual === 'nao_quer' && (
          <div className="space-y-3">
            <input className={campo} placeholder="Nas palavras dela (caro, já tem sistema, agora não…)" value={nota} onChange={(e) => setNota(e.target.value)} autoFocus />
            <div className="flex justify-between gap-2">
              <button className={BOTAO_CALMO} onClick={() => setTela('resultado')}>Voltar</button>
              <button className={BOTAO_PRINCIPAL} disabled={salvando} onClick={async () => {
                setSalvando(true);
                try {
                  await gravar({ outcome: `Não quis.${nota.trim() ? ` ${nota.trim()}` : ''}` });
                  await onPerdida(nota.trim() || 'Não quis depois da reunião.');
                  toast.success('Anotado. Saiu do funil.');
                  fechar();
                } catch { toast.error('Não consegui salvar. Tente de novo.'); } finally { setSalvando(false); }
              }}>
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── O primeiro contato com quem chegou ──────────────────────────── */

export function PrimeiroContato({ o, onClose, onMarcarReuniao }: { o: Oportunidade | null; onClose: () => void; onMarcarReuniao: () => void }) {
  const registrar = useRegistrarContato();
  const [como, setComo] = useState<ComoFoiOContato | null>(null);
  const [nota, setNota] = useState('');
  if (!o || !o.cardId) return null;
  const fechar = () => { setComo(null); setNota(''); onClose(); };
  const salvar = async (c: ComoFoiOContato) => {
    try {
      await registrar.mutateAsync({ cardId: o.cardId!, como: c, nota });
      toast.success(c === 'nao_atendeu' ? 'Anotado. Ela continua em Novos para você tentar de novo.' : c === 'sem_interesse' ? 'Anotado. Saiu do funil.' : 'Anotado. Foi para Em conversa.');
      fechar();
    } catch { toast.error('Não consegui salvar. Tente de novo.'); }
  };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px]">Como foi o contato?</DialogTitle>
          <p className="text-[12.5px] text-foreground/50">{o.nome}</p>
        </DialogHeader>
        {como === null ? (
          <div className="grid gap-2">
            <Escolha titulo="Marcou reunião" sub="Escolher o dia e a hora." onClick={() => { fechar(); onMarcarReuniao(); }} />
            <Escolha titulo="Falei com ela" sub="A conversa continua. Vai para Em conversa." onClick={() => setComo('conversando')} />
            <Escolha titulo="Não atendeu" sub="Fica em Novos para você tentar de novo." disabled={registrar.isPending} onClick={() => salvar('nao_atendeu')} />
            <Escolha titulo="Sem interesse" sub="Sai do funil." onClick={() => setComo('sem_interesse')} />
          </div>
        ) : (
          <div className="space-y-3">
            <input className={campo} autoFocus value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder={como === 'sem_interesse' ? 'Por quê? (nas palavras dela)' : 'O que combinaram? (opcional)'} />
            <div className="flex justify-between gap-2">
              <button className={BOTAO_CALMO} onClick={() => setComo(null)}>Voltar</button>
              <button className={BOTAO_PRINCIPAL} disabled={registrar.isPending} onClick={() => salvar(como)}>
                {registrar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── As ações, prontas para qualquer tela ────────────────────────── */

export type AcoesDaVenda = {
  conversa: (alvo: AlvoDaConversa) => void;
  conversaDa: (o: Oportunidade) => void;
  ficha: (o: Oportunidade) => void;
  marcarReuniao: (o: Oportunidade) => void;
  comoFoi: (reuniao: Reuniao, o: Oportunidade | null) => void;
  primeiroContato: (o: Oportunidade) => void;
  /** Falou com ela por fora do CRM: anota e tira de "Responder agora". */
  jaRespondi: (o: Oportunidade) => void;
  venda: (o: Oportunidade) => void;
  teste: (o: Oportunidade) => void;
};

/** A etapa da oportunidade numa barra de seis passos, com o próximo passo embaixo. */
export function EtapaEProximoPasso({ o }: { o: Oportunidade }) {
  const i = ETAPAS.findIndex((e) => e.chave === o.etapa);
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {ETAPAS.map((e, n) => (
          <div key={e.chave} title={e.rotulo} className={cn('h-1.5 flex-1 rounded-full', n <= i && !o.perdida ? 'bg-primary' : 'bg-black/[0.07] dark:bg-white/[0.08]')} />
        ))}
      </div>
      <p className="text-[13px] text-foreground">
        <span className="font-semibold">{o.perdida ? 'Perdida' : ETAPAS[i].rotulo}</span>
        <span className="text-foreground/45"> · {o.origem}</span>
      </p>
      <p className={cn('text-[13.5px] font-medium', COR_DO_TOM[o.passo.tom])}>{o.passo.texto}</p>
    </div>
  );
}

export function useAcoesDaVenda({ prospects, linhas, oportunidades }: { prospects: Prospect[]; linhas: LinhaDoFunil[]; oportunidades: Oportunidade[] }): { acoes: AcoesDaVenda; camadas: ReactNode } {
  const navigate = useNavigate();
  const garantir = useGarantirCard();
  const atualizarCard = useUpdateProspect();
  const respondi = useJaRespondi();
  const [conversa, setConversa] = useState<AlvoDaConversa | null>(null);
  const [fichaDe, setFichaDe] = useState<string | null>(null);
  const [reuniaoPara, setReuniaoPara] = useState<Prospect | null>(null);
  const [comoFoi, setComoFoi] = useState<{ reuniao: Reuniao; oId: string | null; nome: string } | null>(null);
  const [contatoDe, setContatoDe] = useState<string | null>(null);

  const daLista = (id: string | null) => (id ? oportunidades.find((x) => x.id === id) ?? null : null);
  const comCard = async (o: Oportunidade): Promise<Prospect | null> => {
    try { return await garantir.mutateAsync({ o, prospects, linhas }); }
    catch (e) { toast.error((e as Error).message || 'Não consegui abrir o cadastro desta loja.'); return null; }
  };

  const acoes: AcoesDaVenda = {
    conversa: setConversa,
    conversaDa: (o) => setConversa({ nome: o.nome, conversaId: o.conversaId, prospectId: o.cardId, telefone: o.telefone }),
    ficha: (o) => {
      if (linhaDa(linhas, o)) setFichaDe(o.id);
      else if (o.cardId) navigate(`/crm/prospect/${o.cardId}`);
    },
    marcarReuniao: async (o) => { const p = await comCard(o); if (p) { setFichaDe(null); setReuniaoPara(p); } },
    comoFoi: (reuniao, o) => { setFichaDe(null); setComoFoi({ reuniao, oId: o?.id ?? null, nome: o?.nome ?? reuniao.title ?? 'Reunião' }); },
    primeiroContato: (o) => setContatoDe(o.id),
    jaRespondi: async (o) => {
      const p = await comCard(o);
      if (!p) return;
      try { await respondi.mutateAsync(p.id); toast.success('Anotado. Saiu de Responder agora.'); }
      catch { toast.error('Não consegui anotar. Tente de novo.'); }
    },
    venda: async (o) => { const p = await comCard(o); if (p) navigate(`/crm/venda/${p.id}`); },
    teste: async (o) => { const p = await comCard(o); if (p) navigate(`/crm/teste/${p.id}`); },
  };

  const oDaFicha = daLista(fichaDe);
  const lDaFicha = linhaDa(linhas, oDaFicha);
  const oDaReuniao = daLista(comoFoi?.oId ?? null);
  const oDoContato = daLista(contatoDe);

  const camadas = (
    <>
      {oDaFicha && lDaFicha && (
        <Detalhe
          l={lDaFicha}
          onClose={() => setFichaDe(null)}
          topo={<EtapaEProximoPasso o={oDaFicha} />}
          onConversa={oDaFicha.conversaId ? () => { setFichaDe(null); acoes.conversaDa(oDaFicha); } : undefined}
          acoes={!oDaFicha.perdida && oDaFicha.etapa !== 'cliente' && (
            <>
              {oDaFicha.passo.tipo === 'registrar_reuniao' && oDaFicha.reuniao
                ? <button className={BOTAO_PRINCIPAL} onClick={() => acoes.comoFoi(oDaFicha.reuniao!, oDaFicha)}>Contar como foi a reunião</button>
                : (oDaFicha.etapa === 'conversa' || oDaFicha.etapa === 'novo') && (
                  <button className={BOTAO_CALMO} disabled={garantir.isPending} onClick={() => acoes.marcarReuniao(oDaFicha)}>Marcar reunião</button>
                )}
              {oDaFicha.etapa === 'decisao' && (
                <>
                  <button className={BOTAO_PRINCIPAL} onClick={() => acoes.venda(oDaFicha)}>Registrar a venda</button>
                  <button className={BOTAO_CALMO} onClick={() => acoes.teste(oDaFicha)}>Começar teste grátis</button>
                </>
              )}
            </>
          )}
        />
      )}
      {reuniaoPara && (
        <AgendarReuniaoDialog
          prospect={reuniaoPara}
          moverParaReuniao={reuniaoPara.stage === 'contato' || reuniaoPara.stage === 'amostra' || reuniaoPara.stage === 'oportunidade'}
          onClose={() => setReuniaoPara(null)}
        />
      )}
      {comoFoi && (
        <ComoFoiAReuniao
          reuniao={comoFoi.reuniao}
          nome={comoFoi.nome}
          onClose={() => setComoFoi(null)}
          onFechou={() => { if (oDaReuniao) acoes.venda(oDaReuniao); else if (comoFoi.reuniao.prospect_id) navigate(`/crm/venda/${comoFoi.reuniao.prospect_id}`); }}
          onTeste={() => { if (oDaReuniao) acoes.teste(oDaReuniao); else if (comoFoi.reuniao.prospect_id) navigate(`/crm/teste/${comoFoi.reuniao.prospect_id}`); }}
          onPerdida={async (motivo) => {
            const id = oDaReuniao ? (await comCard(oDaReuniao))?.id : comoFoi.reuniao.prospect_id;
            if (id) await atualizarCard.mutateAsync({ id, stage: 'perdido', lost_reason: motivo });
          }}
        />
      )}
      <PrimeiroContato o={oDoContato} onClose={() => setContatoDe(null)} onMarcarReuniao={() => { if (oDoContato) acoes.marcarReuniao(oDoContato); }} />
      {conversa && <ConversaLateral alvo={conversa} onFechar={() => setConversa(null)} />}
    </>
  );

  return { acoes, camadas };
}
