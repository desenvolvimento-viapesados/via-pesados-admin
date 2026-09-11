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
import { WhatsAppTab } from '@/components/crm/WhatsAppTab';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';

type TabKey = 'whatsapp' | 'funil' | 'reunioes' | 'amostras' | 'conexao';

/**
 * Por enquanto só o Funil. Reunião, Amostra e Conexão deixaram de ser etapas
 * separadas: reunião virou coluna, e a conexão acontece quando o prospect vai
 * para Vendido. As telas continuam no código — para devolver qualquer uma,
 * basta reinserir a linha aqui; a barra de abas volta a aparecer sozinha.
 */
/* A marca do WhatsApp em traço único, com fill currentColor: assim ela
   acende em laranja com a aba ativa e apaga com as outras, como todo ícone
   da barra. O PNG colorido brigava com o estado — ficava aceso mesmo na aba
   inativa. Mesmo desenho usado no sistema-lojista. */
const IconeWhatsApp = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232" />
  </svg>
);

type IconeDaAba = React.ComponentType<{ className?: string }>;

const TABS: { key: TabKey; label: string; newLabel: string; icon: IconeDaAba }[] = [
  // WhatsApp vem primeiro: é onde o dia começa. Quem abre o CRM de manhã
  // quer ver quem escreveu, não o funil.
  { key: 'whatsapp', label: 'WhatsApp', newLabel: 'Número',   icon: IconeWhatsApp },
  { key: 'funil',    label: 'Funil',    newLabel: 'Prospect', icon: Kanban },
];

const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

export default function Crm() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [params, setParams] = useSearchParams();

  const urlTab = params.get('tab');
  const [tab, setTab] = useState<TabKey>(isTab(urlTab) ? urlTab : 'whatsapp');
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
              className="h-10 w-auto object-contain"
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
        {/* Abas. A pílula laranja preenchida disputava atenção com o botão
            de ação, que é o único laranja sólido da tela. Aqui a aba ativa é
            marcada pelo mesmo filete de 3px que assina o resto do sistema. */}
        <div className="px-4 sm:px-6 flex items-end gap-3">
          <div className={cn('items-end gap-0.5 overflow-x-auto -mb-px', TABS.length > 1 ? 'flex' : 'hidden')} style={{ scrollbarWidth: 'none' }}>
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              // WhatsApp não tem contagem no `counts` — o número de não
              // lidas já aparece dentro da própria aba, por conversa.
              const count = (counts as Record<string, number>)[key];
              return (
                <button
                  key={key}
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
                      active ? 'bg-primary/15 text-primary' : 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/45',
                    )}>
                      {count}
                    </span>
                  )}
                  <span className={cn(
                    'absolute inset-x-2.5 bottom-0 h-[3px] rounded-full transition-all',
                    active ? 'bg-primary' : 'bg-transparent group-hover:bg-foreground/10',
                  )} />
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setNewOpen(true)}
            className="ml-auto mb-2 h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" /> {current.newLabel}
          </button>
        </div>
      </header>

      {/* ── Conteúdo ───────────────────────────────────────── */}
      <main className={cn('flex-1 w-full py-5',
        tab === 'funil' || tab === 'whatsapp' ? 'px-4 sm:px-6' : 'px-4 sm:px-6 max-w-6xl mx-auto')}>
        {tab === 'whatsapp' && <WhatsAppTab newOpen={newOpen} onCloseNew={closeNew} />}
        {tab === 'funil'    && <FunilTab    newOpen={newOpen} onCloseNew={closeNew} />}
        {tab === 'reunioes' && <ReunioesTab newOpen={newOpen} onCloseNew={closeNew} defaultProspectId={defaultProspect} />}
        {tab === 'amostras' && <AmostrasTab newOpen={newOpen} onCloseNew={closeNew} defaultProspectId={defaultProspect} />}
        {tab === 'conexao'  && <ConexaoTab  newOpen={newOpen} onCloseNew={closeNew} />}
      </main>
    </div>
  );
}
