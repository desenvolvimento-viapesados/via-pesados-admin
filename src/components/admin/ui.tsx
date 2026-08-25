import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* Cabeçalho de seção — hairline no estilo do lojista */
export const SectionHeader = ({ title, right }: { title: string; right?: ReactNode }) => (
  <div className="flex items-center gap-3 mb-4">
    <p className="text-[11px] font-semibold tracking-widest uppercase text-foreground/30 whitespace-nowrap">{title}</p>
    <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
    {right}
  </div>
);

/* Card padrão */
export const Panel = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    className={cn(
      'rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03]',
      className,
    )}
  >
    {children}
  </div>
);

/* Badge de status com mapa de cores */
const STATUS_STYLES: Record<string, string> = {
  // prospect stages
  novo:        'bg-sky-500/15 text-sky-500',
  contato:     'bg-blue-500/15 text-blue-400',
  reuniao:     'bg-violet-500/15 text-violet-400',
  proposta:    'bg-amber-500/15 text-amber-500',
  fechamento:  'bg-orange-500/15 text-orange-400',
  ganho:       'bg-emerald-500/15 text-emerald-500',
  perdido:     'bg-red-500/15 text-red-400',
  // clients
  onboarding:   'bg-amber-500/15 text-amber-500',
  ativo:        'bg-emerald-500/15 text-emerald-500',
  inadimplente: 'bg-red-500/15 text-red-400',
  pausado:      'bg-zinc-500/15 text-zinc-400',
  cancelado:    'bg-red-500/15 text-red-400',
  // demos
  rascunho:     'bg-zinc-500/15 text-zinc-400',
  provisionada: 'bg-blue-500/15 text-blue-400',
  apresentada:  'bg-violet-500/15 text-violet-400',
  convertida:   'bg-emerald-500/15 text-emerald-500',
  descartada:   'bg-zinc-500/15 text-zinc-500',
  // payments
  pendente: 'bg-amber-500/15 text-amber-500',
  pago:     'bg-emerald-500/15 text-emerald-500',
  atrasado: 'bg-red-500/15 text-red-400',
  // meetings
  agendada:  'bg-blue-500/15 text-blue-400',
  realizada: 'bg-emerald-500/15 text-emerald-500',
  cancelada: 'bg-red-500/15 text-red-400',
  remarcada: 'bg-amber-500/15 text-amber-500',
  // tickets
  aberto:       'bg-red-500/15 text-red-400',
  em_andamento: 'bg-blue-500/15 text-blue-400',
  aguardando:   'bg-amber-500/15 text-amber-500',
  resolvido:    'bg-emerald-500/15 text-emerald-500',
  // contracts
  enviado:  'bg-blue-500/15 text-blue-400',
  assinado: 'bg-emerald-500/15 text-emerald-500',
};

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo', contato: 'Em contato', reuniao: 'Reunião', proposta: 'Proposta',
  fechamento: 'Fechamento', ganho: 'Ganho', perdido: 'Perdido',
  onboarding: 'Onboarding', ativo: 'Ativo', inadimplente: 'Inadimplente',
  pausado: 'Pausado', cancelado: 'Cancelado',
  rascunho: 'Rascunho', provisionada: 'Provisionada', apresentada: 'Apresentada',
  convertida: 'Convertida', descartada: 'Descartada',
  pendente: 'Pendente', pago: 'Pago', atrasado: 'Atrasado',
  agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada', remarcada: 'Remarcada',
  aberto: 'Aberto', em_andamento: 'Em andamento', aguardando: 'Aguardando', resolvido: 'Resolvido',
  enviado: 'Enviado', assinado: 'Assinado',
};

export const StatusBadge = ({ status, className }: { status: string; className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap',
      STATUS_STYLES[status] ?? 'bg-zinc-500/15 text-zinc-400',
      className,
    )}
  >
    {STATUS_LABELS[status] ?? status}
  </span>
);

/* Estado vazio */
export const EmptyState = ({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
    <div className="text-foreground/15 [&>svg]:h-9 [&>svg]:w-9 [&>svg]:stroke-[1.25]">{icon}</div>
    <p className="text-[13px] text-foreground/40 font-medium">{title}</p>
    {sub && <p className="text-[11px] text-foreground/25">{sub}</p>}
  </div>
);

/* KPI simples */
export const Kpi = ({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: string }) => (
  <Panel className="p-4">
    <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30">{label}</p>
    <p className={cn('text-[22px] font-bold tracking-tight mt-1 tabular-nums', accent ?? 'text-foreground')}>{value}</p>
    {sub && <p className="text-[11px] text-foreground/35 mt-0.5">{sub}</p>}
  </Panel>
);

/* Avatar com inicial */
export const InitialAvatar = ({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }) => {
  const cls = size === 'sm' ? 'h-7 w-7 text-[11px]' : size === 'lg' ? 'h-12 w-12 text-[16px]' : 'h-9 w-9 text-[13px]';
  if (src) return <img src={src} alt="" className={cn(cls, 'rounded-full object-cover border border-black/10 dark:border-white/10 shrink-0')} />;
  return (
    <div className={cn(cls, 'rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-primary font-semibold shrink-0')}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
};
