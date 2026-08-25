import { type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';

const PAGE_TITLES: Record<string, string> = {
  '/clientes':   'Clientes',
  '/pagamentos': 'Pagamentos',
  '/financeiro': 'Financeiro',
  '/tickets':    'Suporte',
  '/equipe':     'Equipe',
  '/relatorios': 'Relatórios',
};

const FULLPAGE_ROUTES = new Set(['/crm']);

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === '/' || location.pathname === '';
  const isFullPage = FULLPAGE_ROUTES.has(location.pathname);

  if (isHome || isFullPage) return <>{children}</>;

  const title = Object.entries(PAGE_TITLES).find(
    ([path]) => location.pathname === path || location.pathname.startsWith(path + '/')
  )?.[1] ?? '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <div className="relative w-full flex h-20 items-center px-4 sm:px-6">

          {/* Esquerda: voltar */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-[13px] text-foreground/40 hover:text-foreground transition-colors group z-10"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Início</span>
          </button>

          {/* Centro absoluto: logo VP */}
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none">
            <img
              src={theme === 'dark' ? viaPesadosLogoDark : viaPesadosLogoLight}
              alt="Via Pesados"
              className="h-20 w-auto object-contain"
            />
          </div>

          {/* Direita: título + ações */}
          <div className="ml-auto flex items-center gap-2 z-10">
            {title && (
              <span className="text-[13px] font-medium text-foreground/60 hidden sm:block">{title}</span>
            )}
            <button
              onClick={toggleTheme}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={signOut}
              title="Sair"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-red-400 hover:bg-foreground/[0.06] transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-5 py-6 max-w-6xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
