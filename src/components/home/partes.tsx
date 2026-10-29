import { type ReactNode } from 'react';
import { ExternalLink, LogOut, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { InitialAvatar } from '@/components/admin/ui';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';

/* As peças da tela inicial, iguais nas três frentes: a barra de cima, a
   saudação e o botão de módulo. Saíram da Home sem mudar uma classe — a
   tela de Lojistas continua exatamente como era. */

/* ── Tile de módulo ─────────────────────────────────────────── */
export const ModuleTile = ({
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

export const nomeDeQuemEntrou = (member: { full_name?: string | null } | null, email?: string | null) =>
  member?.full_name || email?.split('@')[0] || 'Usuário';

/* ── Nav ──────────────────────────────────────────────────────── */
export function NavDaHome({ sistema }: { sistema?: { url: string; titulo: string } }) {
  const { theme, toggleTheme } = useTheme();
  const { member, user, signOut } = useAuth();
  const displayName = nomeDeQuemEntrou(member, user?.email);

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-black/[0.08] dark:border-white/[0.06] bg-background/80 backdrop-blur-xl">
      <div className="w-full px-4 sm:px-8 h-20 flex items-center relative">
        <div className="flex items-center gap-2.5 min-w-0">
          <InitialAvatar name={displayName} src={member?.avatar_url} size="sm" />
          <div className="min-w-0 hidden sm:block leading-none">
            <p className="text-[13px] font-medium text-foreground truncate">{displayName}</p>
            <p className="text-[11px] text-foreground/40 truncate mt-0.5">{member?.email || user?.email}</p>
          </div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none">
          <img
            src={theme === 'dark' ? viaPesadosLogoDark : viaPesadosLogoLight}
            alt="Via Pesados"
            className="h-10 w-auto object-contain"
          />
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={toggleTheme}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {sistema && (
            <button
              onClick={() => window.open(sistema.url, '_blank')}
              title={sistema.titulo}
              className="h-8 w-8 rounded-lg hidden sm:flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
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
  );
}

/* ── Saudação ─────────────────────────────────────────────────── */
export function Saudacao({ numero, rotulo, nota }: { numero: string; rotulo: string; nota?: string | null }) {
  const { member, user } = useAuth();
  const firstName = nomeDeQuemEntrou(member, user?.email).split(' ')[0];
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  })();
  const formattedDate = (() => {
    const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return d.charAt(0).toUpperCase() + d.slice(1);
  })();

  return (
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
            {numero}
            <span className="text-[11px] sm:text-[13px] font-normal text-foreground/40 ml-1">{rotulo}</span>
          </p>
          {nota && (
            <p className="text-[10px] text-foreground/35 font-light">{nota}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Rodapé ───────────────────────────────────────────────────── */
export const RodapeDaHome = () => (
  <footer className="w-full border-t border-black/[0.06] dark:border-white/[0.06] px-6 sm:px-10 py-4">
    <p className="text-[11px] text-foreground/30 leading-tight">
      Painel da empresa · <span className="text-foreground/50 font-medium">Via Pesados</span>
    </p>
  </footer>
);

/* ── Título de seção ("Módulos") ─────────────────────────────── */
export const TituloDeSecao = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-3 mb-4">
    <p className="text-[11px] font-semibold tracking-widest uppercase text-foreground/30">{children}</p>
    <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
  </div>
);
