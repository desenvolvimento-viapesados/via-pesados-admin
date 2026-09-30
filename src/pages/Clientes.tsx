import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Building2, Search, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClients, useCompaniesHealth, usePayments, brl, type Client } from '@/hooks/useAdmin';
import { EmptyState } from '@/components/admin/ui';
import { TotaisDaCarteira, ListaDaCarteira } from '@/components/admin/Carteira';
import { montarCarteira, totaisDaCarteira, ordemDeAtencao } from '@/lib/carteira';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

/**
 * A carteira: todos os clientes numa tela, com o que precisa de atenção
 * em cima.
 *
 * A lista antiga trazia nome, cidade e MRR — responde "quantos clientes
 * eu tenho" e para por aí. Não dizia quem está no ar, quem sumiu, onde o
 * estoque está parado, qual conta ninguém abre há um mês. Com dez
 * clientes se sabe de cabeça; com mil, uma lista de nomes é um índice
 * telefônico caro.
 *
 * Agora cada linha carrega a saúde real, lida do sistema de cada cliente,
 * e a ordem padrão é por quem precisa de alguém hoje.
 */
export default function Clientes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: clients = [], isLoading } = useClients();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'atencao' | 'todos' | Client['status']>(
    params.get('f') === 'atencao' ? 'atencao' : 'todos',
  );

  const companyIds = useMemo(
    () => clients.map((c) => c.lojista_company_id).filter(Boolean) as string[],
    [clients],
  );
  const saudeQuery = useCompaniesHealth(companyIds);

  useEffect(() => {
    if (params.get('new') === '1') {
      navigate('/crm/venda');
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, []);

  const carteira = useMemo(
    () => montarCarteira(clients, saudeQuery.data ?? []),
    [clients, saudeQuery.data],
  );
  const { data: pagamentos = [] } = usePayments();
  const totais = useMemo(() => totaisDaCarteira(carteira, pagamentos), [carteira, pagamentos]);

  const filtradas = useMemo(() => {
    let list = [...carteira];
    if (filter === 'atencao') list = list.filter((l) => l.alarmes.length > 0);
    else if (filter !== 'todos') list = list.filter((l) => l.cliente.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((l) =>
        l.cliente.company_name.toLowerCase().includes(q) ||
        (l.cliente.contact_name ?? '').toLowerCase().includes(q) ||
        (l.cliente.city ?? '').toLowerCase().includes(q));
    }
    return list.sort(ordemDeAtencao);
  }, [carteira, filter, search]);

  const FILTERS: { key: typeof filter; label: string; contagem?: number }[] = [
    { key: 'atencao', label: 'Precisa de atenção', contagem: carteira.filter((l) => l.alarmes.length).length },
    { key: 'todos', label: 'Todos' },
    { key: 'onboarding', label: 'Onboarding' },
    { key: 'ativo', label: 'Ativos' },
    { key: 'inadimplente', label: 'Inadimplentes' },
    { key: 'cancelado', label: 'Cancelados' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Clientes</h1>
          <p className="text-[12px] text-foreground/40 mt-0.5">
            Carteira e contas da plataforma
            {saudeQuery.isFetching && <span className="ml-2 opacity-60">· lendo os sistemas…</span>}
          </p>
        </div>
        <button
          onClick={() => navigate('/crm/venda')}
          className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Cliente
        </button>
      </div>

      {/* ── Os números que abrem a reunião ── */}
      <TotaisDaCarteira totais={totais} />

      {saudeQuery.isError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[12px] text-foreground/70 leading-snug">
            Não consegui ler os sistemas dos clientes — a lista mostra só o que o painel já sabia.{' '}
            <button onClick={() => saudeQuery.refetch()} className="text-primary hover:underline">Tentar de novo</button>
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/30" />
          <input className={cn(inputCls, 'pl-9')} placeholder="Buscar cliente…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map(({ key, label, contagem }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'h-10 px-3 rounded-xl text-[12px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5',
                filter === key
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'border border-black/[0.08] dark:border-white/[0.08] text-foreground/50 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
              )}
            >
              {label}
              {contagem !== undefined && contagem > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold tabular-nums flex items-center justify-center">
                  {contagem}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
        </div>
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={clients.length === 0 ? 'Nenhum cliente ainda'
            : filter === 'atencao' ? 'Nenhuma conta precisando de atenção' : 'Nenhum resultado'}
          sub={clients.length === 0 ? 'Feche a primeira venda no CRM' : undefined}
        />
      ) : (
        <ListaDaCarteira linhas={filtradas} onAbrir={(id) => navigate(`/clientes/${id}`)} />
      )}
    </div>
  );
}
