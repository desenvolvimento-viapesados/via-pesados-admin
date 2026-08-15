import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import {
  Sun, Moon, LogOut, Bell, Globe,
  Users, TrendingUp, DollarSign, CreditCard,
  MessageSquare, BarChart3, UserPlus, KeyRound,
  ShoppingBag, ChevronRight, PlayCircle, Phone,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const QUICK_ACTIONS = [
  {
    id: 'nova-venda',
    label: 'Nova Venda',
    desc: 'Registrar nova venda',
    icon: ShoppingBag,
    accent: 'orange',
    path: '/nova-venda',
  },
  {
    id: 'novo-cliente',
    label: 'Novo Cliente',
    desc: 'Cadastrar cliente',
    icon: UserPlus,
    accent: 'blue',
    path: '/novo-cliente',
  },
  {
    id: 'novo-acesso',
    label: 'Novo Acesso',
    desc: 'Criar acesso ao sistema',
    icon: KeyRound,
    accent: 'emerald',
    path: '/novo-acesso',
  },
] as const;

const MODULES = [
  { id: 'clientes',    label: 'Clientes',        desc: 'Gestão de clientes',         icon: Users,        path: '/clientes' },
  { id: 'funil',       label: 'Funil de Vendas',  desc: 'Pipeline de vendas',          icon: TrendingUp,   path: '/funil' },
  { id: 'financeiro',  label: 'Financeiro',        desc: 'Fluxo de caixa',              icon: DollarSign,   path: '/financeiro' },
  { id: 'pagamentos',  label: 'Pagamentos',        desc: 'Cobranças e recebimentos',    icon: CreditCard,   path: '/pagamentos' },
  { id: 'tickets',     label: 'Tickets',           desc: 'Suporte aos clientes',        icon: MessageSquare, path: '/tickets' },
  { id: 'relatorios',  label: 'Relatórios',        desc: 'Métricas e performance',      icon: BarChart3,    path: '/relatorios' },
] as const;

const ACCENT = {
  orange:  { border: 'border-l-primary',    icon: 'text-primary',      bg: 'bg-primary/[0.06]'      },
  blue:    { border: 'border-l-blue-500',   icon: 'text-blue-400',     bg: 'bg-blue-500/[0.06]'     },
  emerald: { border: 'border-l-emerald-500',icon: 'text-emerald-400',  bg: 'bg-emerald-500/[0.06]'  },
};

export default function Home() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background flex flex-col select-none">

      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 pt-5 pb-4 max-w-3xl mx-auto w-full">
        {/* Left: user */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-[13px]">A</span>
          </div>
          <div className="hidden sm:block">
            <p className="text-[13px] font-semibold text-foreground leading-tight">Administração Via Pesados</p>
            <p className="text-[11px] text-foreground/40 leading-tight">desenvolvimento@viapesados.com.br</p>
          </div>
        </div>

        {/* Center: VP wordmark */}
        <div className="flex items-center gap-2.5">
          <div className="relative h-9 w-9 flex items-center justify-center rounded-xl overflow-hidden">
            <div className="absolute inset-0 bg-primary" />
            <span className="relative text-white font-black text-sm tracking-tight">VP</span>
          </div>
          <div className="flex flex-col leading-[1.15]">
            <span className="text-foreground font-light text-[17px] tracking-wide">Via</span>
            <span className="text-primary font-bold text-[9px] tracking-[0.22em] uppercase">Pesados</span>
          </div>
        </div>

        {/* Right: icons */}
        <div className="flex items-center gap-0.5">
          <button className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
            <Bell className="h-4 w-4" />
          </button>
          <button className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
            <Globe className="h-4 w-4" />
          </button>
          <button
            onClick={toggleTheme}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-red-400 hover:bg-foreground/[0.05] transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────── */}
      <main className="flex-1 px-6 pb-6 max-w-3xl mx-auto w-full flex flex-col gap-5">

        {/* Hero card */}
        <div className="rounded-2xl border border-white/[0.06] bg-card p-5 flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-primary font-black text-xl">VP</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-foreground/35 mb-0.5">
              Painel Administrativo
            </p>
            <h1 className="text-[17px] font-semibold text-foreground leading-tight">Via Pesados</h1>
            <p className="text-[12px] text-foreground/45 mt-0.5 truncate">
              Gerenciamento centralizado de clientes e operações
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-foreground/20 shrink-0" />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-3">
          {QUICK_ACTIONS.map(({ id, label, desc, icon: Icon, accent, path }) => {
            const a = ACCENT[accent];
            return (
              <button
                key={id}
                onClick={() => navigate(path)}
                className={cn(
                  'group flex flex-col gap-3 p-4 rounded-2xl border-l-[3px] border border-white/[0.05] transition-all duration-150 text-left',
                  a.border, a.bg,
                  'hover:brightness-125 active:scale-[0.98]',
                )}
              >
                <Icon className={cn('h-5 w-5', a.icon)} />
                <div>
                  <p className="text-[13px] font-semibold text-foreground leading-tight">{label}</p>
                  <p className="text-[11px] text-foreground/40 mt-0.5">{desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Modules */}
        <div>
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-foreground/30 mb-3 px-0.5">
            Módulos
          </p>
          <div className="grid grid-cols-2 gap-3">
            {MODULES.map(({ id, label, desc, icon: Icon, path }) => (
              <button
                key={id}
                onClick={() => navigate(path)}
                className="group flex items-center gap-4 p-4 rounded-2xl border border-white/[0.05] bg-card hover:bg-card/80 hover:border-white/[0.09] transition-all duration-150 text-left active:scale-[0.99]"
              >
                <div className="h-10 w-10 rounded-xl bg-foreground/[0.05] flex items-center justify-center shrink-0 group-hover:bg-foreground/[0.08] transition-colors">
                  <Icon className="h-5 w-5 text-foreground/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground leading-tight">{label}</p>
                  <p className="text-[11px] text-foreground/40 mt-0.5 truncate">{desc}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-foreground/20 shrink-0 group-hover:text-foreground/40 group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="px-6 pb-5 pt-2 max-w-3xl mx-auto w-full flex items-center justify-between">
        <p className="text-[11px] text-foreground/25">
          Painel Via Pesados · viapesados.com.br/admin
        </p>
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-1.5 text-[11px] text-foreground/30 hover:text-foreground/60 transition-colors">
            <PlayCircle className="h-3.5 w-3.5" />
            <span>Tutoriais</span>
          </button>
          <button className="flex items-center gap-1.5 text-[11px] text-foreground/30 hover:text-foreground/60 transition-colors">
            <Phone className="h-3.5 w-3.5" />
            <span>Suporte</span>
          </button>
        </div>
      </footer>

    </div>
  );
}
