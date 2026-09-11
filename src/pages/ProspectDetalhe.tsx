import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Phone, MapPin, MessageCircle, CalendarPlus, MonitorPlay, Trophy,
  XCircle, Loader2, Clock, Radio, ExternalLink, StickyNote, Send, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useProspects, useUpdateProspect, useChannels, useProspectEvents,
  useMeetings, useDemos, useActivities, useCreateActivity,
  brl, type Prospect, type ProspectStage, type Demo,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge } from '@/components/admin/ui';
import { AgendarReuniaoDialog } from '@/components/crm/AgendarReuniaoDialog';
import { DemoDialog } from '@/components/crm/AmostrasTab';
import { CidadeUF } from '@/components/crm/CidadeUF';
import { CampoMascarado } from '@/components/crm/CampoMascarado';
import { mascaraTelefone, mascaraMoeda, moedaDeNumero, valorDaMoeda } from '@/lib/mascaras';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const ROTULO_ETAPA: Record<ProspectStage, string> = {
  contato: 'Contato',
  oportunidade: 'Oportunidade',
  reuniao: 'Reunião',
  vendido: 'Vendido',
  perdido: 'Perdido',
};

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "3 dias", "5 h", "12 min" — duração legível sem casas decimais inúteis. */
function duracao(ms: number) {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} dias`;
}

/* ── Cartão ───────────────────────────────────────────────────── */
function Cartao({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/[0.07] dark:border-white/[0.07] bg-black/[0.015] dark:bg-white/[0.02] p-5">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-[10.5px] font-semibold tracking-[0.18em] uppercase text-foreground/30 whitespace-nowrap">{titulo}</h2>
        <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.07]" />
        {acao}
      </div>
      {children}
    </section>
  );
}

/* ── Amostra em destaque ──────────────────────────────────────
   A amostra é o argumento de venda: é o sistema do cliente, com a marca
   dele, no ar. Ficava como uma linha de lista no rodapé da ficha, do
   mesmo tamanho de uma anotação. Sobe para o topo, com o link à mão. */
function AmostraDestaque({ amostra }: { amostra: Demo }) {
  const cor = amostra.primary_color || '#E36C0A';
  const logo = amostra.logo_url || amostra.site_logo_url;
  const link = amostra.demo_url;
  const rascunho = amostra.status === 'rascunho';

  return (
    <section className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] overflow-hidden bg-black/[0.015] dark:bg-white/[0.02]">
      {/* Faixa com a marca do cliente — é o que ele vê ao abrir */}
      <div
        className="h-24 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${cor}22, ${cor}0A)` }}
      >
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: cor }} />
        {/* Sem logo entra o monograma, não o nome: o nome já está logo
            abaixo, e repeti-lo faz o cartão parecer um erro de montagem. */}
        {logo
          ? <img src={logo} alt="" className="max-h-12 max-w-[55%] object-contain" />
          : (
            <span
              className="h-12 w-12 rounded-2xl flex items-center justify-center text-[17px] font-bold tracking-tight"
              style={{ background: `${cor}26`, color: cor }}
            >
              {amostra.company_name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
            </span>
          )}
      </div>

      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold tracking-[0.18em] uppercase text-foreground/30">Amostra</p>
            <p className="text-[15px] font-semibold text-foreground mt-1 truncate">{amostra.company_name}</p>
          </div>
          <StatusBadge status={amostra.status} />
        </div>

        {rascunho ? (
          <p className="text-[12px] text-amber-500/90 leading-snug">
            O sistema desta amostra não subiu, então não há link para apresentar.
            Abra a aba Amostras e use "Tentar de novo".
          </p>
        ) : (
          <div className="space-y-2.5">
            <Campo
              rotulo="Link"
              /* Sem o https:// e sem o host: o que distingue uma amostra da
                 outra é o slug, e é ele que precisa caber na linha. */
              valor={link ? link.replace(/^https?:\/\//, '') : '—'}
              copiar={link ?? undefined}
            />
            <Campo rotulo="Login" valor={amostra.admin_email ?? '—'} copiar={amostra.admin_email ?? undefined} />
          </div>
        )}

        {!rascunho && link && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(link); toast.success('Link copiado'); }}
              className="h-10 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-[12px] font-medium text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar link
            </button>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-85"
              style={{ background: cor, color: '#fff' }}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir amostra
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

/** Linha rótulo/valor com cópia — o valor é longo e ninguém digita à mão. */
function Campo({ rotulo, valor, copiar }: { rotulo: string; valor: string; copiar?: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-[11px] text-foreground/35 w-11 shrink-0">{rotulo}</span>
      <span className="text-[11.5px] text-foreground/80 font-mono truncate flex-1" title={valor}>{valor}</span>
      {copiar && (
        <button
          onClick={() => { navigator.clipboard.writeText(copiar); toast.success(`${rotulo} copiado`); }}
          className="text-foreground/30 hover:text-foreground transition-colors shrink-0"
          title={`Copiar ${rotulo.toLowerCase()}`}
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default function ProspectDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { member } = useAuth();

  const { data: prospects = [], isLoading } = useProspects();
  const { data: canais = [] } = useChannels();
  const { data: eventos = [] } = useProspectEvents(id);
  const { data: reunioes = [] } = useMeetings();
  const { data: amostras = [] } = useDemos();
  const { data: atividades = [] } = useActivities({ prospectId: id });

  const atualizar = useUpdateProspect();
  const criarAtividade = useCreateActivity();

  const [reuniaoAberta, setReuniaoAberta] = useState(false);
  const [amostraAberta, setAmostraAberta] = useState(false);
  const [perdaAberta, setPerdaAberta] = useState(false);
  const [motivoPerda, setMotivoPerda] = useState('');
  const [nota, setNota] = useState('');

  const prospect = prospects.find((p) => p.id === id) ?? null;

  /* Tempo em cada etapa, do histórico. É o dado que `stage` sozinho não dá:
     um prospect parado há 40 dias em Oportunidade parece igual a um que
     chegou ontem. */
  const permanencia = useMemo(() => {
    if (eventos.length === 0) return [];
    const linhas: { etapa: ProspectStage; entrou: string; ms: number; atual: boolean }[] = [];
    eventos.forEach((e, i) => {
      const fim = eventos[i + 1] ? new Date(eventos[i + 1].at).getTime() : Date.now();
      linhas.push({
        etapa: e.to_stage,
        entrou: e.at,
        ms: fim - new Date(e.at).getTime(),
        atual: !eventos[i + 1],
      });
    });
    return linhas;
  }, [eventos]);

  const minhasReunioes = useMemo(
    () => reunioes.filter((r) => r.prospect_id === id).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)),
    [reunioes, id],
  );
  const minhasAmostras = useMemo(() => amostras.filter((a) => a.prospect_id === id), [amostras, id]);
  const canal = canais.find((c) => c.id === prospect?.channel_id) ?? null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <p className="text-[13px] text-foreground/50">Prospect não encontrado.</p>
        <button onClick={() => navigate('/crm')} className="text-[13px] text-primary hover:underline">Voltar ao funil</button>
      </div>
    );
  }

  const salvarCampo = async (campo: keyof Prospect, valor: unknown) => {
    if (prospect[campo] === valor) return;
    try {
      await atualizar.mutateAsync({ id: prospect.id, [campo]: valor } as never);
    } catch {
      toast.error('Não foi possível salvar');
    }
  };

  const registrarNota = async () => {
    const texto = nota.trim();
    if (!texto) return;
    try {
      await criarAtividade.mutateAsync({
        prospect_id: prospect.id, kind: 'nota', content: texto, author_id: member?.id ?? null,
      });
      setNota('');
    } catch {
      toast.error('Não foi possível registrar');
    }
  };

  const marcarPerdido = async () => {
    try {
      await atualizar.mutateAsync({ id: prospect.id, stage: 'perdido', lost_reason: motivoPerda.trim() || null });
      toast.success('Prospect marcado como perdido');
      setPerdaAberta(false);
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Topo ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur-xl px-4 sm:px-6 py-4">
        <button
          onClick={() => navigate('/crm')}
          className="flex items-center gap-1.5 text-[13px] text-foreground/40 hover:text-foreground transition-colors group mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Funil</span>
        </button>

        <div className="flex items-end gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-2">
              <p className="text-[11px] font-light tracking-[0.22em] uppercase text-primary">
                {ROTULO_ETAPA[prospect.stage] ?? prospect.stage}
              </p>
              {canal && (
                <>
                  <span className="h-3 w-px bg-foreground/15" />
                  <span className="text-[11px] font-light tracking-[0.12em] uppercase" style={{ color: canal.color }}>
                    {canal.name}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-[26px] sm:text-[32px] font-bold text-foreground leading-[1.1] tracking-tight">
              {prospect.company_name}
            </h1>
            {(prospect.city || prospect.state) && (
              <p className="text-[12px] text-foreground/35 flex items-center gap-1.5 mt-1.5">
                <MapPin className="h-3 w-3" /> {[prospect.city, prospect.state].filter(Boolean).join(' / ')}
              </p>
            )}
          </div>
          {prospect.proposal_value ? (
            <p className="text-[20px] font-semibold text-foreground tabular-nums ml-auto leading-none pb-1">
              {brl(prospect.proposal_value)}
              <span className="text-[11px] font-normal text-foreground/35">/mês</span>
            </p>
          ) : null}
        </div>
        <div className="h-[3px] w-14 bg-primary rounded-full mt-5" />
      </header>

      <main className="px-4 sm:px-6 py-5 max-w-5xl mx-auto grid gap-4 lg:grid-cols-[1fr_340px] items-start">
        {/* ── Coluna principal ───────────────────────────────── */}
        <div className="space-y-4 min-w-0">
          {/* A amostra vem antes de tudo: é o que se mostra ao cliente. */}
          {minhasAmostras.map((a) => <AmostraDestaque key={a.id} amostra={a} />)}

          {/* Ações */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => setReuniaoAberta(true)}
              className="h-10 rounded-xl border border-blue-400/25 bg-blue-400/[0.06] text-blue-400 text-[12px] font-medium hover:bg-blue-400/[0.12] transition-colors flex items-center justify-center gap-1.5"
            >
              <CalendarPlus className="h-3.5 w-3.5" /> Reunião
            </button>
            <button
              onClick={() => setAmostraAberta(true)}
              className="h-10 rounded-xl border border-violet-400/25 bg-violet-400/[0.06] text-violet-400 text-[12px] font-medium hover:bg-violet-400/[0.12] transition-colors flex items-center justify-center gap-1.5"
            >
              <MonitorPlay className="h-3.5 w-3.5" /> Amostra
            </button>
            <button
              onClick={() => setPerdaAberta((v) => !v)}
              disabled={prospect.stage === 'vendido'}
              className="h-10 rounded-xl border border-red-400/20 text-red-400/80 text-[12px] font-medium hover:bg-red-500/10 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5" /> Perdido
            </button>
            <button
              onClick={() => navigate(`/crm/venda/${prospect.id}`)}
              disabled={prospect.stage === 'vendido'}
              className="h-10 rounded-xl bg-emerald-500 text-white text-[12px] font-semibold hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Trophy className="h-3.5 w-3.5" /> Vendido
            </button>
          </div>

          {perdaAberta && (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.04] p-3 space-y-2">
              <input
                className={inputCls}
                placeholder="Motivo da perda — vai para o relatório por canal"
                value={motivoPerda}
                onChange={(e) => setMotivoPerda(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPerdaAberta(false)} className="h-9 rounded-xl border border-black/[0.1] dark:border-white/[0.1] text-[12px] text-foreground/60">
                  Cancelar
                </button>
                <button onClick={marcarPerdido} className="h-9 rounded-xl bg-red-500/15 text-red-400 text-[12px] font-semibold hover:bg-red-500/25">
                  Confirmar perda
                </button>
              </div>
            </div>
          )}

          {/* Linha do tempo do funil */}
          <Cartao titulo="Percurso no funil">
            {permanencia.length === 0 ? (
              <p className="text-[12.5px] text-foreground/35">Sem histórico ainda.</p>
            ) : (
              <ol className="space-y-2">
                {permanencia.map((l, i) => (
                  <li key={i} className="flex items-center gap-3 text-[12.5px]">
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', l.atual ? 'bg-primary' : 'bg-foreground/25')} />
                    <span className="font-medium text-foreground w-28 shrink-0">{ROTULO_ETAPA[l.etapa] ?? l.etapa}</span>
                    <span className="text-foreground/40 tabular-nums">{dataHora(l.entrou)}</span>
                    <span className={cn('ml-auto tabular-nums flex items-center gap-1', l.atual ? 'text-primary' : 'text-foreground/40')}>
                      <Clock className="h-3 w-3" />{duracao(l.ms)}{l.atual && ' — aqui'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Cartao>

          {/* Reuniões */}
          <Cartao
            titulo={`Reuniões (${minhasReunioes.length})`}
            acao={
              <button onClick={() => setReuniaoAberta(true)} className="text-[11.5px] text-primary hover:underline">
                agendar
              </button>
            }
          >
            {minhasReunioes.length === 0 ? (
              <p className="text-[12.5px] text-foreground/35">Nenhuma reunião marcada.</p>
            ) : (
              <ul className="space-y-2">
                {minhasReunioes.map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="text-foreground/40 tabular-nums w-32 shrink-0">{dataHora(r.scheduled_at)}</span>
                    <span className="text-foreground truncate">{r.title}</span>
                    <span className="ml-auto text-[11px] text-foreground/40 capitalize shrink-0">{r.status}</span>
                    {r.meet_link && (
                      <a href={r.meet_link} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          {/* Anotações */}
          <Cartao titulo={`Anotações (${atividades.length})`}>
            <div className="flex gap-2 mb-3">
              <input
                className={inputCls}
                placeholder="O que aconteceu nesse contato?"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') registrarNota(); }}
              />
              <button
                onClick={registrarNota}
                disabled={!nota.trim() || criarAtividade.isPending}
                className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
              >
                {criarAtividade.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
            {atividades.length === 0 ? (
              <p className="text-[12.5px] text-foreground/35 flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5" /> Nada registrado ainda.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {atividades.map((a) => (
                  <li key={a.id} className="text-[12.5px] border-l-2 border-primary/25 pl-2.5">
                    <p className="text-foreground/80 whitespace-pre-wrap break-words">{a.content}</p>
                    <p className="text-[10.5px] text-foreground/30 mt-0.5 tabular-nums">{dataHora(a.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        {/* ── Coluna lateral: os dados ───────────────────────── */}
        <div className="space-y-4">
          <Cartao titulo="Dados">
            <div className="space-y-2.5">
              <input
                className={inputCls}
                defaultValue={prospect.contact_name ?? ''}
                placeholder="Contato"
                onBlur={(e) => salvarCampo('contact_name', e.target.value.trim() || null)}
              />
              <div className="flex items-center gap-2">
                <CampoMascarado
                  className={inputCls}
                  valorInicial={mascaraTelefone(prospect.whatsapp)}
                  mascara={mascaraTelefone}
                  placeholder="WhatsApp"
                  aoSair={(v) => salvarCampo('whatsapp', v || null)}
                />
                {prospect.whatsapp && (
                  <a
                    href={`https://wa.me/55${prospect.whatsapp.replace(/\D/g, '')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="h-10 w-10 shrink-0 rounded-xl border border-emerald-400/25 text-emerald-400 flex items-center justify-center hover:bg-emerald-400/10"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              <CidadeUF
                uf={prospect.state ?? ''}
                cidade={prospect.city ?? ''}
                onChange={({ uf, cidade }) => {
                  salvarCampo('state', uf || null);
                  salvarCampo('city', cidade || null);
                }}
              />
              <CampoMascarado
                className={inputCls}
                valorInicial={moedaDeNumero(prospect.proposal_value)}
                mascara={mascaraMoeda}
                placeholder="Mensalidade proposta (R$)"
                aoSair={(v) => salvarCampo('proposal_value', valorDaMoeda(v))}
              />
            </div>
          </Cartao>

          <Cartao titulo="Aquisição">
            <div className="space-y-2.5">
              <select
                className={inputCls}
                defaultValue={prospect.channel_id ?? ''}
                onChange={(e) => salvarCampo('channel_id', e.target.value || null)}
              >
                <option value="">Canal não informado</option>
                {canais.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                className={inputCls}
                defaultValue={prospect.source ?? ''}
                placeholder="Detalhe: campanha, quem indicou…"
                onBlur={(e) => salvarCampo('source', e.target.value.trim() || null)}
              />
              <p className="text-[11px] text-foreground/35 flex items-start gap-1.5">
                <Radio className="h-3 w-3 mt-0.5 shrink-0" />
                O canal alimenta o CAC e as taxas de funil em Relatórios. O detalhe é livre e não entra nos agrupamentos.
              </p>
            </div>
          </Cartao>

          <Cartao titulo="Observações">
            <textarea
              className={cn(inputCls, 'h-28 py-2 resize-none')}
              defaultValue={prospect.notes ?? ''}
              placeholder="Contexto do negócio"
              onBlur={(e) => salvarCampo('notes', e.target.value.trim() || null)}
            />
            {prospect.lost_reason && (
              <p className="text-[12px] text-red-400/80 mt-2.5 flex items-start gap-1.5">
                <XCircle className="h-3.5 w-3.5 mt-px shrink-0" /> {prospect.lost_reason}
              </p>
            )}
          </Cartao>

        </div>
      </main>

      {reuniaoAberta && (
        <AgendarReuniaoDialog
          prospect={prospect}
          moverParaReuniao={prospect.stage === 'contato' || prospect.stage === 'oportunidade'}
          onClose={() => setReuniaoAberta(false)}
        />
      )}
      <DemoDialog open={amostraAberta} onClose={() => setAmostraAberta(false)} defaultProspectId={prospect.id} />
    </div>
  );
}
