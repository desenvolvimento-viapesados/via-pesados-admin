import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, DollarSign, CreditCard, MessageSquare, BarChart3, ChevronRight,
  UserCheck, LogOut, Sun, Moon, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useCrmCounts, useTickets, brl } from '@/hooks/useAdmin';
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

/* ── Home ───────────────────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { member, user, signOut } = useAuth();

  const { data: tickets = [] } = useTickets();
  const openTickets = tickets.filter((t) => t.status !== 'resolvido').length;

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

  const counts = useCrmCounts();

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── Nav ──────────────────────────────────────────────── */}
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
              className="h-20 w-auto object-contain"
            />
          </div>

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

      {/* ── Página ───────────────────────────────────────────── */}
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
                {brl(counts.mrr)}
                <span className="text-[11px] sm:text-[13px] font-normal text-foreground/40 ml-1">MRR</span>
              </p>
            </div>
          </div>
        </div>

        {/* ── Hero: Via CRM ──────────────────────────────────── */}
        <div>
          <button
            onClick={() => navigate('/crm')}
            className={cn(
              'group w-full rounded-2xl overflow-hidden border transition-all duration-200 text-left',
              'border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03]',
              'hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:border-black/[0.13] dark:hover:border-white/[0.14]',
              'hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30',
            )}
          >
            <div className="px-6 pt-6 pb-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[18px] sm:text-[20px] font-bold text-foreground tracking-tight leading-tight">Via CRM</p>
                <p className="text-[12px] text-foreground/45 mt-0.5 font-light">
                  Prospects, reuniões, amostras e novas vendas — do primeiro contato ao sistema no ar
                </p>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <p className="text-[10px] text-foreground/35">Pipeline</p>
                <p className="text-[17px] font-bold text-primary tabular-nums leading-tight">
                  {brl(counts.pipeline)}<span className="text-[10px] font-normal text-foreground/35 ml-0.5">/mês</span>
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>

            {/* Resumo por etapa do CRM */}
            <div className="grid grid-cols-4 border-t border-black/[0.06] dark:border-white/[0.06] divide-x divide-black/[0.06] dark:divide-white/[0.06]">
              {[
                { label: 'Prospects', value: counts.funil },
                { label: 'Reuniões', value: counts.reunioes },
                { label: 'Amostras', value: counts.amostras },
                { label: 'Em conexão', value: counts.conexao },
              ].map(({ label, value }) => (
                <div key={label} className="px-3 py-2.5 text-center">
                  <p className="text-[17px] font-bold text-foreground tabular-nums leading-none">{value}</p>
                  <p className="text-[10px] text-foreground/35 mt-1 leading-none">{label}</p>
                </div>
              ))}
            </div>
          </button>

        </div>

        {/* ── Módulos ────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-[11px] font-semibold tracking-widest uppercase text-foreground/30">Módulos</p>
            <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <ModuleTile label="Clientes"   description="Carteira e contas"        icon={<Users />}         onClick={() => navigate('/clientes')} />
            <ModuleTile label="Pagamentos" description="Cobranças e recebimentos" icon={<CreditCard />}    onClick={() => navigate('/pagamentos')} />
            <ModuleTile label="Financeiro" description="MRR e fluxo de caixa"     icon={<DollarSign />}    onClick={() => navigate('/financeiro')} />
            <ModuleTile label="Suporte"    description="Tickets dos clientes"     icon={<MessageSquare />} onClick={() => navigate('/tickets')} badge={openTickets} />
            <ModuleTile label="Relatórios" description="Conversão e crescimento"  icon={<BarChart3 />}     onClick={() => navigate('/relatorios')} />
            <ModuleTile label="Equipe"     description="Membros e acessos"        icon={<UserCheck />}     onClick={() => navigate('/equipe')} />
          </div>
        </div>
      </main>

      {/* ── Rodapé ───────────────────────────────────────────── */}
      <footer className="w-full border-t border-black/[0.06] dark:border-white/[0.06] px-6 sm:px-10 py-4">
        <p className="text-[11px] text-foreground/30 leading-tight">
          Painel da empresa · <span className="text-foreground/50 font-medium">Via Pesados</span>
        </p>
      </footer>
    </div>
  );
}
