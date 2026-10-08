import { useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut, Sun, Moon, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useClients, usePayments, brl } from '@/hooks/useAdmin';
import { mrrDaCarteira } from '@/lib/mrr';
import { SECOES, type Secao, type ChaveDaSecao } from '@/lib/secoes';
import { useIndicadores, type Indicador } from '@/hooks/useIndicadores';
import { useMemo } from 'react';
import { InitialAvatar } from '@/components/admin/ui';
import { LOJISTA_APP_URL } from '@/integrations/supabase/client';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';

/* ── Cartão de seção ────────────────────────────────────────
   A Home mostra as seis seções do painel (lib/secoes.ts). Cada cartão traz
   o número que mais importa naquela seção; clicar abre a tela da seção,
   com as subseções. */

/* O número que cada seção mostra na Home. */
const RESUMO_DA_SECAO: Record<ChaveDaSecao, string> = {
  comercial: 'funil',
  clientes: 'clientes',
  financeiro: 'atraso',
  suporte: 'chamados',
  operacao: 'numeros',
  gestao: 'equipe',
};

const CartaoDeSecao = ({ secao, resumo, onClick }: { secao: Secao; resumo?: Indicador; onClick: () => void }) => {
  const Icone = secao.icone;
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-start gap-4 p-5 rounded-2xl w-full text-left transition-all duration-200',
        'bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.07] dark:border-white/[0.08]',
        'hover:bg-black/[0.06] dark:hover:bg-white/[0.07] hover:border-black/[0.13] dark:hover:border-white/[0.16]',
        'hover:shadow-lg hover:shadow-black/20 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
      )}
    >
      <div className="w-full flex items-start justify-between">
        <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Icone className="h-[18px] w-[18px] stroke-[1.75]" />
        </span>
        <ChevronRight className="h-4 w-4 text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-foreground leading-tight">{secao.titulo}</p>
        <p className="text-[12px] text-foreground/45 leading-snug mt-1">{secao.descricao}</p>
      </div>
      {resumo && (
        <p className="mt-auto flex items-baseline gap-1.5 min-w-0">
          <span className={cn(
            'text-[19px] font-bold tabular-nums leading-none',
            resumo.alerta ? 'text-amber-500' : 'text-foreground',
          )}>
            {resumo.valor}
          </span>
          <span className="text-[11px] text-foreground/40 truncate">{resumo.rotulo}</span>
        </p>
      )}
    </button>
  );
};

/* ── Home ───────────────────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { member, user, signOut } = useAuth();

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

  const indicadores = useIndicadores();

  /* Só o MRR fica na abertura. O panorama da base instalada mora em
     Clientes e em Relatórios, que é onde alguém vai atrás dele — repetido
     aqui virava um quadro a mais para conferir e discordar.
     Sem o panorama, a Home também deixa de consultar o sistema dos
     clientes a cada abertura: uma leitura de dado de cliente a menos,
     registrada à toa no log da LGPD. */
  const { data: clientes = [] } = useClients();
  const { data: pagamentos = [] } = usePayments();
  const dinheiro = useMemo(() => mrrDaCarteira(clientes, pagamentos), [clientes, pagamentos]);

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
                {brl(dinheiro.mrr)}
                <span className="text-[11px] sm:text-[13px] font-normal text-foreground/40 ml-1">MRR</span>
              </p>
              {dinheiro.aguardando > 0 && (
                <p className="text-[10px] text-foreground/35 font-light">
                  +{brl(dinheiro.aguardando)} assinado, aguardando a 1ª fatura
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Seções ────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-[11px] font-semibold tracking-widest uppercase text-foreground/30">Seções</p>
            <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SECOES.map((secao) => (
              <CartaoDeSecao
                key={secao.chave}
                secao={secao}
                resumo={indicadores[RESUMO_DA_SECAO[secao.chave]]}
                onClick={() => navigate(`/secao/${secao.chave}`)}
              />
            ))}
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
