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
  '/whatsapp':   'Canal oficial do WhatsApp',
  '/metas':      'Metas',
  '/inadimplencia': 'Inadimplência',
  '/planos':     'Planos e preços',
  '/saude':      'Saúde da plataforma',
};

/* O "voltar" vai para o Início, como sempre foi — menos dentro de um
   cliente: da ficha volta para a lista, e da cobrança ou do onboarding volta
   para a ficha. */
function voltarDe(pathname: string): { para: string; rotulo: string } {
  const sub = pathname.match(/^\/clientes\/([^/]+)\/(cobranca|onboarding)/);
  if (sub) return { para: `/clientes/${sub[1]}`, rotulo: 'Cliente' };
  if (/^\/clientes\/[^/]+$/.test(pathname)) return { para: '/clientes', rotulo: 'Clientes' };
  // O canal oficial é aberto pelo WhatsApp do CRM e volta para lá.
  if (pathname === '/whatsapp') return { para: '/crm?tab=whatsapp', rotulo: 'CRM' };
  return { para: '/', rotulo: 'Início' };
}

// Telas que trazem o próprio cabeçalho. Comparação por prefixo porque a
// ficha do prospect é /crm/prospect/<id> — com Set de caminho exato ela
// ganharia dois cabeçalhos empilhados.
const FULLPAGE_PREFIXES = ['/crm'];

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === '/' || location.pathname === '';
  const isFullPage = FULLPAGE_PREFIXES.some(
    (r) => location.pathname === r || location.pathname.startsWith(r + '/'),
  );

  if (isHome || isFullPage) return <>{children}</>;

  const voltar = voltarDe(location.pathname);
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
            onClick={() => navigate(voltar.para)}
            className="flex items-center gap-1.5 text-[13px] text-foreground/40 hover:text-foreground transition-colors group z-10"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>{voltar.rotulo}</span>
          </button>

          {/* Centro absoluto: logo VP */}
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none">
            <img
              src={theme === 'dark' ? viaPesadosLogoDark : viaPesadosLogoLight}
              alt="Via Pesados"
              className="h-10 w-auto object-contain"
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
