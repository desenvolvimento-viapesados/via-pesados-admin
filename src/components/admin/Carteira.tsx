import { ChevronRight, AlertTriangle, Truck, Radio, Users, TrendingUp, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brl } from '@/hooks/useAdmin';
import { Panel, InitialAvatar } from '@/components/admin/ui';
import { ROTULO_SITUACAO } from '@/lib/estadoDoCliente';
import type { LinhaDaCarteira, totaisDaCarteira } from '@/lib/carteira';

/**
 * Os pedaços visuais da carteira.
 *
 * Moram fora da página por um motivo só: a página lê o banco atrás do
 * login do painel, e eu não entro na conta de quem me pede o trabalho.
 * `/dev/ficha` renderiza estes mesmos componentes com dados inventados —
 * no sistema do lojista, entregar tela sem ver já custou duas correções
 * que o usuário achou antes de mim.
 */

const Total = ({ icone, label, valor, sub, tom }: {
  icone: React.ReactNode; label: string; valor: string | number; sub?: string;
  tom?: 'bom' | 'alerta';
}) => (
  <Panel className="p-3.5">
    <div className="flex items-center gap-1.5 text-foreground/35">
      {icone}
      <p className="text-[10px] font-semibold tracking-widest uppercase">{label}</p>
    </div>
    <p className={cn('text-[19px] font-bold tabular-nums mt-1.5',
      tom === 'bom' && 'text-emerald-500', tom === 'alerta' && 'text-amber-500')}>
      {valor}
    </p>
    {sub && <p className="text-[10.5px] text-foreground/35 mt-0.5">{sub}</p>}
  </Panel>
);


export function TotaisDaCarteira({ totais }: { totais: ReturnType<typeof totaisDaCarteira> }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5">
      {/* O subtítulo diz de quantas contas o dinheiro vem, e quanto ainda
          não virou receita — "5 clientes na carteira" ao lado de um MRR
          que conta 2 deles é a leitura errada esperando para acontecer. */}
      <Total icone={<Wallet className="h-3 w-3" />} label="MRR" valor={brl(totais.mrr)}
        sub={totais.mrrAguardando > 0
          ? `${totais.contasPagantes} de ${totais.clientes} pagando · ${brl(totais.mrrAguardando)} a ativar`
          : `${totais.contasPagantes} ${totais.contasPagantes === 1 ? 'conta pagando' : 'contas pagando'}`} />
      <Total icone={<Truck className="h-3 w-3" />} label="Veículos" valor={totais.veiculos}
        sub={`${brl(totais.valorEstoque)} em pátio`} />
      <Total icone={<Radio className="h-3 w-3" />} label="Veículos anunciados" valor={totais.veiculosAnunciados} />
      <Total icone={<TrendingUp className="h-3 w-3" />} label="Vendas 30d" valor={totais.vendas30d}
        sub={brl(totais.faturamento30d)} tom="bom" />
      <Total icone={<Users className="h-3 w-3" />} label="Usuários" valor={totais.usuarios}
        sub={`em ${totais.usando} ${totais.usando === 1 ? 'conta ativa' : 'contas ativas'}`} />
      <Total icone={<AlertTriangle className="h-3 w-3" />} label="Precisam de você"
        valor={totais.comAlarmeGrave}
        sub={totais.sumidos
          ? `${totais.sumidos} ${totais.sumidos === 1 ? 'conta sumiu' : 'contas sumiram'}`
          : 'nenhuma urgência'}
        tom={totais.comAlarmeGrave ? 'alerta' : undefined} />
    </div>
  );
}

export function ListaDaCarteira({
  linhas, onAbrir,
}: {
  linhas: LinhaDaCarteira[];
  onAbrir: (clienteId: string) => void;
}) {
  return (
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {linhas.map((l) => {
            const s = l.saude;
            const r = ROTULO_SITUACAO[l.situacao];
            const grave = l.alarmes.some((a) => a.peso === 'grave');
            return (
              <button
                key={l.cliente.id}
                onClick={() => onAbrir(l.cliente.id)}
                className="w-full flex items-start gap-3.5 px-4 py-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors text-left group"
              >
                <InitialAvatar name={l.cliente.company_name} src={l.cliente.logo_url} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13.5px] font-semibold text-foreground truncate">{l.cliente.company_name}</p>
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
                      r.tom === 'bom' && 'bg-emerald-500/12 text-emerald-500',
                      r.tom === 'atencao' && 'bg-amber-500/12 text-amber-500',
                      r.tom === 'ruim' && 'bg-red-500/12 text-red-400',
                      r.tom === 'neutro' && 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/45',
                    )}>{r.texto}</span>
                  </div>
                  <p className="text-[11px] text-foreground/40 mt-0.5 truncate">
                    {[l.cliente.contact_name, [l.cliente.city, l.cliente.state].filter(Boolean).join('/')]
                      .filter(Boolean).join(' · ') || '—'}
                  </p>

                  {/* O que precisa de alguém, dito na linha do cliente */}
                  {l.alarmes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {l.alarmes.map((a) => (
                        <span key={a.chave} className={cn(
                          'text-[10.5px] px-1.5 py-0.5 rounded-md',
                          a.peso === 'grave' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-500',
                        )}>{a.texto}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Os números do cliente, do sistema dele */}
                <div className="hidden md:grid grid-cols-3 gap-4 shrink-0 text-right">
                  <div>
                    <p className="text-[13px] font-semibold tabular-nums text-foreground">{s ? s.veiculos : '—'}</p>
                    <p className="text-[9.5px] uppercase tracking-wide text-foreground/30">veículos</p>
                  </div>
                  <div>
                    <p className={cn('text-[13px] font-semibold tabular-nums',
                      s && s.veiculos > 0 && s.veiculos_anunciados === 0 ? 'text-red-400' : 'text-foreground')}>
                      {s ? s.veiculos_anunciados : '—'}
                    </p>
                    <p className="text-[9.5px] uppercase tracking-wide text-foreground/30">no ar</p>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold tabular-nums text-emerald-500">{s ? s.vendas_30d : '—'}</p>
                    <p className="text-[9.5px] uppercase tracking-wide text-foreground/30">vendas 30d</p>
                  </div>
                </div>

                <div className="shrink-0 w-24 text-right">
                  <p className="text-[13px] font-bold text-foreground tabular-nums">
                    {brl(l.cliente.mrr)}<span className="text-[10px] font-normal text-foreground/35">/mês</span>
                  </p>
                  <p className="text-[10px] text-foreground/30 tabular-nums">
                    {l.diasSemEntrar === null ? 'nunca entrou'
                      : l.diasSemEntrar === 0 ? 'entrou hoje'
                      : `há ${l.diasSemEntrar} d`}
                  </p>
                </div>

                <ChevronRight className={cn('h-4 w-4 mt-1 shrink-0 transition-all',
                  grave ? 'text-red-400/60' : 'text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5')} />
              </button>
            );
          })}
        </Panel>
  );
}
