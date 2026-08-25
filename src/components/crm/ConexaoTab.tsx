import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ChevronRight, CheckCircle2, Globe, FileText } from 'lucide-react';
import { useClients, useOnboardingProgress, useProspects, brl, type Prospect } from '@/hooks/useAdmin';
import { SectionHeader, StatusBadge, EmptyState, Panel, InitialAvatar } from '@/components/admin/ui';
import { RegistrarVendaDialog } from './RegistrarVendaDialog';

/**
 * Conexão — o fim da esteira: fecha a venda, emite o contrato
 * e acompanha o sistema do cliente até entrar no ar.
 */
export function ConexaoTab({ newOpen, onCloseNew }: { newOpen: boolean; onCloseNew: () => void }) {
  const navigate = useNavigate();
  const { data: clients = [], isLoading } = useClients();
  const { data: prospects = [] } = useProspects();
  const { data: progress = {} } = useOnboardingProgress();
  const [saleFor, setSaleFor] = useState<Prospect | null>(null);

  /** Chegaram na etapa Fechamento e ainda não viraram cliente. */
  const closing = useMemo(() => {
    const converted = new Set(clients.map((c) => c.prospect_id).filter(Boolean) as string[]);
    return prospects.filter((p) => p.stage === 'fechamento' && !converted.has(p.id));
  }, [prospects, clients]);

  const connecting = clients.filter((c) => c.status === 'onboarding');
  const recentlyLive = clients
    .filter((c) => c.status === 'ativo' && c.activated_at)
    .sort((a, b) => (b.activated_at ?? '').localeCompare(a.activated_at ?? ''))
    .slice(0, 5);

  const closeDialog = () => { setSaleFor(null); onCloseNew(); };
  const nothing = closing.length === 0 && connecting.length === 0 && recentlyLive.length === 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Fila: prontos para fechar */}
      {closing.length > 0 && (
        <div>
          <SectionHeader title={`Prontos para fechar · ${closing.length}`} />
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden border-emerald-400/25">
            {closing.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="h-8 w-8 rounded-full bg-emerald-500/15 text-emerald-500 text-[12px] font-bold flex items-center justify-center shrink-0">
                  {p.company_name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate">{p.company_name}</p>
                  <p className="text-[11px] text-foreground/40 truncate">
                    {p.proposal_value ? `${brl(p.proposal_value)}/mês · ` : ''}em negociação final
                  </p>
                </div>
                <button
                  onClick={() => setSaleFor(p)}
                  className="h-8 px-3 rounded-lg bg-emerald-500/15 text-emerald-500 text-[11.5px] font-semibold hover:bg-emerald-500/25 transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" /> Registrar venda
                </button>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {nothing ? (
        <EmptyState
          icon={<Rocket />}
          title="Nenhuma venda em conexão"
          sub="Mova um prospect para Fechamento no funil — ele aparece aqui para registrar"
        />
      ) : (
        <>
          {connecting.length > 0 && (
            <div>
              <SectionHeader title={`Configurando o sistema · ${connecting.length}`} />
              <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
                {connecting.map((c) => {
                  const prog = progress[c.id];
                  const pct = prog ? Math.round((prog.done / prog.total) * 100) : 0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/clientes/${c.id}`)}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors text-left group"
                    >
                      <InitialAvatar name={c.company_name} src={c.logo_url} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-foreground truncate">{c.company_name}</p>
                        <p className="text-[11px] text-foreground/40 mt-0.5 truncate">
                          {c.domain
                            ? <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{c.domain}</span>
                            : c.lojista_company_id ? 'Sistema criado · domínio pendente' : 'Aguardando criação do sistema'}
                        </p>
                      </div>

                      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 w-28">
                        <p className="text-[10px] text-foreground/40 tabular-nums">
                          {prog ? `${prog.done}/${prog.total} etapas` : '—'}
                        </p>
                        <div className="h-1.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      <p className="text-[13px] font-bold text-foreground tabular-nums shrink-0 w-20 text-right">
                        {brl(c.mrr)}<span className="text-[10px] font-normal text-foreground/35">/mês</span>
                      </p>
                      <ChevronRight className="h-4 w-4 text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  );
                })}
              </Panel>
            </div>
          )}

          {recentlyLive.length > 0 && (
            <div>
              <SectionHeader title="No ar recentemente" />
              <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
                {recentlyLive.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground truncate">{c.company_name}</p>
                      <p className="text-[10.5px] text-foreground/35">
                        No ar desde {new Date(c.activated_at!).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </button>
                ))}
              </Panel>
            </div>
          )}
        </>
      )}

      <RegistrarVendaDialog open={newOpen || !!saleFor} prospect={saleFor} onClose={closeDialog} />
    </div>
  );
}
