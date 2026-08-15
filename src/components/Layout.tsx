import { type ReactNode, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Kanban, DollarSign, BarChart3,
  Sun, Moon, LogOut, ChevronRight, Building2, Plus,
  CreditCard, Ticket, UserPlus, Menu, X,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clientes',    icon: Users,           label: 'Clientes' },
  { to: '/funil',       icon: Kanban,          label: 'Funil de Vendas' },
  { to: '/financeiro',  icon: DollarSign,      label: 'Financeiro' },
  { to: '/pagamentos',  icon: CreditCard,      label: 'Pagamentos' },
  { to: '/tickets',     icon: Ticket,          label: 'Tickets' },
  { to: '/relatorios',  icon: BarChart3,       label: 'Relatórios' },
];

const QUICK = [
  { to: '/nova-venda',   icon: DollarSign, label: 'Nova Venda',   color: 'text-orange-500' },
  { to: '/novo-cliente', icon: Building2,  label: 'Novo Cliente', color: 'text-blue-500' },
  { to: '/novo-acesso',  icon: UserPlus,   label: 'Novo Acesso',  color: 'text-emerald-500' },
];

function NavItem({ to, icon: Icon, label, onClick }: { to: string; icon: typeof LayoutDashboard; label: string; onClick?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  return (
    <button
      onClick={() => { navigate(to); onClick?.(); }}
      className={cn(
        'group flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-foreground/60 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-foreground/40 group-hover:text-foreground/70')} />
      {label}
      {active && <ChevronRight className="ml-auto h-3.5 w-3.5 text-primary/50" />}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">VP</span>
        </div>
        <div>
          <p className="text-[13px] font-bold text-foreground leading-none">Via Pesados</p>
          <p className="text-[10px] text-foreground/40 mt-0.5">Painel Administrativo</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-foreground/30 px-3 mb-2">Menu</p>
        {NAV.map(item => (
          <NavItem key={item.to} {...item} onClick={() => setMobileOpen(false)} />
        ))}

        <div className="my-4 h-px bg-black/[0.06] dark:bg-white/[0.06]" />

        <p className="text-[10px] font-semibold tracking-widest uppercase text-foreground/30 px-3 mb-2">Ações Rápidas</p>
        {QUICK.map(({ to, icon: Icon, label, color }) => (
          <button
            key={to}
            onClick={() => { navigate(to); setMobileOpen(false); }}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] font-medium text-foreground/60 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-all"
          >
            <Icon className={cn('h-4 w-4 shrink-0', color)} />
            {label}
            <Plus className="ml-auto h-3 w-3 text-foreground/30" />
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
          VP
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-foreground truncate">Admin</p>
          <p className="text-[10px] text-foreground/40 truncate">Via Pesados</p>
        </div>
        <button onClick={toggleTheme} className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors">
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
        <button className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-red-400 transition-colors">
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-black/[0.06] dark:border-white/[0.06] bg-background sticky top-0 h-screen">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-background border-r border-black/[0.06] dark:border-white/[0.06] flex flex-col z-10">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b border-black/[0.06] dark:border-white/[0.06] bg-background/80 backdrop-blur-xl">
          <button onClick={() => setMobileOpen(true)} className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/60 hover:bg-black/[0.05]">
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">VP</span>
          </div>
          <p className="text-[13px] font-semibold text-foreground">Via Pesados Admin</p>
        </div>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
