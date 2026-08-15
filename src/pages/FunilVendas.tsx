import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import {
  ArrowLeft, Sun, Moon, Search, ChevronDown, Plus,
  MapPin, Phone, CalendarDays, Settings2, Users,
  ClipboardList, Banknote, UserCheck, Sparkles, Kanban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';
import viaCrmLogoLight from '@/assets/via-crm-logo-light.png';
import viaCrmLogoDark from '@/assets/via-crm-logo-dark.png';

/* ── Tipos ─────────────────────────────────────────────────────── */
type Etapa =
  | 'interessado'
  | 'quente'
  | 'finalizando'
  | 'ficha_financiamento'
  | 'fechado'
  | 'perdidos';

interface Lead {
  id: string;
  nome: string;
  telefone: string;
  cidade: string;
  uf: string;
  etapa: Etapa;
  dataInicio: string;
  dataFim: string;
  temAgenda: boolean;
}

/* ── Dados mock ─────────────────────────────────────────────────── */
const LEADS_INIT: Lead[] = [
  { id: 'l1', nome: 'iTruck Caminhões',    telefone: '5527995212030', cidade: 'Governador Valadares', uf: 'MG', etapa: 'quente',              dataInicio: '23/07/2026', dataFim: '14/08/2026', temAgenda: true  },
  { id: 'l2', nome: 'Trans Minas',         telefone: '5534988765432', cidade: 'Uberaba',              uf: 'MG', etapa: 'interessado',         dataInicio: '01/08/2026', dataFim: '15/08/2026', temAgenda: false },
  { id: 'l3', nome: 'Pesados Nordeste',    telefone: '5585991234567', cidade: 'Fortaleza',            uf: 'CE', etapa: 'interessado',         dataInicio: '05/08/2026', dataFim: '20/08/2026', temAgenda: false },
  { id: 'l4', nome: 'Truck Centro',        telefone: '5561988771234', cidade: 'Brasília',             uf: 'DF', etapa: 'finalizando',         dataInicio: '10/07/2026', dataFim: '10/08/2026', temAgenda: true  },
  { id: 'l5', nome: 'Corretor Santos',     telefone: '5513992345678', cidade: 'Santos',              uf: 'SP', etapa: 'ficha_financiamento', dataInicio: '20/07/2026', dataFim: '05/08/2026', temAgenda: false },
  { id: 'l6', nome: 'Frotão RS',           telefone: '5554995432100', cidade: 'Caxias do Sul',       uf: 'RS', etapa: 'fechado',             dataInicio: '15/06/2026', dataFim: '30/07/2026', temAgenda: false },
  { id: 'l7', nome: 'Trans Amazônia',      telefone: '5592998765432', cidade: 'Manaus',              uf: 'AM', etapa: 'perdidos',            dataInicio: '01/07/2026', dataFim: '14/08/2026', temAgenda: false },
];

/* ── Colunas do Kanban ──────────────────────────────────────────── */
const ETAPAS: { id: Etapa; label: string; dot: string }[] = [
  { id: 'interessado',         label: 'Interessado',            dot: 'bg-cyan-500'     },
  { id: 'quente',              label: 'Quente',                 dot: 'bg-orange-500'   },
  { id: 'finalizando',         label: 'Finalizando negócio',    dot: 'bg-yellow-500'   },
  { id: 'ficha_financiamento', label: 'Ficha de financiamento', dot: 'bg-purple-500'   },
  { id: 'fechado',             label: 'Fechado',                dot: 'bg-emerald-500'  },
  { id: 'perdidos',            label: 'Perdidos',               dot: 'bg-red-500'      },
];

/* ── WhatsApp SVG ───────────────────────────────────────────────── */
const WAIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-emerald-400 shrink-0" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/* ── Card ───────────────────────────────────────────────────────── */
function LeadCard({ lead }: { lead: Lead }) {
  const initials = lead.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-card hover:border-black/[0.14] dark:hover:border-white/[0.14] hover:shadow-lg hover:shadow-black/10 transition-all duration-150 cursor-pointer overflow-hidden">
      <div className="p-3.5 flex flex-col gap-2.5">
        {/* Avatar + name */}
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-foreground/[0.08] border border-foreground/[0.1] flex items-center justify-center text-[11px] font-bold text-foreground/60 shrink-0">
            {initials}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground leading-tight truncate">{lead.nome}</p>
            <WAIcon />
          </div>
        </div>

        {/* Phone */}
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-foreground/30 shrink-0" />
          <p className="text-[11px] text-foreground/50">{lead.telefone}</p>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-foreground/30 shrink-0" />
          <p className="text-[11px] text-foreground/50">{lead.cidade} — {lead.uf}</p>
        </div>

        {/* Agenda badge */}
        {lead.temAgenda && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              <CalendarDays className="h-2.5 w-2.5" />
              + Agenda
            </span>
          </div>
        )}

        {/* Date range */}
        <p className="text-[10px] text-foreground/30">{lead.dataInicio} — {lead.dataFim}</p>
      </div>
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────── */
const WAMonoIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232" />
  </svg>
);

const TABS = [
  { id: 'whatsapp',   icon: <WAMonoIcon />,                              label: 'WhatsApp'            },
  { id: 'funil',      icon: <Kanban className="h-3.5 w-3.5" />,         label: 'Funil'               },
  { id: 'pedidos',    icon: <ClipboardList className="h-3.5 w-3.5" />,  label: 'Pedidos'             },
  { id: 'agenda',     icon: <CalendarDays className="h-3.5 w-3.5" />,   label: 'Agenda'              },
  { id: 'financiamento', icon: <Banknote className="h-3.5 w-3.5" />,    label: 'Financiamento'       },
  { id: 'possiveis',  icon: <UserCheck className="h-3.5 w-3.5" />,      label: 'Possíveis negociações' },
  { id: 'recorrencia',icon: <Sparkles className="h-3.5 w-3.5" />,       label: 'Recorrência'         },
  { id: 'contatos',   icon: <Users className="h-3.5 w-3.5" />,          label: 'Base de contatos'    },
];

/* ── Main ───────────────────────────────────────────────────────── */
export default function FunilVendas() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('funil');
  const [leads, setLeads] = useState<Lead[]>(LEADS_INIT);
  const [search, setSearch] = useState('');

  const queenLeads = leads.filter(l => l.etapa === 'quente');
  const totalLeads = leads.length;

  const filtered = search
    ? leads.filter(l => l.nome.toLowerCase().includes(search.toLowerCase()) || l.cidade.toLowerCase().includes(search.toLowerCase()))
    : leads;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="shrink-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/50">

        {/* Top bar */}
        <div className="relative flex items-center px-4 h-20">

          {/* Logo VP — centro absoluto */}
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none">
            <img
              src={theme === 'dark' ? viaPesadosLogoDark : viaPesadosLogoLight}
              alt="Via Pesados"
              className="h-20 w-auto object-contain"
            />
          </div>

          {/* Esquerda: voltar + CRM logo */}
          <div className="flex items-center gap-3 z-10">
            <button
              onClick={() => navigate('/')}
              className="h-9 w-9 flex items-center justify-center rounded-xl text-foreground/40 hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <img
              src={theme === 'dark' ? viaCrmLogoDark : viaCrmLogoLight}
              alt="Via CRM"
              className="h-7 w-auto select-none"
            />
            <div className="hidden sm:flex flex-col leading-none border-l border-border/50 pl-3">
              <p className="text-[13px] font-bold text-foreground">VIA CRM</p>
              <p className="text-[11px] text-muted-foreground">Negociações e relacionamento</p>
            </div>
          </div>

          {/* Direita: tema */}
          <button
            onClick={toggleTheme}
            className="ml-auto z-10 h-9 w-9 flex items-center justify-center rounded-xl text-foreground/40 hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {/* Tab bar */}
        <div className="px-4 overflow-x-auto scrollbar-none">
          <div className="flex gap-0 -mb-px">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-3 text-[12px] font-semibold whitespace-nowrap border-b-2 transition-all duration-150',
                  activeTab === t.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/60',
                )}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Conteúdo ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {activeTab === 'funil' && (
          <>
            {/* Resultados Possíveis banner */}
            {queenLeads.length > 0 && (
              <div className="shrink-0 mx-4 mt-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.05] overflow-hidden">
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
                  <span className="text-[11px] font-semibold text-foreground/50 tracking-wide">Resultados Possíveis</span>
                  <span className="flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400 inline-block" />
                    Quente {queenLeads.length}
                  </span>
                  <div className="ml-auto flex items-center gap-2 text-[11px] text-foreground/40">
                    <span>R$ 0</span>
                    <span className="text-foreground/20">·</span>
                    <span>{queenLeads.length} negociações</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </div>
                </button>
              </div>
            )}

            {/* Filtros */}
            <div className="shrink-0 px-4 py-3 flex items-center gap-2">
              <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 transition-colors shrink-0">
                <Plus className="h-3.5 w-3.5" /> Lead
              </button>
              <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 text-[12px] text-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors shrink-0">
                <Settings2 className="h-3.5 w-3.5" /> Personalizar funil
              </button>
              <button className="hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 text-[12px] text-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors shrink-0">
                Todos atendentes <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <div className="flex-1 relative min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/30 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar cliente, veículo, proprietário..."
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-border/60 bg-transparent text-[12px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
            </div>

            {/* Kanban */}
            <div className="flex-1 overflow-x-auto px-4 pb-4">
              <div className="flex gap-3 h-full min-w-[960px]">
                {ETAPAS.map(etapa => {
                  const etapaLeads = filtered.filter(l => l.etapa === etapa.id);
                  return (
                    <div key={etapa.id} className="flex-1 min-w-[200px] flex flex-col gap-2">
                      {/* Column header */}
                      <div className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full shrink-0', etapa.dot)} />
                          <p className="text-[12px] font-semibold text-foreground leading-tight">{etapa.label}</p>
                        </div>
                        <span className="text-[11px] font-bold bg-foreground/[0.06] px-1.5 py-0.5 rounded-full text-foreground/50">
                          {etapaLeads.length}
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="flex flex-col gap-2 overflow-y-auto flex-1">
                        {etapaLeads.map(lead => (
                          <LeadCard key={lead.id} lead={lead} />
                        ))}
                        {etapaLeads.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-10 gap-2">
                            <div className="h-10 w-10 rounded-full bg-foreground/[0.04] border border-foreground/[0.06] flex items-center justify-center">
                              <Users className="h-4 w-4 text-foreground/20" />
                            </div>
                            <p className="text-[11px] text-foreground/25">Nenhum contato</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab !== 'funil' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-foreground/[0.04] border border-foreground/[0.07] flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-foreground/25" />
              </div>
              <p className="text-[13px] text-foreground/30 font-medium">Em desenvolvimento</p>
              <p className="text-[11px] text-foreground/20">Esta seção estará disponível em breve</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
