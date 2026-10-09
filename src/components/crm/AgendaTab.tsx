import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Loader2, Video, Check, X, CalendarClock, ExternalLink, MonitorPlay, Building2, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useMeetings, useCreateMeeting, useUpdateMeeting, useProspects, useDemos, useAdvanceProspect, type Meeting,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/admin/ui';
import {
  HORA_INICIAL, HORA_FINAL, PX_POR_HORA, inicioDoDia, somarDias, mesmoDia, diasDaSemana, gradeDoMes,
  posicaoNoDia, horarioDoClique, colunasDeSobreposicao, paraCampoLocal, proximaMeiaHora,
} from '@/lib/agenda';

/* A agenda do CRM, no jeito do Google Agenda: semana, mês e dia. Clicar num
   horário vazio marca a reunião ali; clicar numa reunião abre o que dá para
   fazer com ela; arrastar uma reunião agendada muda o horário. */

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const TIPOS: Record<Meeting['kind'], string> = {
  descoberta: 'Descoberta',
  demo: 'Demonstração',
  proposta: 'Proposta',
  fechamento: 'Fechamento',
  onboarding: 'Onboarding',
  outro: 'Outro',
};

/* Cor pelo tipo, como as agendas do Google. O estado muda a força: agendada
   é cheia, realizada fica clara, cancelada fica riscada. */
const COR: Record<Meeting['kind'], { cheia: string; clara: string; ponto: string }> = {
  descoberta: { cheia: 'bg-blue-500 text-white', clara: 'bg-blue-500/15 text-blue-700 dark:text-blue-300', ponto: 'bg-blue-500' },
  demo:       { cheia: 'bg-violet-500 text-white', clara: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', ponto: 'bg-violet-500' },
  proposta:   { cheia: 'bg-amber-500 text-white', clara: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', ponto: 'bg-amber-500' },
  fechamento: { cheia: 'bg-emerald-600 text-white', clara: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', ponto: 'bg-emerald-600' },
  onboarding: { cheia: 'bg-cyan-600 text-white', clara: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300', ponto: 'bg-cyan-600' },
  outro:      { cheia: 'bg-slate-500 text-white', clara: 'bg-slate-500/15 text-slate-600 dark:text-slate-300', ponto: 'bg-slate-500' },
};

const corDa = (m: Meeting) => {
  const c = COR[m.kind] ?? COR.outro;
  if (m.status === 'agendada') return c.cheia;
  if (m.status === 'cancelada') return 'bg-black/[0.05] dark:bg-white/[0.06] text-foreground/40 line-through';
  return c.clara;
};

const duracao = (m: Meeting) => m.duration_min || 45;
const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const nomeDa = (m: Meeting) => m.prospect?.company_name ?? m.title;

type Visao = 'dia' | 'semana' | 'mes';

function tituloDoPeriodo(visao: Visao, ref: Date) {
  if (visao === 'mes') return ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  if (visao === 'dia') return ref.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dias = diasDaSemana(ref);
  const a = dias[0];
  const b = dias[6];
  const mes = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} de ${mes(b)} de ${b.getFullYear()}`
    : `${a.getDate()} de ${mes(a)} – ${b.getDate()} de ${mes(b)} de ${b.getFullYear()}`;
}

/* ─── Nova reunião ─────────────────────────────────────────────── */

function NovaReuniao({
  quando, prospectId, onClose,
}: {
  quando: Date | null;
  prospectId?: string | null;
  onClose: () => void;
}) {
  const { member } = useAuth();
  const criar = useCreateMeeting();
  const avancar = useAdvanceProspect();
  const { data: prospects = [] } = useProspects();
  const { data: demos = [] } = useDemos();
  const vazio = { prospect_id: '', scheduled_at: '', duration_min: '45', kind: 'descoberta', demo_id: '', meet_link: '', notes: '' };
  const [form, setForm] = useState(vazio);

  useEffect(() => {
    if (quando) setForm({ ...vazio, prospect_id: prospectId ?? '', scheduled_at: paraCampoLocal(quando) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quando?.getTime(), prospectId]);

  if (!quando) return null;
  const set = (k: keyof typeof vazio, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const ativos = prospects.filter((p) => p.stage !== 'vendido' && p.stage !== 'perdido');
  const amostras = demos.filter((d) => d.status !== 'descartada' && (!form.prospect_id || d.prospect_id === form.prospect_id));

  const salvar = async () => {
    const inicio = new Date(form.scheduled_at);
    if (!form.scheduled_at || Number.isNaN(inicio.getTime())) { toast.error('Informe a data e a hora'); return; }
    const prospect = prospects.find((p) => p.id === form.prospect_id);
    const tipo = form.kind as Meeting['kind'];
    try {
      await criar.mutateAsync({
        prospect_id: prospect?.id ?? null,
        demo_id: form.demo_id || null,
        title: prospect ? `${TIPOS[tipo]} — ${prospect.company_name}` : TIPOS[tipo],
        scheduled_at: inicio.toISOString(),
        duration_min: Number(form.duration_min) || 45,
        kind: tipo,
        status: 'agendada',
        meet_link: form.meet_link.trim() || null,
        notes: form.notes.trim() || null,
        owner_id: member?.id ?? null,
      });
      // A etapa só anda depois da reunião existir.
      if (prospect) await avancar.mutateAsync({ id: prospect.id, from: prospect.stage, to: 'reuniao' });
      toast.success(`Reunião marcada para ${inicio.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Não consegui marcar a reunião');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Nova reunião</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <select className={inputCls} value={form.prospect_id} onChange={(e) => set('prospect_id', e.target.value)}>
            <option value="">Com quem? (prospect)</option>
            {ativos.map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}
          </select>

          <div className="grid grid-cols-[1fr_96px] gap-2.5">
            <input className={inputCls} type="datetime-local" value={form.scheduled_at} onChange={(e) => set('scheduled_at', e.target.value)} />
            <select className={inputCls} value={form.duration_min} onChange={(e) => set('duration_min', e.target.value)} title="Duração">
              {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60}h${m % 60 ? '30' : ''}`}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TIPOS) as Meeting['kind'][]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set('kind', k)}
                className={cn(
                  'h-7 px-2.5 rounded-full text-[11.5px] font-medium flex items-center gap-1.5 border transition-colors',
                  form.kind === k
                    ? 'border-foreground/25 bg-black/[0.05] dark:bg-white/[0.08] text-foreground'
                    : 'border-black/[0.08] dark:border-white/[0.1] text-foreground/50 hover:text-foreground',
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', COR[k].ponto)} /> {TIPOS[k]}
              </button>
            ))}
          </div>

          {amostras.length > 0 && (
            <select className={inputCls} value={form.demo_id} onChange={(e) => set('demo_id', e.target.value)}>
              <option value="">Mostrar uma amostra? (opcional)</option>
              {amostras.map((d) => <option key={d.id} value={d.id}>{d.company_name}</option>)}
            </select>
          )}

          <input className={inputCls} placeholder="Link da chamada (Meet, Zoom…)" value={form.meet_link} onChange={(e) => set('meet_link', e.target.value)} />
          <textarea className={cn(inputCls, 'h-16 py-2 resize-none')} placeholder="Pauta" value={form.notes} onChange={(e) => set('notes', e.target.value)} />

          <button
            onClick={salvar}
            disabled={criar.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Marcar reunião
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Detalhes de uma reunião ──────────────────────────────────── */

function DetalhesDaReuniao({ reuniao, demoUrl, onClose }: { reuniao: Meeting | null; demoUrl?: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  const atualizar = useUpdateMeeting();
  const [remarcando, setRemarcando] = useState(false);
  const [novoHorario, setNovoHorario] = useState('');
  const [novaDuracao, setNovaDuracao] = useState('45');
  const [resultado, setResultado] = useState('');

  useEffect(() => {
    setRemarcando(false);
    if (reuniao) {
      setNovoHorario(paraCampoLocal(new Date(reuniao.scheduled_at)));
      setNovaDuracao(String(duracao(reuniao)));
      setResultado(reuniao.outcome ?? '');
    }
  }, [reuniao?.id]);

  if (!reuniao) return null;
  const inicio = new Date(reuniao.scheduled_at);
  const fim = new Date(inicio.getTime() + duracao(reuniao) * 60_000);

  const mudar = async (patch: Partial<Meeting>, aviso: string) => {
    try {
      await atualizar.mutateAsync({ id: reuniao.id, ...patch });
      toast.success(aviso);
      onClose();
    } catch {
      toast.error('Não consegui salvar');
    }
  };

  const remarcar = () => {
    const d = new Date(novoHorario);
    if (Number.isNaN(d.getTime())) { toast.error('Data inválida'); return; }
    mudar(
      { scheduled_at: d.toISOString(), duration_min: Number(novaDuracao) || 45, status: 'agendada' },
      `Remarcada para ${d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
    );
  };

  const botao = 'h-9 px-3 rounded-xl text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold flex items-start gap-2.5 pr-6">
            <span className={cn('h-3 w-3 rounded mt-1 shrink-0', (COR[reuniao.kind] ?? COR.outro).ponto)} />
            <span className={cn(reuniao.status === 'cancelada' && 'line-through text-foreground/50')}>{reuniao.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-0.5">
          <div className="pl-[22px] space-y-1">
            <p className="text-[13px] text-foreground/75 first-letter:uppercase">
              {inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · {hora(inicio)} – {hora(fim)}
            </p>
            <div className="flex items-center gap-2 text-[11.5px] text-foreground/45">
              <span>{TIPOS[reuniao.kind]}</span>
              <StatusBadge status={reuniao.status} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pl-[22px]">
            {reuniao.meet_link && reuniao.status === 'agendada' && (
              <a href={reuniao.meet_link} target="_blank" rel="noopener noreferrer" className={cn(botao, 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20')}>
                <Video className="h-3.5 w-3.5" /> Entrar na chamada
              </a>
            )}
            {reuniao.prospect_id && (
              <button onClick={() => navigate(`/crm/prospect/${reuniao.prospect_id}`)} className={cn(botao, 'border border-black/[0.08] dark:border-white/[0.1] text-foreground/70 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05]')}>
                <Building2 className="h-3.5 w-3.5" /> {reuniao.prospect?.company_name ?? 'Prospect'}
              </button>
            )}
            {reuniao.demo && demoUrl && (
              <a href={demoUrl} target="_blank" rel="noopener noreferrer" className={cn(botao, 'bg-violet-500/10 text-violet-500 hover:bg-violet-500/20')}>
                <MonitorPlay className="h-3.5 w-3.5" /> Amostra <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {reuniao.notes && (
            <p className="ml-[22px] text-[12.5px] text-foreground/60 whitespace-pre-wrap rounded-xl bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2">{reuniao.notes}</p>
          )}

          {remarcando ? (
            <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] p-3 space-y-2.5">
              <p className="text-[12px] font-semibold text-foreground/70">Novo horário</p>
              <div className="grid grid-cols-[1fr_96px] gap-2.5">
                <input className={inputCls} type="datetime-local" value={novoHorario} onChange={(e) => setNovoHorario(e.target.value)} />
                <select className={inputCls} value={novaDuracao} onChange={(e) => setNovaDuracao(e.target.value)}>
                  {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60}h${m % 60 ? '30' : ''}`}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setRemarcando(false)} className={cn(botao, 'text-foreground/50 hover:text-foreground')}>Voltar</button>
                <button onClick={remarcar} disabled={atualizar.isPending} className={cn(botao, 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60')}>
                  {atualizar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar horário
                </button>
              </div>
            </div>
          ) : reuniao.status === 'agendada' ? (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button onClick={() => mudar({ status: 'realizada' }, 'Reunião marcada como realizada')} className={cn(botao, 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20')}>
                <Check className="h-3.5 w-3.5" /> Realizada
              </button>
              <button onClick={() => setRemarcando(true)} className={cn(botao, 'bg-black/[0.04] dark:bg-white/[0.06] text-foreground/70 hover:text-foreground')}>
                <CalendarClock className="h-3.5 w-3.5" /> Remarcar
              </button>
              <button onClick={() => mudar({ status: 'cancelada' }, 'Reunião cancelada')} className={cn(botao, 'bg-red-500/10 text-red-500 hover:bg-red-500/20')}>
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
            </div>
          ) : reuniao.status === 'realizada' ? (
            <div className="space-y-2">
              <textarea
                className={cn(inputCls, 'h-20 py-2 resize-none')}
                placeholder="Como foi? O que ficou combinado?"
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
              />
              <button
                onClick={() => mudar({ outcome: resultado.trim() || null }, 'Resultado salvo')}
                disabled={atualizar.isPending || resultado === (reuniao.outcome ?? '')}
                className={cn(botao, 'w-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40')}
              >
                Salvar resultado
              </button>
            </div>
          ) : (
            <button onClick={() => setRemarcando(true)} className={cn(botao, 'w-full bg-black/[0.04] dark:bg-white/[0.06] text-foreground/70 hover:text-foreground')}>
              <RotateCcw className="h-3.5 w-3.5" /> Marcar de novo
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Grade de horas (semana e dia) ────────────────────────────── */

function GradeDeHoras({
  dias, reunioes, agora, onNova, onAbrir, onMover,
}: {
  dias: Date[];
  reunioes: Meeting[];
  agora: Date;
  onNova: (d: Date) => void;
  onAbrir: (m: Meeting) => void;
  onMover: (m: Meeting, para: Date) => void;
}) {
  const rolagem = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ id: string; dy: number } | null>(null);
  const altura = (HORA_FINAL - HORA_INICIAL) * PX_POR_HORA;
  const horas = Array.from({ length: HORA_FINAL - HORA_INICIAL }, (_, i) => HORA_INICIAL + i);

  // Abre no começo do expediente — ou mais cedo, se houver reunião antes.
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const primeiras = reunioes
      .filter((m) => dias.some((d) => mesmoDia(new Date(m.scheduled_at), d)))
      .map((m) => new Date(m.scheduled_at).getHours());
    const alvo = Math.max(HORA_INICIAL, Math.min(8, ...primeiras));
    el.scrollTop = (alvo - HORA_INICIAL) * PX_POR_HORA;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias[0]?.getTime()]);

  const doDia = (dia: Date) => reunioes.filter((m) => mesmoDia(new Date(m.scheduled_at), dia));

  return (
    <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] overflow-hidden bg-background">
      {/* Cabeçalho dos dias */}
      <div className="grid border-b border-black/[0.07] dark:border-white/[0.08]" style={{ gridTemplateColumns: `52px repeat(${dias.length}, minmax(0, 1fr))` }}>
        <div />
        {dias.map((d) => {
          const hoje = mesmoDia(d, agora);
          return (
            <div key={d.toISOString()} className="py-2 flex flex-col items-center gap-0.5 border-l border-black/[0.05] dark:border-white/[0.06]">
              <span className={cn('text-[10.5px] uppercase tracking-wider font-medium', hoje ? 'text-primary' : 'text-foreground/40')}>
                {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </span>
              <span className={cn(
                'h-8 min-w-8 px-1 rounded-full flex items-center justify-center text-[17px] tabular-nums',
                hoje ? 'bg-primary text-primary-foreground font-semibold' : 'text-foreground/80',
              )}>
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Corpo com rolagem */}
      <div ref={rolagem} className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)', minHeight: 360 }}>
        <div className="grid relative" style={{ gridTemplateColumns: `52px repeat(${dias.length}, minmax(0, 1fr))`, height: altura }}>
          {/* Régua das horas */}
          <div className="relative">
            {horas.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] text-foreground/35 tabular-nums" style={{ top: i * PX_POR_HORA }}>
                {i === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>

          {dias.map((dia) => {
            const lista = doDia(dia);
            const colunas = colunasDeSobreposicao(lista.map((m) => {
              const ini = new Date(m.scheduled_at);
              const min = ini.getHours() * 60 + ini.getMinutes();
              return { id: m.id, inicio: min, fim: min + duracao(m) };
            }));
            const hoje = mesmoDia(dia, agora);
            const minutoAgora = (agora.getHours() - HORA_INICIAL) * 60 + agora.getMinutes();
            const passou = inicioDoDia(dia) < inicioDoDia(agora);

            return (
              <div
                key={dia.toISOString()}
                className={cn('relative border-l border-black/[0.05] dark:border-white/[0.06] cursor-pointer', passou && 'bg-black/[0.015] dark:bg-white/[0.015]')}
                onClick={(e) => {
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  onNova(horarioDoClique(dia, y));
                }}
                onDragOver={(e) => { if (arrasto.current) e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const a = arrasto.current;
                  arrasto.current = null;
                  const m = a && reunioes.find((r) => r.id === a.id);
                  if (!m) return;
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top - a.dy;
                  onMover(m, horarioDoClique(dia, y, 15));
                }}
              >
                {horas.map((h, i) => (
                  <div key={h} className="absolute inset-x-0 border-t border-black/[0.05] dark:border-white/[0.06]" style={{ top: i * PX_POR_HORA }} />
                ))}

                {lista.map((m) => {
                  const ini = new Date(m.scheduled_at);
                  const { top, altura: h } = posicaoNoDia(ini, duracao(m));
                  const topo = Math.min(top, altura - 22);
                  const pos = colunas.get(m.id) ?? { coluna: 0, total: 1 };
                  const largura = 100 / pos.total;
                  const curta = h < 40;
                  const arrastavel = m.status === 'agendada';
                  return (
                    <button
                      key={m.id}
                      type="button"
                      draggable={arrastavel}
                      onDragStart={(e) => {
                        arrasto.current = { id: m.id, dy: e.clientY - e.currentTarget.getBoundingClientRect().top };
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => { arrasto.current = null; }}
                      onClick={(e) => { e.stopPropagation(); onAbrir(m); }}
                      title={`${hora(ini)} · ${m.title}`}
                      className={cn(
                        'absolute rounded-md px-1.5 text-left overflow-hidden shadow-sm ring-1 ring-background hover:brightness-95 hover:z-20 transition-[filter]',
                        corDa(m),
                        arrastavel && 'cursor-grab active:cursor-grabbing',
                        curta ? 'py-0.5' : 'py-1',
                      )}
                      style={{
                        top: topo,
                        height: h - 2,
                        left: `calc(${pos.coluna * largura}% + 2px)`,
                        width: `calc(${largura}% - 4px)`,
                      }}
                    >
                      {curta ? (
                        <p className="text-[11px] leading-tight truncate"><span className="font-semibold">{nomeDa(m)}</span>, {hora(ini)}</p>
                      ) : (
                        <>
                          <p className="text-[11.5px] font-semibold leading-tight truncate">{nomeDa(m)}</p>
                          <p className="text-[10.5px] opacity-80 leading-tight truncate">
                            {hora(ini)} – {hora(new Date(ini.getTime() + duracao(m) * 60_000))}
                          </p>
                          {h >= 64 && (
                            <p className="text-[10.5px] opacity-80 leading-tight truncate mt-0.5 flex items-center gap-1">
                              {TIPOS[m.kind]}{m.meet_link && <Video className="h-3 w-3 shrink-0" />}
                            </p>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}

                {hoje && minutoAgora >= 0 && minutoAgora <= (HORA_FINAL - HORA_INICIAL) * 60 && (
                  <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: (minutoAgora / 60) * PX_POR_HORA }}>
                    <div className="relative h-[2px] bg-red-500">
                      <span className="absolute -left-1.5 -top-[5px] h-3 w-3 rounded-full bg-red-500" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Mês ──────────────────────────────────────────────────────── */

function GradeDoMes({
  referencia, reunioes, agora, onNova, onAbrir, onDia,
}: {
  referencia: Date;
  reunioes: Meeting[];
  agora: Date;
  onNova: (d: Date) => void;
  onAbrir: (m: Meeting) => void;
  onDia: (d: Date) => void;
}) {
  const casas = gradeDoMes(referencia);
  const cabecalho = casas.slice(0, 7);
  const MAX = 3;

  return (
    <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] overflow-hidden bg-background">
      <div className="grid grid-cols-7 border-b border-black/[0.07] dark:border-white/[0.08]">
        {cabecalho.map((d) => (
          <div key={d.toISOString()} className="py-2 text-center text-[10.5px] uppercase tracking-wider font-medium text-foreground/40">
            {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {casas.map((dia, i) => {
          const doMes = dia.getMonth() === referencia.getMonth();
          const hoje = mesmoDia(dia, agora);
          const lista = reunioes
            .filter((m) => mesmoDia(new Date(m.scheduled_at), dia))
            .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
          return (
            <div
              key={dia.toISOString()}
              onClick={() => { const d = new Date(dia); d.setHours(10, 0, 0, 0); onNova(d); }}
              className={cn(
                'min-h-[104px] p-1 flex flex-col gap-0.5 cursor-pointer border-black/[0.05] dark:border-white/[0.06]',
                i % 7 !== 0 && 'border-l',
                i >= 7 && 'border-t',
                !doMes && 'bg-black/[0.02] dark:bg-white/[0.02]',
              )}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDia(dia); }}
                className={cn(
                  'self-center h-6 min-w-6 px-1 rounded-full text-[12px] tabular-nums hover:bg-black/[0.06] dark:hover:bg-white/[0.08]',
                  hoje ? 'bg-primary text-primary-foreground font-semibold hover:bg-primary' : doMes ? 'text-foreground/75' : 'text-foreground/30',
                )}
              >
                {dia.getDate()}
              </button>
              {lista.slice(0, MAX).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAbrir(m); }}
                  className={cn('w-full rounded px-1.5 py-0.5 text-left text-[11px] leading-tight truncate', corDa(m))}
                >
                  <span className="tabular-nums opacity-80">{hora(new Date(m.scheduled_at))}</span> {nomeDa(m)}
                </button>
              ))}
              {lista.length > MAX && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDia(dia); }}
                  className="text-left px-1.5 text-[11px] font-medium text-foreground/50 hover:text-foreground"
                >
                  mais {lista.length - MAX}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── A aba ────────────────────────────────────────────────────── */

export function AgendaTab({
  newOpen, onCloseNew, defaultProspectId,
}: {
  newOpen: boolean;
  onCloseNew: () => void;
  defaultProspectId?: string | null;
}) {
  const { data: reunioes = [], isLoading } = useMeetings();
  const { data: prospects = [] } = useProspects();
  const { data: demos = [] } = useDemos();
  const atualizar = useUpdateMeeting();

  const [visao, setVisao] = useState<Visao>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'dia' : 'semana'));
  const [referencia, setReferencia] = useState(() => inicioDoDia(new Date()));
  const [agora, setAgora] = useState(() => new Date());
  const [nova, setNova] = useState<{ quando: Date; prospectId?: string | null } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  // A linha vermelha da hora anda sozinha.
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // O botão "+ Reunião" do topo e o deep link ?new=1&prospect=
  useEffect(() => {
    if (newOpen) setNova({ quando: proximaMeiaHora(), prospectId: defaultProspectId });
  }, [newOpen, defaultProspectId]);

  const demoUrl = useMemo(() => Object.fromEntries(demos.map((d) => [d.id, d.demo_url])), [demos]);

  /** Chegou na etapa Reunião e ainda não tem horário marcado. */
  const faltaMarcar = useMemo(() => {
    const comReuniao = new Set(
      reunioes.filter((m) => m.status === 'agendada' || m.status === 'realizada').map((m) => m.prospect_id).filter(Boolean),
    );
    return prospects.filter((p) => p.stage === 'reuniao' && !comReuniao.has(p.id));
  }, [prospects, reunioes]);

  const proximas = useMemo(
    () => reunioes.filter((m) => m.status === 'agendada' && new Date(m.scheduled_at) >= agora).length,
    [reunioes, agora],
  );

  const andar = (passo: number) => {
    setReferencia((r) => {
      if (visao === 'dia') return somarDias(r, passo);
      if (visao === 'semana') return somarDias(r, passo * 7);
      return new Date(r.getFullYear(), r.getMonth() + passo, 1);
    });
  };

  const fecharNova = () => { setNova(null); onCloseNew(); };

  const mover = async (m: Meeting, para: Date) => {
    const antes = m.scheduled_at;
    if (new Date(antes).getTime() === para.getTime()) return;
    try {
      await atualizar.mutateAsync({ id: m.id, scheduled_at: para.toISOString() });
      toast.success(`${nomeDa(m)}: ${para.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, {
        action: { label: 'Desfazer', onClick: () => atualizar.mutate({ id: m.id, scheduled_at: antes }) },
      });
    } catch {
      toast.error('Não consegui mudar o horário');
    }
  };

  const reuniaoAberta = reunioes.find((m) => m.id === aberta) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {faltaMarcar.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-primary/25 bg-primary/[0.05] px-3 py-2.5">
          <span className="text-[12px] font-semibold text-foreground/70 mr-1">Falta marcar horário:</span>
          {faltaMarcar.map((p) => (
            <button
              key={p.id}
              onClick={() => setNova({ quando: proximaMeiaHora(), prospectId: p.id })}
              className="h-7 px-2.5 rounded-full bg-background border border-black/[0.08] dark:border-white/[0.1] text-[12px] font-medium text-foreground/80 hover:border-primary/50 hover:text-primary transition-colors"
            >
              {p.company_name}
            </button>
          ))}
        </div>
      )}

      {/* Barra da agenda */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setReferencia(inicioDoDia(new Date()))}
          className="h-9 px-3.5 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-[12.5px] font-medium text-foreground/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
        >
          Hoje
        </button>
        <div className="flex items-center">
          <button onClick={() => andar(-1)} aria-label="Anterior" className="h-9 w-9 rounded-full flex items-center justify-center text-foreground/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => andar(1)} aria-label="Próximo" className="h-9 w-9 rounded-full flex items-center justify-center text-foreground/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h2 className="text-[17px] font-semibold text-foreground first-letter:uppercase mr-auto">{tituloDoPeriodo(visao, referencia)}</h2>

        {proximas > 0 && (
          <span className="text-[11.5px] text-foreground/40 hidden sm:inline">{proximas} {proximas === 1 ? 'reunião marcada' : 'reuniões marcadas'} pela frente</span>
        )}

        <div className="flex rounded-xl border border-black/[0.1] dark:border-white/[0.12] p-0.5">
          {([['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']] as const).map(([v, r]) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              className={cn(
                'h-8 px-3 rounded-[10px] text-[12px] font-medium transition-colors',
                visao === v ? 'bg-primary/15 text-primary font-semibold' : 'text-foreground/50 hover:text-foreground',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : visao === 'mes' ? (
        <GradeDoMes
          referencia={referencia}
          reunioes={reunioes}
          agora={agora}
          onNova={(d) => setNova({ quando: d })}
          onAbrir={(m) => setAberta(m.id)}
          onDia={(d) => { setReferencia(d); setVisao('dia'); }}
        />
      ) : (
        <GradeDeHoras
          dias={visao === 'dia' ? [referencia] : diasDaSemana(referencia)}
          reunioes={reunioes}
          agora={agora}
          onNova={(d) => setNova({ quando: d })}
          onAbrir={(m) => setAberta(m.id)}
          onMover={mover}
        />
      )}

      <div className="flex items-center gap-3 flex-wrap text-[11px] text-foreground/45">
        {(Object.keys(TIPOS) as Meeting['kind'][]).map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', COR[k].ponto)} />{TIPOS[k]}</span>
        ))}
        <span className="ml-auto hidden sm:inline">Clique num horário para marcar · arraste para remarcar</span>
      </div>

      <NovaReuniao quando={nova?.quando ?? null} prospectId={nova?.prospectId} onClose={fecharNova} />
      <DetalhesDaReuniao reuniao={reuniaoAberta} demoUrl={reuniaoAberta?.demo_id ? demoUrl[reuniaoAberta.demo_id] : null} onClose={() => setAberta(null)} />
    </div>
  );
}
