import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import {
  Users, TrendingUp, DollarSign, CreditCard,
  MessageSquare, BarChart3, ChevronRight,
  Target, Banknote, UserCheck, Handshake,
  Contact, Megaphone, BookOpen, Scale,
  ShieldCheck, Puzzle, Clock, Sparkles,
  Truck, LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';
import viaCrmLogoLight from '@/assets/via-crm-logo-light.png';
import viaCrmLogoDark from '@/assets/via-crm-logo-dark.png';

interface ModuleConfig {
  label: string;
  description: string;
  icon: ReactNode;
  path: string;
  comingSoon?: boolean;
}

const MODULE_GROUPS: { title: string; modules: ModuleConfig[] }[] = [
  {
    title: 'Vendas & Receita',
    modules: [
      { label: 'Funil de Vendas',  description: 'Pipeline e negociações',    icon: <TrendingUp />,  path: '/funil'        },
      { label: 'Leads',            description: 'Captação e qualificação',    icon: <Contact />,     path: '/leads'        },
      { label: 'Clientes',         description: 'Base de clientes',           icon: <Users />,       path: '/clientes'     },
      { label: 'Metas',            description: 'Objetivos e performance',    icon: <Target />,      path: '/metas'        },
      { label: 'Comissões',        description: 'Remuneração variável',       icon: <Banknote />,    path: '/comissoes',   comingSoon: true },
      { label: 'Contratos',        description: 'Propostas e contratos',      icon: <Handshake />,   path: '/contratos',   comingSoon: true },
    ],
  },
  {
    title: 'Marketplace & Produto',
    modules: [
      { label: 'Match',            description: 'Compradores × vendedores',   icon: <Puzzle />,      path: '/match'        },
      { label: 'Marketplace',      description: 'Gestão de anúncios',         icon: <Truck />,       path: '/marketplace'  },
      { label: 'Marketing',        description: 'Campanhas e canais',         icon: <Megaphone />,   path: '/marketing',   comingSoon: true },
      { label: 'Inteligência IA',  description: 'Análise e automações',       icon: <Sparkles />,    path: '/inteligencia' },
    ],
  },
  {
    title: 'Pessoas & Operações',
    modules: [
      { label: 'Equipe / RH',      description: 'Funcionários e RH',         icon: <UserCheck />,   path: '/equipe'       },
      { label: 'Ponto Eletrônico', description: 'Registro de jornada',        icon: <Clock />,       path: '/ponto'        },
      { label: 'Treinamentos',     description: 'Capacitação da equipe',      icon: <BookOpen />,    path: '/treinamentos', comingSoon: true },
      { label: 'Acessos',          description: 'Permissões e perfis',        icon: <ShieldCheck />, path: '/acessos'      },
    ],
  },
  {
    title: 'Financeiro & Compliance',
    modules: [
      { label: 'Financeiro',       description: 'Fluxo de caixa',            icon: <DollarSign />,  path: '/financeiro'   },
      { label: 'Pagamentos',       description: 'Cobranças e recebimentos',   icon: <CreditCard />,  path: '/pagamentos'   },
      { label: 'Relatórios',       description: 'Métricas e BI',             icon: <BarChart3 />,   path: '/relatorios'   },
      { label: 'Jurídico',         description: 'Contratos e conformidade',   icon: <Scale />,       path: '/juridico',    comingSoon: true },
    ],
  },
  {
    title: 'Suporte & Gestão',
    modules: [
      { label: 'Tickets',          description: 'Suporte aos clientes',       icon: <MessageSquare />, path: '/tickets'    },
      { label: 'Dashboard',        description: 'Visão geral da operação',    icon: <LayoutGrid />,  path: '/dashboard',   comingSoon: true },
    ],
  },
];

const ModuleTile = ({ label, description, icon, path, comingSoon, onNavigate }: ModuleConfig & { onNavigate: (path: string) => void }) => (
  <button
    onClick={() => !comingSoon && onNavigate(path)}
    className={cn(
      'group relative flex flex-col items-start gap-3 p-4 rounded-2xl w-full text-left transition-all duration-200',
      'bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.07] dark:border-white/[0.08]',
      comingSoon
        ? 'opacity-50 cursor-default'
        : cn(
            'hover:bg-black/[0.06] dark:hover:bg-white/[0.07] hover:border-black/[0.13] dark:hover:border-white/[0.16]',
            'hover:shadow-lg hover:shadow-black/20 cursor-pointer',
          ),
    )}
  >
    {comingSoon && (
      <span className="absolute top-3 right-3 text-[9px] font-semibold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full uppercase tracking-wide">
        breve
      </span>
    )}
    <div className="text-foreground/60 group-hover:text-primary transition-colors duration-200">
      <div className="[&>svg]:h-5 [&>svg]:w-5 [&>svg]:stroke-[1.5]">
        {icon}
      </div>
    </div>
    <div>
      <p className="text-[13px] font-medium text-foreground leading-tight">{label}</p>
      <p className="text-[11px] text-foreground/40 leading-snug mt-0.5">{description}</p>
    </div>
  </button>
);

export default function Home() {
  const navigate = useNavigate();
  const { theme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── Nav bar — só usuário, sem logo ──────────────────── */}
      <nav className="sticky top-0 z-40 w-full border-b border-black/[0.08] dark:border-white/[0.06] bg-background/80 backdrop-blur-xl">
        <div className="w-full px-4 sm:px-8 h-16 flex items-center">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-7 w-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-[11px] font-semibold flex-shrink-0">
              A
            </div>
            <div className="min-w-0 hidden sm:block leading-none">
              <p className="text-[13px] font-medium text-foreground truncate">Administração Via Pesados</p>
              <p className="text-[11px] text-foreground/40 truncate mt-0.5">desenvolvimento@viapesados.com.br</p>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Page ─────────────────────────────────────────────── */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-8 py-12 flex flex-col gap-10">

        {/* Logo central — grande */}
        <div className="flex justify-center pt-2">
          <img
            src={theme === 'dark' ? viaPesadosLogoDark : viaPesadosLogoLight}
            alt="Via Pesados"
            className="h-[110px] w-auto object-contain select-none"
          />
        </div>

        {/* Hero — Via CRM */}
        <button
          onClick={() => navigate('/funil')}
          className={cn(
            'group w-full rounded-3xl overflow-hidden border transition-all duration-200',
            'border-black/[0.07] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.04]',
            'hover:bg-black/[0.07] dark:hover:bg-white/[0.07] hover:border-black/[0.12] dark:hover:border-white/[0.14]',
            'hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30',
          )}
        >
          <div className="flex items-center gap-4 px-5 sm:px-8 py-4 sm:py-5">
            <img
              src={theme === 'dark' ? viaCrmLogoDark : viaCrmLogoLight}
              alt="Via CRM"
              className="h-14 sm:h-16 w-auto select-none shrink-0 opacity-90 group-hover:opacity-100 transition-opacity"
            />
            <div className="text-left min-w-0 flex-1">
              <h2 className="text-base sm:text-xl font-semibold text-foreground tracking-tight leading-tight">
                Da conversa ao fechamento.
              </h2>
              <p className="text-[12px] sm:text-[13px] text-foreground/50 mt-0.5">
                Funil de vendas e negociações
              </p>
            </div>
            <div className="flex items-center gap-1 text-[12px] sm:text-[13px] text-foreground/40 group-hover:text-primary transition-colors shrink-0">
              Acessar <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </button>

        {/* Module groups */}
        {MODULE_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="flex items-center gap-3 mb-4">
              <p className="text-[11px] font-semibold tracking-widest uppercase text-foreground/30 whitespace-nowrap">
                {group.title}
              </p>
              <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {group.modules.map((mod) => (
                <ModuleTile key={mod.path} {...mod} onNavigate={navigate} />
              ))}
            </div>
          </div>
        ))}

      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="w-full border-t border-black/[0.06] dark:border-white/[0.06] px-6 sm:px-10 py-4 flex items-center justify-between gap-4">
        <p className="text-[11px] text-foreground/30 leading-tight">
          Painel Via Pesados · <span className="text-foreground/50 font-medium">viapesados.com.br/admin</span>
        </p>
        <a
          href="https://wa.me/5533997075272"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-foreground/30 hover:text-emerald-400 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Suporte
        </a>
      </footer>

    </div>
  );
}
