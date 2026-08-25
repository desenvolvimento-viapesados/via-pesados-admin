import { type ReactNode, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, TrendingUp, DollarSign, CreditCard, MessageSquare, BarChart3,
  ChevronRight, UserCheck, CalendarDays, Presentation, LogOut, Sun, Moon,
  UserPlus, CalendarPlus, MonitorPlay, Building2, ExternalLink, Kanban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import {
  useProspects, useMeetings, useClients, useTickets, brl,
} from '@/hooks/useAdmin';
import { InitialAvatar } from '@/components/admin/ui';
import { LOJISTA_APP_URL } from '@/integrations/supabase/client';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';

/* ── Tile de módulo ─────────────────────────────────────────── */
const ModuleTile = ({
  label, description, icon, onClick, badge,
}: {
  label: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: number;
}) => (
  <button
    onClick={onClick}
    className={cn(
      'group relative flex flex-col items-start gap-3 p-4 rounded-2xl w-full text-left transition-all duration-200',
      'bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.07] dark:border-white/[0.08]',
      'hover:bg-black/[0.06] dark:hover:bg-white/[0.07] hover:border-black/[0.13] dark:hover:border-white/[0.16]',
      'hover:shadow-lg hover:shadow-black/20 cursor-pointer',
    )}
  >
    {badge !== undefined && badge > 0 && (
      <span className="absolute top-3 right-3 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
        {badge}
      </span>
    )}
    <div className="text-foreground/60 group-hover:text-primary transition-colors duration-200">
      <div className="[&>svg]:h-5 [&>svg]:w-5 [&>svg]:stroke-[1.5]">{icon}</div>
    </div>
    <div>
      <p className="text-[13px] font-medium text-foreground leading-tight">{label}</p>
      <p className="text-[11px] text-foreground/40 leading-snug mt-0.5">{description}</p>
    </div>
  </button>
);

/* ── Ação rápida com acento colorido ────────────────────────── */
const ACCENT_CLASSES: Record<string, string> = {
  amber:   'text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-400/20 bg-orange-50 dark:bg-orange-400/[0.06] hover:bg-orange-100 dark:hover:bg-orange-400/[0.12] hover:border-orange-400 dark:hover:border-orange-400/40',
  emerald: 'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-400/20 bg-emerald-50 dark:bg-emerald-400/[0.06] hover:bg-emerald-100 dark:hover:bg-emerald-400/[0.12] hover:border-emerald-400 dark:hover:border-emerald-400/40',
  blue:    'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-400/20 bg-blue-50 dark:bg-blue-400/[0.06] hover:bg-blue-100 dark:hover:bg-blue-400/[0.12] hover:border-blue-400 dark:hover:border-blue-400/40',
  violet:  'text-violet-600 dark:text-violet-400 border-violet-300 dark:border-violet-400/20 bg-violet-50 dark:bg-violet-400/[0.06] hover:bg-violet-100 dark:hover:bg-violet-400/[0.12] hover:border-violet-400 dark:hover:border-violet-400/40',
};

const QuickAction = ({
  label, sub, icon, onClick, accent,
}: {
  label: string;
  sub: string;
  icon: ReactNode;
  onClick: () => void;
  accent: keyof typeof ACCENT_CLASSES;
}) => (
  <button
    onClick={onClick}
    className={cn(
      'group relative flex flex-col items-start gap-3 p-5 rounded-2xl border transition-all duration-200 w-full text-left',
      ACCENT_CLASSES[accent],
      'hover:shadow-lg hover:shadow-black/20 hover:-translate-y-px',
    )}
  >
    <div className="opacity-70 group-hover:opacity-100 transition-opacity [&>svg]:h-5 [&>svg]:w-5 [&>svg]:stroke-[1.5]">
      {icon}
    </div>
    <div>
      <p className="text-[13px] font-semibold leading-tight">{label}</p>
      <p className="text-[11px] opacity-50 mt-0.5">{sub}</p>
    </div>
  </button>
);

/* ── Home ───────────────────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { member, user, signOut } = useAuth();

  const { data: prospects = [] } = useProspects();
  const { data: meetings = [] } = useMeetings();
  const { data: clients = [] } = useClients();
  const { data: tickets = [] } = useTickets();

  const displayName = member?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const firstName = displayName.split(' ')[0];

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  })();
  const formattedDate = (() => {
    const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return d.charAt(0).toUpperCase() + d.slice(1);
  })();

  const stats = useMemo(() => {
    const activeStages = new Set(['novo', 'contato', 'reuniao', 'proposta', 'fechamento']);
    const activeProspects = prospects.filter((p) => activeStages.has(p.stage)).length;

    const today = new Date();
    const isToday = (iso: string) => {
      const d = new Date(iso);
      return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    };
    const meetingsToday = meetings.filter((m) => m.status === 'agendada' && isToday(m.scheduled_at)).length;

    const mrr = clients.filter((c) => c.status === 'ativo' || c.status === 'onboarding').reduce((s, c) => s + (c.mrr ?? 0), 0);
    const onboardingCount = clients.filter((c) => c.status === 'onboarding').length;
    const openTickets = tickets.filter((t) => t.status !== 'resolvido').length;

    return { activeProspects, meetingsToday, mrr, onboardingCount, openTickets };
  }, [prospects, meetings, clients, tickets]);

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── Nav bar ──────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 w-full border-b border-black/[0.08] dark:border-white/[0.06] bg-background/80 backdrop-blur-xl">
        <div className="w-full px-4 sm:px-8 h-20 flex items-center relative">

          {/* Usuário — esquerda */}
          <div className="flex items-center gap-2.5 min-w-0">
            <InitialAvatar name={displayName} src={member?.avatar_url} size="sm" />
            <div className="min-w-0 hidden sm:block leading-none">
              <p className="text-[13px] font-medium text-foreground truncate">{displayName}</p>
              <p className="text-[11px] text-foreground/40 truncate mt-0.5">{member?.email || user?.email}</p>
            </div>
          </div>

          {/* Logo — centro absoluto */}
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none">
            <img
              src={theme === 'dark' ? viaPesadosLogoDark : viaPesadosLogoLight}
              alt="Via Pesados"
              className="h-20 w-auto object-contain"
            />
          </div>

          {/* Ações — direita */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={toggleTheme}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => window.open(LOJISTA_APP_URL, '_blank')}
              title="Sistema Lojista"
              className="h-8 w-8 rounded-lg hidden sm:flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <button
              onClick={signOut}
              title="Sair"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/50 hover:text-red-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Page ─────────────────────────────────────────────── */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-8 py-6 sm:py-10 flex flex-col gap-6 sm:gap-10">

        {/* Saudação */}
        <div className="py-2 flex flex-col gap-1">
          <h1 className="text-[28px] sm:text-[42px] leading-tight tracking-tight min-w-0 break-words">
            <span className="font-extralight text-foreground/40">{greeting}, </span>
            <span className="font-bold text-foreground">{firstName}.</span>
          </h1>
          <div className="flex items-center justify-between gap-4 min-w-0">
            <p className="text-[13px] text-foreground/50 font-light tracking-wide">
              Central de comando Via Pesados.
            </p>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-foreground/35 font-light tracking-wide">{formattedDate}</p>
              <p className="text-[20px] sm:text-[28px] font-bold text-foreground leading-tight tracking-tight tabular-nums">
                {brl(stats.mrr)}
                <span className="text-[11px] sm:text-[13px] font-normal text-foreground/40 ml-1">MRR</span>
              </p>
            </div>
          </div>
        </div>

        {/* Destaques */}
        <div className="flex flex-col gap-3">

          {/* Hero split — Funil | Reuniões */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/funil')}
              className={cn(
                'group flex items-center gap-3 px-6 py-6 rounded-2xl text-left transition-all duration-200',
                'border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03]',
                'hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:border-black/[0.13] dark:hover:border-white/[0.13] hover:shadow-lg hover:shadow-black/20',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground tracking-tight">Funil de Vendas</p>
                <p className="text-[11px] text-foreground/40 mt-0.5 font-light">
                  {stats.activeProspects} negociaç{stats.activeProspects === 1 ? 'ão ativa' : 'ões ativas'}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>

            <button
              onClick={() => navigate('/reunioes')}
              className={cn(
                'group flex items-center gap-3 px-6 py-6 rounded-2xl transition-all duration-200',
                'border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03]',
                'hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:border-black/[0.13] dark:hover:border-white/[0.13] hover:shadow-lg hover:shadow-black/20',
              )}
            >
              {stats.meetingsToday > 0 ? (
                <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {stats.meetingsToday}
                </span>
              ) : (
                <CalendarDays className="h-4 w-4 text-foreground/20 group-hover:text-primary transition-colors shrink-0" />
              )}
              <div className="min-w-0 flex-1 text-right">
                <p className="text-sm font-semibold text-foreground tracking-tight">Reuniões</p>
                <p className="text-[11px] text-foreground/40 mt-0.5 font-light">
                  {stats.meetingsToday > 0 ? `${stats.meetingsToday} hoje` : 'Agenda de vendas'}
                </p>
              </div>
            </button>
          </div>

          {/* Ações rápidas */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <QuickAction
              label="Novo Prospect"
              sub="Empresa em negociação"
              icon={<UserPlus />}
              accent="amber"
              onClick={() => navigate('/funil?new=1')}
            />
            <QuickAction
              label="Nova Reunião"
              sub="Agendar apresentação"
              icon={<CalendarPlus />}
              accent="blue"
              onClick={() => navigate('/reunioes?new=1')}
            />
            <QuickAction
              label="Nova Amostra"
              sub="Demo com a marca do prospect"
              icon={<MonitorPlay />}
              accent="violet"
              onClick={() => navigate('/amostras?new=1')}
            />
            <QuickAction
              label="Novo Cliente"
              sub="Venda fechada"
              icon={<Building2 />}
              accent="emerald"
              onClick={() => navigate('/clientes?new=1')}
            />
          </div>
        </div>

        {/* Módulos */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-[11px] font-semibold tracking-widest uppercase text-foreground/30">Módulos</p>
            <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <ModuleTile label="Funil de Vendas" description="Pipeline de negociações"  icon={<Kanban />}        onClick={() => navigate('/funil')} />
            <ModuleTile label="Reuniões"        description="Agenda comercial"          icon={<CalendarDays />}  onClick={() => navigate('/reunioes')} />
            <ModuleTile label="Amostras"        description="Demos personalizadas"      icon={<Presentation />}  onClick={() => navigate('/amostras')} />
            <ModuleTile label="Clientes"        description="Carteira e onboarding"     icon={<Users />}         onClick={() => navigate('/clientes')} badge={stats.onboardingCount} />
            <ModuleTile label="Pagamentos"      description="Cobranças e recebimentos"  icon={<CreditCard />}    onClick={() => navigate('/pagamentos')} />
            <ModuleTile label="Financeiro"      description="MRR e fluxo de caixa"      icon={<DollarSign />}    onClick={() => navigate('/financeiro')} />
            <ModuleTile label="Suporte"         description="Tickets dos clientes"      icon={<MessageSquare />} onClick={() => navigate('/tickets')} badge={stats.openTickets} />
            <ModuleTile label="Relatórios"      description="Conversão e métricas"      icon={<BarChart3 />}     onClick={() => navigate('/relatorios')} />
            <ModuleTile label="Equipe"          description="Membros e acessos"         icon={<UserCheck />}     onClick={() => navigate('/equipe')} />
            <ModuleTile label="Crescimento"     description="Evolução da carteira"      icon={<TrendingUp />}    onClick={() => navigate('/financeiro')} />
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="w-full border-t border-black/[0.06] dark:border-white/[0.06] px-6 sm:px-10 py-4">
        <p className="text-[11px] text-foreground/30 leading-tight">
          Painel da empresa · <span className="text-foreground/50 font-medium">Via Pesados</span>
        </p>
      </footer>
    </div>
  );
}
