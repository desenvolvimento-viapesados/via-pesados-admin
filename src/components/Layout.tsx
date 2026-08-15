import { type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

const PAGE_TITLES: Record<string, string> = {
  '/clientes':    'Clientes',
  '/funil':       'Funil de Vendas',
  '/financeiro':  'Financeiro',
  '/pagamentos':  'Pagamentos',
  '/tickets':     'Tickets',
  '/relatorios':  'Relatórios',
  '/nova-venda':  'Nova Venda',
  '/novo-cliente':'Novo Cliente',
  '/novo-acesso': 'Novo Acesso',
};

function VPLogo() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-8 w-8 flex items-center justify-center">
        <div className="absolute inset-0 rounded-lg bg-primary/20" />
        <span className="relative text-primary font-black text-sm tracking-tight">VP</span>
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-foreground font-light text-base tracking-wide">Via</span>
        <span className="text-primary font-bold text-[10px] tracking-[0.2em] uppercase">Pesados</span>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === '/' || location.pathname === '';

  if (isHome) return <>{children}</>;

  const title = Object.entries(PAGE_TITLES).find(
    ([path]) => location.pathname === path || location.pathname.startsWith(path + '/')
  )?.[1] ?? '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <div className="flex h-14 items-center px-5 gap-4 max-w-5xl mx-auto w-full">
          {/* Back */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-[13px] text-foreground/40 hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Início</span>
          </button>

          {/* Center */}
          <div className="flex-1 flex items-center justify-center gap-2">
            <VPLogo />
            {title && (
              <>
                <span className="text-foreground/20 text-sm">/</span>
                <span className="text-[13px] font-medium text-foreground/70">{title}</span>
              </>
            )}
          </div>

          {/* Right */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={toggleTheme}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-red-400 hover:bg-foreground/[0.06] transition-colors">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-5 py-6 max-w-5xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
