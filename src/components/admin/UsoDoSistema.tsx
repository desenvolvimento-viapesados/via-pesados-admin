import {
  Truck, Loader2, ShieldCheck, TrendingUp, MessageSquare, Package,
  RefreshCw, AlertTriangle, Plug, PlugZap, UserCheck, UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAccessLog, useClientUsage, brl, brlFull,
  type Client, type ClientUsage, type AccessLogEntry,
} from '@/hooks/useAdmin';
import { SectionHeader, Panel, Kpi } from '@/components/admin/ui';

const mesLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};

const quando = (iso: string | null) => {
  if (!iso) return 'nunca';
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  if (d < 365) return `há ${Math.round(d / 30)} meses`;
  return `há ${Math.round(d / 365)} anos`;
};

const NOME_CANAL: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  facebook: 'Facebook',
  instagram: 'Instagram',
  facebook_page: 'Página do Facebook',
  meta_catalogo: 'Catálogo da Meta',
  whatsapp: 'WhatsApp',
};

/** Barra de distribuição — usada para tipo, marca e carroceria. */
const Distribuicao = ({
  titulo, itens, total,
}: {
  titulo: string;
  itens: { rotulo: string; valor: number }[];
  total: number;
}) => (
  <Panel className="p-4">
    <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30 mb-3">{titulo}</p>
    {itens.length === 0 ? (
      <p className="text-[12px] text-foreground/30 py-3">Sem dados.</p>
    ) : (
      <div className="space-y-2">
        {itens.map((i) => (
          <div key={i.rotulo} className="flex items-center gap-3">
            <p className="text-[12px] text-foreground/60 w-28 truncate shrink-0">{i.rotulo}</p>
            <div className="flex-1 h-2 rounded-full bg-black/[0.05] dark:bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-primary/60"
                style={{ width: `${Math.max(3, (i.valor / (total || 1)) * 100)}%` }} />
            </div>
            <p className="text-[12px] font-semibold tabular-nums w-14 text-right shrink-0">
              {i.valor}
              <span className="text-[10px] font-normal text-foreground/30 ml-1">
                {Math.round((i.valor / (total || 1)) * 100)}%
              </span>
            </p>
          </div>
        ))}
      </div>
    )}
  </Panel>
);

/**
 * O que o cliente faz com o sistema — carregado ao abrir a ficha.
 *
 * Era um botão. A pessoa entrava na ficha, lia um convite para "consultar
 * uso do sistema" e, na maioria das vezes, não clicava: o painel tinha o
 * dado e mostrava um botão. Dado que precisa de clique é dado que ninguém
 * usa para decidir — e a ficha existe justamente para decidir.
 *
 * O registro de acesso continua sendo gravado a cada leitura, do outro
 * lado da ponte, que é o que o art. 37 pede. O que mudou foi o número de
 * cliques, não a auditoria.
 */
export function UsoDoSistema({ client }: { client: Client }) {
  const { data: log = [] } = useAccessLog(client.id);
  const q = useClientUsage(client);

  if (!client.lojista_company_id) {
    return (
      <Panel className="p-5">
        <p className="text-[12.5px] text-foreground/45">
          O sistema deste cliente ainda não foi provisionado — sem sistema no ar, não há uso para acompanhar.
        </p>
      </Panel>
    );
  }

  if (q.isPending) {
    return (
      <Panel className="p-5 flex items-center gap-2.5 text-[12.5px] text-foreground/45">
        <Loader2 className="h-4 w-4 animate-spin" /> Lendo o sistema de {client.company_name}…
      </Panel>
    );
  }

  if (q.isError || !q.data) {
    return (
      <Panel className="p-5 space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-foreground">Não consegui ler o sistema deste cliente</p>
            <p className="text-[12px] text-foreground/45 mt-1">{(q.error as Error)?.message ?? 'Erro desconhecido'}</p>
          </div>
        </div>
        <button onClick={() => q.refetch()}
          className="h-9 px-4 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-[12.5px] font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
        </button>
      </Panel>
    );
  }

  return <PainelDeUso uso={q.data} log={log} recarregando={q.isFetching} onRecarregar={() => q.refetch()} />;
}

/**
 * O painel, sem saber de onde o dado veio.
 *
 * Separado de `UsoDoSistema` para poder ser visto: a ficha mora atrás do
 * login do painel, e no lojista eu já entreguei duas telas com erro por
 * não conseguir abrir a minha própria interface. `/dev/ficha` renderiza
 * este componente com dados de exemplo.
 */
export function PainelDeUso({
  uso, log, recarregando, onRecarregar,
}: {
  uso: ClientUsage;
  log: AccessLogEntry[];
  recarregando?: boolean;
  onRecarregar?: () => void;
}) {
  const q = { isFetching: !!recarregando, refetch: onRecarregar ?? (() => {}) };
  const {
    estoque, por_tipo, por_marca, por_carroceria, site, vendas,
    vendas_por_mes, vendas_por_tipo, atividade, acessos, veiculos, canais, marcos,
  } = uso;
  const totalTipo = por_tipo.reduce((s, t) => s + t.total, 0);
  const maxFat = Math.max(1, ...vendas_por_mes.map((m) => m.faturamento));
  const noAr = canais.anuncios.filter((a) => a.situacao === 'active');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-foreground/35 flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3 text-emerald-500/70" />
          Lido em {new Date(uso.gerado_em).toLocaleString('pt-BR')} · acesso registrado
        </p>
        <button onClick={() => q.refetch()} disabled={q.isFetching}
          className="h-7 px-2.5 rounded-lg text-[11.5px] text-foreground/45 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors flex items-center gap-1.5">
          {q.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Atualizar
        </button>
      </div>

      {/* ── Estoque ── */}
      <div>
        <SectionHeader title="Estoque" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Veículos" value={estoque.total} sub={`${estoque.disponiveis} disponíveis`} accent="text-primary" />
          <Kpi label="Vendidos" value={estoque.vendidos} sub="saíram do pátio" accent="text-emerald-500" />
          <Kpi label="Valor em pátio" value={brl(estoque.valor_tabela)} sub="preço de tabela" />
          <Kpi label="No site" value={site.publicados} sub={`de ${site.total} cadastrados`} />
          {/* O número que abre conversa com o lojista, e que não existia. */}
          <Kpi label="Parados" value={estoque.parados_60d} sub="sem mexer há 60 dias"
            accent={estoque.parados_60d > 0 ? 'text-amber-500' : 'text-foreground'} />
        </div>
      </div>

      {/* ── Canais: o que está ligado e o que está no ar ── */}
      <div>
        <SectionHeader title="Canais"
          right={<span className="text-[11px] text-foreground/35">{noAr.reduce((s, a) => s + a.total, 0)} anúncios no ar</span>} />
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {canais.conexoes.length === 0 && (
            <p className="px-4 py-3 text-[12px] text-foreground/35">Nenhum canal conectado.</p>
          )}
          {/* Uma conexão da Meta alimenta três destinos — Página,
              Instagram e catálogo. Somar os três numa linha só dava
              "Facebook · 54 no ar", número que não existe em lugar
              nenhum: cada destino tem a sua contagem. */}
          {canais.conexoes.map((c) => {
            const destinos = noAr.filter((a) => (
              c.canal === 'facebook'
                ? ['facebook', 'facebook_page', 'instagram', 'meta_catalogo'].includes(a.canal)
                : a.canal === c.canal
            ));
            return (
              <div key={c.canal} className="px-4 py-2.5">
                <div className="flex items-center gap-3 text-[12.5px]">
                  <span className={cn('shrink-0', c.ativo ? 'text-emerald-500' : 'text-red-400')}>
                    {c.ativo ? <Plug className="h-3.5 w-3.5" /> : <PlugZap className="h-3.5 w-3.5" />}
                  </span>
                  <p className="text-foreground/80 font-medium">{NOME_CANAL[c.canal] ?? c.canal}</p>
                  {c.conta && <p className="text-foreground/35 truncate">{c.conta}</p>}
                  <span className="flex-1" />
                  {!c.ativo && <span className="text-[11px] font-medium text-red-400 shrink-0">desconectado</span>}
                </div>
                {destinos.length > 0 && (
                  <div className="mt-1 ml-6.5 flex flex-wrap gap-x-4 gap-y-0.5">
                    {destinos.map((d) => (
                      <span key={d.canal} className="text-[11px] text-foreground/40 tabular-nums">
                        {NOME_CANAL[d.canal] ?? d.canal}: {d.total} no ar
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      </div>

      {/* ── Quem usa a conta ──────────────────────────────────────────
          Conta com um usuário ativo de cinco é churn em formação, e isso
          não aparece em contagem nenhuma. */}
      <div>
        <SectionHeader title="Quem usa a conta"
          right={<span className="text-[11px] text-foreground/35">
            {acessos.length} {acessos.length === 1 ? 'pessoa' : 'pessoas'}
            {marcos.nunca_entraram > 0 && ` · ${marcos.nunca_entraram} nunca entrou`}
          </span>} />
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {acessos.length === 0 && <p className="px-4 py-3 text-[12px] text-foreground/35">Nenhum usuário.</p>}
          {acessos.map((a) => (
            <div key={a.email ?? a.nome} className="px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
              <span className={cn('shrink-0', a.nunca_entrou ? 'text-foreground/25' : 'text-emerald-500')}>
                {a.nunca_entrou ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground/85 truncate">
                  {a.nome}
                  {a.administrador && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-primary/80">admin</span>
                  )}
                </p>
                <p className="text-[10.5px] text-foreground/35 truncate">{a.email} · {a.funcao}</p>
              </div>
              <p className={cn('tabular-nums shrink-0 text-[11.5px]',
                a.nunca_entrou ? 'text-amber-500' : 'text-foreground/45')}>
                {a.nunca_entrou ? 'nunca entrou' : quando(a.ultimo_acesso)}
              </p>
            </div>
          ))}
        </Panel>
      </div>

      {/* ── Mistura da frota ── */}
      <div className="grid md:grid-cols-2 gap-3">
        <Distribuicao titulo="Por tipo de veículo"
          itens={por_tipo.map((t) => ({ rotulo: t.tipo, valor: t.total }))} total={totalTipo} />
        <Distribuicao titulo="Por carroceria"
          itens={por_carroceria.map((c) => ({ rotulo: c.carroceria, valor: c.total }))} total={estoque.total} />
      </div>

      <Distribuicao titulo="Por marca"
        itens={por_marca.map((m) => ({ rotulo: m.marca, valor: m.total }))} total={estoque.total} />

      {/* ── Vendas ── */}
      <div>
        <SectionHeader title="Vendas" right={<span className="text-[11px] text-foreground/35">histórico completo</span>} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Vendas" value={vendas.total} sub={`última ${quando(vendas.ultima_venda)}`} />
          <Kpi label="Faturamento" value={brl(vendas.faturamento)} accent="text-emerald-500" />
          <Kpi label="Lucro" value={brl(vendas.lucro)}
            sub={vendas.faturamento ? `margem ${Math.round((vendas.lucro / vendas.faturamento) * 100)}%` : undefined}
            accent={vendas.lucro >= 0 ? 'text-foreground' : 'text-red-400'} />
          <Kpi label="Ticket médio" value={brl(vendas.ticket_medio)} />
        </div>
      </div>

      {vendas_por_mes.length > 0 && (
        <div>
          <SectionHeader title="Faturamento por mês" right={<span className="text-[11px] text-foreground/35">12 meses</span>} />
          <Panel className="p-4">
            <div className="flex items-end gap-1.5 h-40">
              {vendas_por_mes.map((m) => (
                <div key={m.mes} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group/b">
                  <span className="text-[9px] font-semibold text-foreground/50 tabular-nums opacity-0 group-hover/b:opacity-100 transition-opacity">
                    {m.total}×
                  </span>
                  <div className="w-full rounded-t-lg bg-primary/60 hover:bg-primary transition-colors min-h-[3px]"
                    style={{ height: `${(m.faturamento / maxFat) * 100}%` }}
                    title={`${m.total} vendas · ${brlFull(m.faturamento)}`} />
                  <span className="text-[9px] text-foreground/35 capitalize">{mesLabel(m.mes)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {vendas_por_tipo.length > 0 && (
        <Distribuicao titulo="Vendas por tipo"
          itens={vendas_por_tipo.map((t) => ({ rotulo: t.tipo, valor: t.total }))}
          total={vendas.total} />
      )}

      {/* ── O estoque, veículo a veículo ──────────────────────────────
          É o que responde "qual caminhão está parado" — pergunta que
          contagem nenhuma responde. */}
      <div>
        <SectionHeader title="Veículos"
          right={<span className="text-[11px] text-foreground/35">{veiculos.length} mais recentes</span>} />
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden max-h-[420px] overflow-y-auto">
          {veiculos.length === 0 && <p className="px-4 py-3 text-[12px] text-foreground/35">Nenhum veículo cadastrado.</p>}
          {veiculos.map((v) => {
            const parado = v.situacao !== 'vendido'
              && (Date.now() - new Date(v.mexido_em).getTime()) > 60 * 86_400_000;
            return (
              <div key={v.id} className="px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
                <Truck className={cn('h-3.5 w-3.5 shrink-0',
                  v.situacao === 'vendido' ? 'text-foreground/25' : parado ? 'text-amber-500' : 'text-foreground/45')} />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/85 truncate">
                    {[v.marca, v.modelo, v.ano].filter(Boolean).join(' ') || 'sem identificação'}
                  </p>
                  <p className="text-[10.5px] text-foreground/35 truncate">
                    {v.tipo || 'tipo não informado'}
                    {v.canais.length > 0 && ` · ${v.canais.map((c) => NOME_CANAL[c] ?? c).join(', ')}`}
                    {v.canais.length === 0 && v.situacao !== 'vendido' && ' · fora do ar'}
                  </p>
                </div>
                <p className="tabular-nums shrink-0 text-foreground/60">{v.preco ? brl(v.preco) : '—'}</p>
                <p className={cn('tabular-nums shrink-0 text-[11px] w-20 text-right',
                  v.situacao === 'vendido' ? 'text-emerald-500' : parado ? 'text-amber-500' : 'text-foreground/35')}>
                  {v.situacao === 'vendido' ? 'vendido' : quando(v.mexido_em)}
                </p>
              </div>
            );
          })}
        </Panel>
      </div>

      {/* ── Uso da plataforma ── */}
      <div>
        <SectionHeader title="Uso da plataforma" right={<span className="text-[11px] text-foreground/35">volume, não conteúdo</span>} />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Kpi label="Usuários" value={uso.uso.usuarios} />
          <Kpi label="Contatos" value={uso.uso.contatos} />
          <Kpi label="Leads" value={uso.uso.leads} />
          <Kpi label="Conversas" value={uso.uso.conversas} />
          <Kpi label="Pedidos" value={uso.uso.pedidos} sub={`${uso.uso.pedidos_abertos} abertos`} />
          <Kpi label="WhatsApp" value={uso.uso.instancias_wa} sub="instâncias" />
        </div>
      </div>

      {/* ── Sinal de vida ── */}
      <div>
        <SectionHeader title="Última atividade" right={<span className="text-[11px] text-foreground/35">sinal de vida da conta</span>} />
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {([
            { icone: <UserCheck className="h-3.5 w-3.5" />, label: 'Entrou no sistema', valor: marcos.ultimo_acesso_em },
            { icone: <Package className="h-3.5 w-3.5" />, label: 'Cadastrou veículo', valor: atividade.ultimo_produto_em },
            { icone: <TrendingUp className="h-3.5 w-3.5" />, label: 'Registrou venda', valor: atividade.ultima_venda_em },
            { icone: <MessageSquare className="h-3.5 w-3.5" />, label: 'Conversa no CRM', valor: atividade.ultima_conversa_em },
          ]).map((l) => {
            const parado = !l.valor || (Date.now() - new Date(l.valor).getTime()) > 30 * 86_400_000;
            return (
              <div key={l.label} className="px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
                <span className={cn('shrink-0', parado ? 'text-foreground/25' : 'text-emerald-500')}>{l.icone}</span>
                <p className="text-foreground/70 flex-1">{l.label}</p>
                <p className={cn('tabular-nums shrink-0', parado ? 'text-amber-500' : 'text-foreground/45')}>
                  {quando(l.valor)}
                </p>
              </div>
            );
          })}
        </Panel>
      </div>

      {/* ── O que a Via Pesados vê, e o registro de quem viu ──────────
          A frase é a promessa que o cliente lê. Mudou porque a fronteira
          mudou: veículo e usuário da conta entram; comprador, não. */}
      <div>
        <SectionHeader title="Acessos registrados"
          right={<span className="text-[11px] text-foreground/35">art. 37 · sem edição nem exclusão</span>} />
        <Panel className="p-4 space-y-3">
          <p className="text-[11.5px] text-foreground/45 leading-relaxed">
            A Via Pesados é <span className="text-foreground/70 font-medium">operadora</span> dos dados deste
            cliente — ele é o controlador. Esta tela lê os números do negócio, o catálogo de veículos e as
            contas de acesso que a própria Via Pesados provisiona.{' '}
            <span className="text-foreground/70 font-medium">
              Comprador, lead, conversa e telefone não atravessam
            </span>{' '}
            — nem nos pedidos de veículo, que vêm só como contagem e categoria. Cada leitura fica
            registrada com o e-mail de quem leu e a data, sem edição nem exclusão.
          </p>
          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05] -mx-4 border-t border-black/[0.05] dark:border-white/[0.05]">
            {log.slice(0, 10).map((a) => (
              <div key={a.id} className="px-4 py-2 flex items-center gap-3 text-[12px]">
                <p className="text-foreground/70 flex-1 truncate">{a.member_email}</p>
                <p className="text-foreground/35 shrink-0 hidden sm:block">{a.purpose}</p>
                <p className="text-foreground/35 tabular-nums shrink-0">
                  {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
