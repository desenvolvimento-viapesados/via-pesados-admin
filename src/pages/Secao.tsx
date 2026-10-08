import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ChevronRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { secaoPorChave, type Subsecao } from '@/lib/secoes';
import { useIndicadores, type Indicador } from '@/hooks/useIndicadores';
import { LOJISTA_APP_URL } from '@/integrations/supabase/client';

/* A tela de uma seção: o que ela agrupa, em cartões, cada um com o número
   que diz se precisa de alguém. A Home mostra as seções; aqui ficam as
   subseções — é o que mantém a Home curta à medida que o painel cresce. */

function CartaoDeSubsecao({ s, indicador, onAbrir }: { s: Subsecao; indicador?: Indicador; onAbrir: () => void }) {
  const Icone = s.icone;
  return (
    <button
      onClick={onAbrir}
      className={cn(
        'group w-full text-left rounded-2xl border p-5 flex items-start gap-4 transition-all duration-200',
        'bg-black/[0.03] dark:bg-white/[0.03] border-black/[0.07] dark:border-white/[0.08]',
        'hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:border-black/[0.13] dark:hover:border-white/[0.16]',
        'hover:shadow-lg hover:shadow-black/10 dark:hover:shadow-black/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
      )}
    >
      <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icone className="h-[18px] w-[18px] stroke-[1.75]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[14px] font-semibold text-foreground leading-tight">{s.titulo}</p>
          {s.externa && <ArrowUpRight className="h-3.5 w-3.5 text-foreground/30" />}
        </div>
        <p className="text-[12px] text-foreground/45 leading-snug mt-1">{s.descricao}</p>
        {indicador && (
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className={cn(
              'text-[18px] font-bold tabular-nums leading-none',
              indicador.alerta ? 'text-amber-500' : 'text-foreground',
            )}>
              {indicador.valor}
            </span>
            <span className="text-[11px] text-foreground/40">{indicador.rotulo}</span>
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 mt-1 text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}

export default function Secao() {
  const { chave } = useParams();
  const navigate = useNavigate();
  const secao = secaoPorChave(chave);
  const indicadores = useIndicadores();

  if (!secao) return <Navigate to="/" replace />;
  const Icone = secao.icone;

  const abrir = (s: Subsecao) => {
    if (s.externa) window.open(s.rota || LOJISTA_APP_URL, '_blank', 'noopener');
    else navigate(s.rota);
  };

  return (
    <div className="max-w-4xl mx-auto w-full flex flex-col gap-8 py-2 sm:py-6">
      <header className="flex items-start gap-4">
        <span className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icone className="h-6 w-6 stroke-[1.5]" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight leading-tight text-foreground">{secao.titulo}</h1>
          <p className="text-[13px] text-foreground/50 mt-1">{secao.descricao}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {secao.subsecoes.map((s) => (
          <CartaoDeSubsecao
            key={s.chave}
            s={s}
            indicador={s.indicador ? indicadores[s.indicador] : undefined}
            onAbrir={() => abrir(s)}
          />
        ))}
      </div>
    </div>
  );
}
