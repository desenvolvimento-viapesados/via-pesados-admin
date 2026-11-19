import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Phone, Video } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFrente } from '@/contexts/FrenteContext';
import { useOportunidades } from '@/hooks/useOportunidades';
import { useLigacoesDoDia } from '@/hooks/useLigacoes';
import {
  diaFalado, haQuanto, horaFalada, paraAcompanhar, paraResponder, resumoDoDia, reunioesDoDia, telefoneFalado,
  type FonteConversa, type Oportunidade, type ReuniaoDaOportunidade, type ReuniaoDoDia,
} from '@/lib/oportunidades';
import { BOTAO_CALMO, BOTAO_PRINCIPAL, COR_DO_TOM, useAcoesDaVenda, type AcoesDaVenda } from './AcoesDaVenda';
import { LigacoesTab } from './LigacoesTab';
import { IconeWhatsApp } from './wa/IconeWhatsApp';

/**
 * Hoje: o dia de quem vende, na ordem em que se faz (dono, 18/11/2026: "olhando esse CRM, eu
 * não entendo as pessoas para quem eu deveria mandar mensagem").
 *
 * 1. Responder agora: quem escreveu, pediu contato ou foi passado pelo Davi.
 * 2. Reuniões: as de hoje e as que passaram sem ninguém contar como foram.
 * 3. Acompanhar: quem viu o sistema e não decidiu, quem faltou, conversa parada.
 * 4. Ligar hoje: a lista de ligações frias.
 *
 * Nada aqui é marcado à mão: cada linha sai do que já aconteceu (lib/oportunidades) e some
 * quando o passo é dado.
 */

const LISTA = 'rounded-2xl border border-black/[0.07] dark:border-white/[0.08] divide-y divide-black/[0.06] dark:divide-white/[0.06] bg-background';

function Bloco({ titulo, conta, explica, vazio, children }: { titulo: string; conta: number; explica: string; vazio: string; children?: ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mb-3">
        <h2 className="text-[18px] font-semibold tracking-tight text-foreground">{titulo}</h2>
        {conta > 0 && <span className="text-[15px] font-semibold text-primary tabular-nums">{conta}</span>}
        <p className="text-[13px] text-foreground/40">{explica}</p>
      </div>
      {conta > 0 ? children : (
        <p className="rounded-2xl border border-dashed border-black/[0.1] dark:border-white/[0.1] px-5 py-4 text-[13.5px] text-foreground/40">{vazio}</p>
      )}
    </section>
  );
}

function Linha({ nome, meta, onNome, children, botoes }: { nome: string; meta: (string | null | undefined)[]; onNome?: () => void; children?: ReactNode; botoes: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <div className="min-w-[240px] flex-1">
        <button onClick={onNome} disabled={!onNome} className={cn('text-left text-[15.5px] font-semibold text-foreground leading-snug', onNome && 'hover:text-primary transition-colors')}>{nome}</button>
        <p className="text-[12.5px] text-foreground/45 mt-0.5">{meta.filter(Boolean).join(' · ')}</p>
        {children}
      </div>
      <div className="flex flex-wrap items-center gap-2 ml-auto">{botoes}</div>
    </div>
  );
}

/* Laranja cheio só no que não pode esperar (ligar para quem acabou de chegar, entrar na chamada,
   contar como foi a reunião). Abrir conversa é o gesto de toda linha: fica calmo, com o verde do WhatsApp. */
const BotaoDaConversa = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className={BOTAO_CALMO}>
    <IconeWhatsApp className="h-4 w-4 text-[#25D366]" /> Abrir conversa
  </button>
);

function ParaResponder({ o, acoes, agora }: { o: Oportunidade; acoes: AcoesDaVenda; agora: Date }) {
  const novo = o.etapa === 'novo';
  const texto = o.motivo ?? (o.ultimaMensagem ? `“${o.ultimaMensagem}”` : o.passo.texto);
  return (
    <Linha
      nome={o.nome}
      onNome={() => acoes.ficha(o)}
      meta={[o.lugar, o.origem, haQuanto(novo ? o.entrouEm : o.mexeuEm, agora)]}
      botoes={novo ? (
        <>
          {o.telefone && (
            <a href={`tel:+${o.telefone}`} className={BOTAO_PRINCIPAL}><Phone className="h-4 w-4" /> Ligar {telefoneFalado(o.telefone)}</a>
          )}
          {o.telefone && (
            <a href={`https://wa.me/${o.telefone}`} target="_blank" rel="noreferrer" className={BOTAO_CALMO}><IconeWhatsApp className="h-4 w-4 text-[#25D366]" /> WhatsApp</a>
          )}
          <button className={BOTAO_CALMO} onClick={() => acoes.primeiroContato(o)}>Como foi?</button>
        </>
      ) : (
        <>
          {/* Só quando o Davi chamou: mensagem por ler some sozinha ao abrir a conversa. */}
          {o.naoLidas === 0 && <button className={BOTAO_CALMO} onClick={() => acoes.jaRespondi(o)} title="Você falou com ela por ligação ou por outro WhatsApp">Já respondi</button>}
          {o.conversaId ? <BotaoDaConversa onClick={() => acoes.conversaDa(o)} />
            : <button className={BOTAO_CALMO} onClick={() => acoes.ficha(o)}>Ver a ficha</button>}
        </>
      )}
    >
      <p className="text-[14px] mt-1.5 leading-snug line-clamp-2 text-foreground/80">{texto}</p>
      {novo && o.notas && <p className="text-[13px] text-foreground/60 mt-1 whitespace-pre-line line-clamp-4">{o.notas}</p>}
    </Linha>
  );
}

function Solta({ c, acoes, agora }: { c: FonteConversa; acoes: AcoesDaVenda; agora: Date }) {
  const nome = c.nome?.trim() || telefoneFalado(c.telefone);
  return (
    <Linha
      nome={nome}
      meta={[c.nome?.trim() ? telefoneFalado(c.telefone) : null, 'Escreveu no WhatsApp', haQuanto(c.ultima_mensagem_em, agora)]}
      botoes={<BotaoDaConversa onClick={() => acoes.conversa({ nome, conversaId: c.id })} />}
    >
      {c.ultima_mensagem && <p className="text-[14px] text-foreground/75 mt-1.5 leading-snug line-clamp-2">“{c.ultima_mensagem}”</p>}
    </Linha>
  );
}

function minutosAte(iso: string, agora: Date): string {
  const min = Math.round((new Date(iso).getTime() - agora.getTime()) / 60_000);
  if (min <= -1) return `começou há ${-min} min`;
  if (min < 1) return 'começa agora';
  if (min < 60) return `começa em ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `começa em ${h} h${m ? ` e ${m} min` : ''}`;
}

function Reuniao({ r, acoes, agora }: { r: ReuniaoDoDia<ReuniaoDaOportunidade & { title?: string | null }>; acoes: AcoesDaVenda; agora: Date }) {
  const o = r.oportunidade;
  const nome = o?.nome ?? r.reuniao.title ?? 'Reunião';
  const link = r.reuniao.meet_link;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <div className="w-[92px] shrink-0">
        <p className="text-[20px] font-bold tracking-tight tabular-nums text-foreground leading-none">{horaFalada(r.reuniao.scheduled_at)}</p>
        <p className="text-[12.5px] text-foreground/45 mt-1">{diaFalado(r.reuniao.scheduled_at, agora)}</p>
      </div>
      <div className="min-w-[200px] flex-1">
        <button onClick={o ? () => acoes.ficha(o) : undefined} disabled={!o} className={cn('text-left text-[15.5px] font-semibold text-foreground leading-snug', o && 'hover:text-primary transition-colors')}>{nome}</button>
        <p className={cn('text-[13.5px] mt-0.5', r.quando === 'passou' ? COR_DO_TOM.agora : 'text-foreground/55')}>
          {[r.quando === 'passou' ? 'Já passou. Conte como foi.' : r.quando === 'hoje' ? minutosAte(r.reuniao.scheduled_at, agora) : null]
            .filter(Boolean).join('')}
          {o?.sabe.length ? <span className="text-foreground/45">{r.quando === 'amanha' ? '' : ' · '}{o.sabe.join(' · ')}</span> : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        {o?.conversaId && r.quando !== 'passou' && <BotaoDaConversa onClick={() => acoes.conversaDa(o)} />}
        {r.quando === 'hoje' && link && (
          <a href={link} target="_blank" rel="noreferrer" className={BOTAO_PRINCIPAL}><Video className="h-4 w-4" /> Entrar na chamada</a>
        )}
        {/* Só dá para contar como foi depois que começou. */}
        {(r.quando === 'passou' || (r.quando === 'hoje' && new Date(r.reuniao.scheduled_at).getTime() <= agora.getTime())) && (
          <button className={r.quando === 'passou' ? BOTAO_PRINCIPAL : BOTAO_CALMO} onClick={() => acoes.comoFoi(r.reuniao, o)}>Como foi?</button>
        )}
      </div>
    </div>
  );
}

function ParaAcompanhar({ o, acoes }: { o: Oportunidade; acoes: AcoesDaVenda }) {
  return (
    <Linha
      nome={o.nome}
      onNome={() => acoes.ficha(o)}
      meta={[o.lugar, o.origem, ...o.sabe]}
      botoes={
        <>
          {o.passo.tipo === 'remarcar' && <button className={BOTAO_CALMO} onClick={() => acoes.marcarReuniao(o)}>Marcar reunião</button>}
          {o.passo.tipo === 'decisao' && o.reuniao && <button className={BOTAO_CALMO} onClick={() => acoes.comoFoi(o.reuniao!, o)}>Decidiu?</button>}
          {o.conversaId ? <BotaoDaConversa onClick={() => acoes.conversaDa(o)} />
            : o.telefone ? <a href={`tel:+${o.telefone}`} className={BOTAO_CALMO}><Phone className="h-4 w-4" /> Ligar</a> : null}
        </>
      }
    >
      <p className="text-[14px] mt-1.5 leading-snug text-foreground/80">{o.passo.texto}</p>
    </Linha>
  );
}

export type HojeProps = {
  agora: Date;
  oportunidades: Oportunidade[];
  soltas: FonteConversa[];
  reunioes: (ReuniaoDaOportunidade & { title?: string | null })[];
  acoes: AcoesDaVenda;
  /** Quantas ligações ainda faltam hoje (0 fora da frente Lojistas). */
  ligacoesFaltam: number;
  /** A lista de ligações do dia, pronta. */
  ligacoes: ReactNode;
  carregando?: boolean;
};

/** A tela, só com o que recebe: dá para ver com dados de exemplo, sem banco. */
export function HojeView({ agora, oportunidades, soltas, reunioes, acoes, ligacoesFaltam, ligacoes, carregando }: HojeProps) {
  const responder = useMemo(() => paraResponder(oportunidades), [oportunidades]);
  const doDia = useMemo(() => reunioesDoDia(reunioes, oportunidades, agora), [reunioes, oportunidades, agora]);
  const acompanhar = useMemo(() => paraAcompanhar(oportunidades), [oportunidades]);
  const esperando = responder.length + soltas.length;
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="max-w-4xl mx-auto space-y-9 pb-10">
      <header className="pt-2">
        <p className="text-[13px] text-foreground/40 first-letter:uppercase">{data}</p>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground mt-0.5">O que fazer agora</h1>
        <p className="text-[15px] text-foreground/60 mt-1">
          {carregando ? 'Conferindo o que chegou…' : resumoDoDia({
            responder: esperando,
            reunioesHoje: doDia.filter((r) => r.quando === 'hoje').length,
            semRegistro: doDia.filter((r) => r.quando === 'passou').length,
            acompanhar: acompanhar.length,
            ligacoes: ligacoesFaltam,
          })}
        </p>
      </header>

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>
      ) : (
        <>
          <Bloco titulo="Responder agora" conta={esperando} explica="Quem escreveu ou pediu contato e está esperando você." vazio="Ninguém esperando você. Quando alguém escrever ou pedir contato pelo site, aparece aqui na hora.">
            <div className={LISTA}>
              {responder.map((o) => <ParaResponder key={o.id} o={o} acoes={acoes} agora={agora} />)}
              {soltas.map((c) => <Solta key={c.id} c={c} acoes={acoes} agora={agora} />)}
            </div>
          </Bloco>

          <Bloco titulo="Reuniões" conta={doDia.length} explica="As de hoje, as de amanhã e as que passaram sem registro." vazio="Nenhuma reunião hoje nem amanhã.">
            <div className={LISTA}>
              {doDia.map((r) => <Reuniao key={r.reuniao.id} r={r} acoes={acoes} agora={agora} />)}
            </div>
          </Bloco>

          <Bloco titulo="Acompanhar" conta={acompanhar.length} explica="Viu o sistema e não decidiu, faltou à reunião ou a conversa parou." vazio="Nenhuma conversa parada.">
            <div className={LISTA}>
              {acompanhar.map((o) => <ParaAcompanhar key={o.id} o={o} acoes={acoes} />)}
            </div>
          </Bloco>

          {ligacoes}
        </>
      )}
    </div>
  );
}

/** A seção das ligações: o título no mesmo formato das outras e a lista do dia embaixo. */
function Ligacoes({ faltam, aoAbrirConversa }: { faltam: number; aoAbrirConversa: (alvo: { nome: string; conversaId: string }) => void }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mb-3">
        <h2 className="text-[18px] font-semibold tracking-tight text-foreground">Ligar hoje</h2>
        {faltam > 0 && <span className="text-[15px] font-semibold text-primary tabular-nums">{faltam}</span>}
        <p className="text-[13px] text-foreground/40">Lojas que leram a mensagem e não responderam vêm primeiro.</p>
      </div>
      <LigacoesTab aoAbrirConversa={aoAbrirConversa} />
    </section>
  );
}

export function HojeTab() {
  const { frente } = useFrente();
  const lojista = frente === 'lojista';
  const qc = useQueryClient();
  const { oportunidades, soltas, reunioes, linhas, prospects, carregando } = useOportunidades();
  const { acoes, camadas } = useAcoesDaVenda({ prospects, linhas, oportunidades });
  const { data: lista = [] } = useLigacoesDoDia(lojista);
  const faltam = lojista ? lista.filter((l) => !l.ligada_hoje).length : 0;

  /* Quem pede contato pelo site tem que aparecer na hora: a tela confere de 20 em 20 segundos. */
  useEffect(() => {
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['prospects'] });
      qc.invalidateQueries({ queryKey: ['meetings'] });
    }, 20_000);
    return () => clearInterval(t);
  }, [qc]);

  /* E avisa quando chega alguém novo com a tela aberta. */
  const novos = useMemo(() => oportunidades.filter((o) => o.etapa === 'novo' && !o.perdida).map((o) => o.id), [oportunidades]);
  const vistos = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (carregando) return;
    if (vistos.current === null) { vistos.current = new Set(novos); return; }
    for (const id of novos) {
      if (vistos.current.has(id)) continue;
      vistos.current.add(id);
      const o = oportunidades.find((x) => x.id === id);
      if (o) toast.success(`Chegou agora: ${o.nome}`, { description: 'Pediu contato. Está no topo da lista.', duration: 15_000 });
    }
  }, [novos, carregando, oportunidades]);

  const agora = useAgora();

  return (
    <>
      <HojeView
        agora={agora}
        oportunidades={oportunidades}
        soltas={soltas}
        reunioes={reunioes}
        acoes={acoes}
        ligacoesFaltam={faltam}
        carregando={carregando}
        ligacoes={lojista ? <Ligacoes faltam={faltam} aoAbrirConversa={acoes.conversa} /> : null}
      />
      {camadas}
    </>
  );
}

/** A hora de agora, renovada a cada minuto ("começa em 12 min" não pode ficar parado). */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return agora;
}
