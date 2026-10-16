import { useNavigate } from 'react-router-dom';
import { Hourglass, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel, SectionHeader } from '@/components/admin/ui';
import type { TesteGratis } from '@/hooks/useTesteGratis';
import { situacaoDoTeste, dataCurta, type Tom } from '@/lib/testeGratis';
import { diaDoCorte } from '../../../supabase/functions/_shared/teste';

export const COR_DO_TOM: Record<Tom, { texto: string; barra: string; fundo: string }> = {
  neutro:  { texto: 'text-foreground/70', barra: 'bg-primary', fundo: 'bg-primary/10' },
  bom:     { texto: 'text-emerald-600 dark:text-emerald-400', barra: 'bg-emerald-500', fundo: 'bg-emerald-500/10' },
  atencao: { texto: 'text-amber-600 dark:text-amber-400', barra: 'bg-amber-500', fundo: 'bg-amber-500/10' },
  alerta:  { texto: 'text-red-500', barra: 'bg-red-500', fundo: 'bg-red-500/10' },
  apagado: { texto: 'text-foreground/40', barra: 'bg-foreground/20', fundo: 'bg-foreground/5' },
};

/** O teste grátis na ficha do cliente — onde está e para onde ir. */
export function TesteDoCliente({ teste }: { teste: TesteGratis }) {
  const navigate = useNavigate();
  const s = situacaoDoTeste(teste);
  const cor = COR_DO_TOM[s.tom];
  return (
    <div>
      <SectionHeader title="Teste grátis" />
      <Panel className="p-4">
        <button onClick={() => navigate('/testes')} className="w-full text-left flex items-start gap-3 group">
          <Hourglass className={cn('h-4 w-4 mt-0.5 shrink-0', cor.texto)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', cor.fundo, cor.texto)}>{s.rotulo}</span>
              <span className="text-[12.5px] text-foreground/70 truncate">{s.linha}</span>
            </div>
            <div className="mt-2.5 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
              <div className={cn('h-full rounded-full', cor.barra)} style={{ width: `${Math.round(s.progresso * 100)}%` }} />
            </div>
            {teste.fim && teste.status !== 'convertido' && (
              <p className="text-[11.5px] text-foreground/45 mt-2">
                Assinando, a primeira mensalidade vence em {dataCurta(diaDoCorte(teste.fim))} — o mês do teste não é cobrado.
              </p>
            )}
            {teste.motivo && <p className="text-[11.5px] text-foreground/55 mt-1.5">Motivo: {teste.motivo}</p>}
          </div>
          <ChevronRight className="h-4 w-4 text-foreground/30 group-hover:text-foreground/60 shrink-0 mt-0.5" />
        </button>
      </Panel>
    </div>
  );
}
