import { useState, useEffect, useMemo, lazy, Suspense, Fragment } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Kanban, CalendarDays, Radar, Rocket, Hourglass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useFrente } from '@/contexts/FrenteContext';
import { rotuloDaFrente } from '@/lib/frente';
import { EsteiraTab } from '@/components/crm/EsteiraTab';
import { useEsteira } from '@/hooks/useEsteira';
import { reunioesDoDia } from '@/lib/oportunidades';
import { AgendaTab } from '@/components/crm/AgendaTab';
import { WhatsAppTab } from '@/components/crm/WhatsAppTab';
import { ProspeccaoTab } from '@/components/crm/ProspeccaoTab';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
/* As telas que saíram da Home e viraram abas (dono, 09/11): carregam só quando abertas. */
const Implantacao = lazy(() => import('@/pages/Implantacao'));
const TestesGratis = lazy(() => import('@/pages/TestesGratis'));
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';
import { IconeWhatsApp } from '@/components/crm/wa/IconeWhatsApp';

type TabKey = 'whatsapp' | 'esteira' | 'reunioes' | 'prospeccao' | 'implantacao' | 'testes';

type IconeDaAba = React.ComponentType<{ className?: string }>;

/**
 * As abas do CRM (dono, 18/11/2026): WhatsApp em primeiro ("gosto dele como a primeira"), a
 * Esteira e a Agenda. É só isso que aparece na barra.
 *
 * A esteira junta o que eram Hoje, Funil e Prospecção. O envio automático, a implantação e o
 * teste grátis continuam existindo como telas (`fora: true`): abrem a partir da esteira, pela
 * etapa a que pertencem, e não têm botão na barra.
 */
const TABS: { key: TabKey; label: string; newLabel: string | null; icon: IconeDaAba; fora?: boolean }[] = [
  { key: 'whatsapp', label: 'WhatsApp', newLabel: 'Número',       icon: IconeWhatsApp },
  { key: 'esteira',  label: 'Esteira',  newLabel: 'Oportunidade', icon: Kanban },
  { key: 'reunioes', label: 'Agenda',   newLabel: 'Reunião',      icon: CalendarDays },
  { key: 'prospeccao',  label: 'Envio automático', newLabel: null, icon: Radar,     fora: true },
  { key: 'implantacao', label: 'Implantação',      newLabel: null, icon: Rocket,    fora: true },
  { key: 'testes',      label: 'Teste grátis',     newLabel: null, icon: Hourglass, fora: true },
];

const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

export default function Crm() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { frente } = useFrente();
  const [params, setParams] = useSearchParams();

  const urlTab = params.get('tab');
  const [tab, setTab] = useState<TabKey>(isTab(urlTab) ? urlTab : 'whatsapp');
  const [newOpen, setNewOpen] = useState(false);
  const [defaultProspect, setDefaultProspect] = useState<string | null>(null);

  // URL manda: permite deep link da Home e do card de prospect
  useEffect(() => {
    const t = params.get('tab');
    // A implantação saiu do CRM e virou seção própria.
    if (t === 'conexao') { navigate('/crm?tab=implantacao', { replace: true }); return; }
    if (t === 'assistente') { navigate('/crm?tab=prospeccao', { replace: true }); return; }
    /* Hoje, Funil e as ligações viraram a Esteira: os endereços antigos levam para ela. */
    if (t === 'hoje' || t === 'funil' || (t === 'prospeccao' && params.get('vista') === 'ligacoes')) { navigate('/crm?tab=esteira', { replace: true }); return; }
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

  /* Os números das abas saem da mesma conta das telas: o que a aba promete é o que ela mostra. */
  const { itens, soltas, oportunidades, reunioes } = useEsteira();
  const counts = useMemo(() => ({
    esteira: itens.filter((i) => i.suaVez).length + soltas.length,
    reunioes: reunioesDoDia(reunioes, oportunidades).filter((r) => r.quando === 'hoje').length,
  } as Record<string, number>), [itens, soltas, oportunidades, reunioes]);

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
              className="h-10 w-auto object-contain"
            />
          </div>

          <p className="ml-auto text-[11px] text-foreground/35 tracking-wide z-10">{rotuloDaFrente(frente)}</p>
        </div>

        {/* ── Abas ─────────────────────────────────────────── */}
        {/* Abas. A pílula laranja preenchida disputava atenção com o botão
            de ação, que é o único laranja sólido da tela. Aqui a aba ativa é
            marcada pelo mesmo filete de 3px que assina o resto do sistema. */}
        <div className="px-4 sm:px-6 flex items-end gap-3">
          <div className={cn('items-end gap-0.5 overflow-x-auto -mb-px', TABS.length > 1 ? 'flex' : 'hidden')} style={{ scrollbarWidth: 'none' }}>
            {TABS.filter((t) => !t.fora || t.key === tab).map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              const count = counts[key] ?? 0;
              return (
                <Fragment key={key}>
                <button
                  onClick={() => goTab(key)}
                  className={cn(
                    'group relative h-11 px-3.5 text-[12.5px] whitespace-nowrap transition-colors flex items-center gap-1.5',
                    active ? 'text-foreground font-semibold' : 'text-foreground/40 font-medium hover:text-foreground/75',
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5 transition-colors', active ? 'text-primary' : '')} />
                  {label}
                  {count > 0 && (
                    <span className={cn(
                      'text-[10px] font-semibold rounded-full px-1.5 py-px tabular-nums transition-colors',
                      active || key === 'esteira' ? 'bg-primary/15 text-primary' : 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/45',
                    )}>
                      {count}
                    </span>
                  )}
                  <span className={cn(
                    'absolute inset-x-2.5 bottom-0 h-[3px] rounded-full transition-all',
                    active ? 'bg-primary' : 'bg-transparent group-hover:bg-foreground/10',
                  )} />
                </button>
                </Fragment>
              );
            })}
          </div>

          {current.newLabel && (
            <button
              onClick={() => setNewOpen(true)}
              className="ml-auto mb-2 h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> {current.newLabel}
            </button>
          )}
        </div>
      </header>

      {/* ── Conteúdo ───────────────────────────────────────── */}
      <main className={cn('flex-1 w-full py-5',
        tab === 'whatsapp' || tab === 'reunioes' ? 'px-4 sm:px-6' : 'px-4 sm:px-6 max-w-6xl mx-auto')}>
        {tab === 'esteira'  && <EsteiraTab  newOpen={newOpen} onCloseNew={closeNew} />}
        {tab === 'whatsapp' && <WhatsAppTab newOpen={newOpen} onCloseNew={closeNew} />}
        {tab === 'reunioes' && <AgendaTab   newOpen={newOpen} onCloseNew={closeNew} defaultProspectId={defaultProspect} />}
        {tab === 'prospeccao' && <ProspeccaoTab />}
        {(tab === 'implantacao' || tab === 'testes') && (
          <Suspense fallback={<div className="flex justify-center py-16"><div className="h-6 w-6 rounded-full border border-primary/30 border-t-primary animate-spin" /></div>}>
            {tab === 'implantacao' ? <Implantacao /> : <TestesGratis />}
          </Suspense>
        )}
      </main>
    </div>
  );
}
