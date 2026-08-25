import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Kanban, CalendarDays, MonitorPlay, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useCrmCounts, brl } from '@/hooks/useAdmin';
import { FunilTab } from '@/components/crm/FunilTab';
import { ReunioesTab } from '@/components/crm/ReunioesTab';
import { AmostrasTab } from '@/components/crm/AmostrasTab';
import { ConexaoTab } from '@/components/crm/ConexaoTab';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';

type TabKey = 'funil' | 'reunioes' | 'amostras' | 'conexao';

const TABS: { key: TabKey; label: string; newLabel: string; icon: typeof Kanban }[] = [
  { key: 'funil',    label: 'Funil',    newLabel: 'Prospect', icon: Kanban },
  { key: 'reunioes', label: 'Reuniões', newLabel: 'Reunião',  icon: CalendarDays },
  { key: 'amostras', label: 'Amostras', newLabel: 'Amostra',  icon: MonitorPlay },
  { key: 'conexao',  label: 'Conexão',  newLabel: 'Venda',    icon: Rocket },
];

const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

export default function Crm() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [params, setParams] = useSearchParams();

  const urlTab = params.get('tab');
  const [tab, setTab] = useState<TabKey>(isTab(urlTab) ? urlTab : 'funil');
  const [newOpen, setNewOpen] = useState(false);
  const [defaultProspect, setDefaultProspect] = useState<string | null>(null);

  // URL manda: permite deep link da Home e do card de prospect
  useEffect(() => {
    const t = params.get('tab');
    if (isTab(t)) setTab(t);
    if (params.get('new') === '1') {
      setNewOpen(true);
      setDefaultProspect(params.get('prospect'));
      const next = new URLSearchParams(params);
      next.delete('new');
      next.delete('prospect');
      setParams(next, { replace: true });
    }
  }, [params]);

  const goTab = (key: TabKey) => {
    setTab(key);
    setParams({ tab: key }, { replace: true });
  };

  const closeNew = () => { setNewOpen(false); setDefaultProspect(null); };

  const counts = useCrmCounts();

  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Barra superior ─────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <div className="relative w-full flex h-20 items-center px-4 sm:px-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-[13px] text-foreground/40 hover:text-foreground transition-colors group z-10"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Início</span>
          </button>

          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none">
            <img
              src={theme === 'dark' ? viaPesadosLogoDark : viaPesadosLogoLight}
              alt="Via Pesados"
              className="h-20 w-auto object-contain"
            />
          </div>

          <div className="ml-auto text-right z-10 hidden sm:block">
            <p className="text-[10px] text-foreground/35 tracking-wide">Pipeline ativo</p>
            <p className="text-[15px] font-bold text-foreground tabular-nums leading-tight">
              {brl(counts.pipeline)}<span className="text-[10px] font-normal text-foreground/35 ml-0.5">/mês</span>
            </p>
          </div>
        </div>

        {/* ── Abas ─────────────────────────────────────────── */}
        <div className="px-4 sm:px-6 pb-2.5 flex items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              const count = counts[key];
              return (
                <button
                  key={key}
                  onClick={() => goTab(key)}
                  className={cn(
                    'h-9 px-3 rounded-xl text-[12.5px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5',
                    active
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'border border-transparent text-foreground/45 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {count > 0 && (
                    <span className={cn(
                      'text-[10px] font-bold rounded-full px-1.5 py-px tabular-nums',
                      active ? 'bg-primary/20' : 'bg-black/[0.06] dark:bg-white/[0.08]',
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setNewOpen(true)}
            className="ml-auto h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" /> {current.newLabel}
          </button>
        </div>
      </header>

      {/* ── Conteúdo ───────────────────────────────────────── */}
      <main className={cn('flex-1 w-full py-5', tab === 'funil' ? 'px-4 sm:px-6' : 'px-4 sm:px-6 max-w-6xl mx-auto')}>
        {tab === 'funil'    && <FunilTab    newOpen={newOpen} onCloseNew={closeNew} />}
        {tab === 'reunioes' && <ReunioesTab newOpen={newOpen} onCloseNew={closeNew} defaultProspectId={defaultProspect} />}
        {tab === 'amostras' && <AmostrasTab newOpen={newOpen} onCloseNew={closeNew} defaultProspectId={defaultProspect} />}
        {tab === 'conexao'  && <ConexaoTab  newOpen={newOpen} onCloseNew={closeNew} />}
      </main>
    </div>
  );
}
