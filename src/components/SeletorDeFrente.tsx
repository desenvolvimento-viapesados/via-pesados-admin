import { Building2, Store, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FRENTES, type Frente } from '@/lib/frente';

const ICONE: Record<Frente, typeof Store> = { lojista: Store, transportadora: Truck, empresa: Building2 };

/**
 * Lojistas · Transportadoras · Empresa — o mesmo controle das abas dos
 * Relatórios. No celular os ícones saem para os três nomes caberem.
 */
export function SeletorDeFrente({ frente, onTrocar }: { frente: Frente; onTrocar: (f: Frente) => void }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
      <div className="flex items-center gap-1.5 p-1 bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl w-max">
        {FRENTES.map(({ id, rotulo }) => {
          const Icone = ICONE[id];
          return (
            <button
              key={id}
              onClick={() => onTrocar(id)}
              aria-pressed={frente === id}
              className={cn(
                'flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-xl text-[13px] font-medium whitespace-nowrap transition-all',
                frente === id
                  ? 'bg-black/[0.06] dark:bg-white/[0.10] text-foreground shadow-sm'
                  : 'text-foreground/40 hover:text-foreground/70',
              )}
            >
              <Icone className="h-4 w-4 hidden sm:block" />
              {rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
