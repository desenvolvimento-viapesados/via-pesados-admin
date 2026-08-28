import { useState } from 'react';
import { CalendarDays, ChevronDown, X, ArrowRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';

const PERIODOS = [
  { id: 'semana',        name: 'Última Semana' },
  { id: 'mes',           name: 'Este Mês' },
  { id: 'mes_passado',   name: 'Mês Passado' },
  { id: 'trimestre',     name: 'Este Trimestre' },
  { id: 'ano',           name: 'Este Ano' },
  { id: 'todo',          name: 'Todo o Período' },
  { id: 'personalizado', name: 'Personalizado' },
];

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const CUR_YEAR = new Date().getFullYear();
const ANOS = Array.from({ length: CUR_YEAR - 2009 }, (_, i) => CUR_YEAR - i);

interface Props {
  value: string;
  onChange: (v: string) => void;
  customStart: string;
  customEnd: string;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
}

export function DateRangeSelector({ value, onChange, customStart, customEnd, onCustomStart, onCustomEnd }: Props) {
  const [open, setOpen] = useState(false);

  const label = PERIODOS.find(p => p.id === value)?.name ?? 'Período';
  const isCustom = value === 'personalizado';

  // Parse current selections
  const startYear  = customStart ? parseInt(customStart.slice(0, 4)) : CUR_YEAR;
  const startMonth = customStart ? parseInt(customStart.slice(5, 7)) - 1 : 0;
  const endYear    = customEnd   ? parseInt(customEnd.slice(0, 4))   : CUR_YEAR;
  const endMonth   = customEnd   ? parseInt(customEnd.slice(5, 7)) - 1 : 11;

  const setStart = (year: number, month: number) => {
    const d = new Date(year, month, 1);
    onCustomStart(format(startOfMonth(d), 'yyyy-MM-dd'));
  };

  const setEnd = (year: number, month: number) => {
    const d = new Date(year, month, 1);
    onCustomEnd(format(endOfMonth(d), 'yyyy-MM-dd'));
  };

  const displayRange = isCustom && customStart && customEnd
    ? `${MESES[startMonth]}/${startYear} → ${MESES[endMonth]}/${endYear}`
    : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Period dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 h-8 px-3.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.10] dark:border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14] text-[13px] text-foreground/70 hover:text-foreground transition-all duration-200"
        >
          <CalendarDays className="h-3.5 w-3.5 text-foreground/40" />
          <span>{displayRange ?? label}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-foreground/30 transition-transform duration-200', open && 'rotate-180')} />
          {displayRange && (
            <span role="button" onClick={e => { e.stopPropagation(); onCustomStart(''); onCustomEnd(''); onChange('mes'); }}
              className="ml-0.5 text-foreground/30 hover:text-foreground">
              <X className="h-3 w-3" />
            </span>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-full mt-1.5 left-0 z-50 rounded-2xl border border-white/[0.10] bg-background/98 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden min-w-[200px]">

              {/* Standard periods */}
              <div className="py-1.5">
                {PERIODOS.filter(p => p.id !== 'personalizado').map(p => (
                  <button key={p.id} onClick={() => { onChange(p.id); setOpen(false); }}
                    className={cn('w-full text-left px-4 py-2 text-[13px] transition-colors',
                      value === p.id ? 'text-primary bg-primary/10' : 'text-foreground/60 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06]')}>
                    {p.name}
                  </button>
                ))}
              </div>

              {/* Divider + custom */}
              <div className="border-t border-white/[0.06] p-3">
                <p className="text-[10px] text-foreground/30 uppercase tracking-widest mb-2.5 px-1">Personalizado</p>

                {/* Start */}
                <div className="mb-2">
                  <p className="text-[11px] text-foreground/40 px-1 mb-1">De</p>
                  <div className="flex gap-1.5">
                    <select value={startMonth}
                      onChange={e => { setStart(startYear, Number(e.target.value)); onChange('personalizado'); }}
                      className="flex-1 bg-white/[0.06] border border-white/[0.10] rounded-xl px-2 py-1.5 text-[12px] text-foreground outline-none cursor-pointer">
                      {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select value={startYear}
                      onChange={e => { setStart(Number(e.target.value), startMonth); onChange('personalizado'); }}
                      className="w-20 bg-white/[0.06] border border-white/[0.10] rounded-xl px-2 py-1.5 text-[12px] text-foreground outline-none cursor-pointer">
                      {ANOS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                {/* End */}
                <div className="mb-3">
                  <p className="text-[11px] text-foreground/40 px-1 mb-1">Até</p>
                  <div className="flex gap-1.5">
                    <select value={endMonth}
                      onChange={e => { setEnd(endYear, Number(e.target.value)); onChange('personalizado'); }}
                      className="flex-1 bg-white/[0.06] border border-white/[0.10] rounded-xl px-2 py-1.5 text-[12px] text-foreground outline-none cursor-pointer">
                      {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select value={endYear}
                      onChange={e => { setEnd(Number(e.target.value), endMonth); onChange('personalizado'); }}
                      className="w-20 bg-white/[0.06] border border-white/[0.10] rounded-xl px-2 py-1.5 text-[12px] text-foreground outline-none cursor-pointer">
                      {ANOS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                <button onClick={() => setOpen(false)}
                  className="w-full h-8 rounded-xl bg-primary/90 hover:bg-primary text-primary-foreground text-[13px] font-medium transition-colors">
                  Aplicar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
