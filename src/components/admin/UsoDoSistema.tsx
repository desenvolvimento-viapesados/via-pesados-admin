import { useState } from 'react';
import {
  Truck, Loader2, ShieldCheck, Eye, TrendingUp, Users, MessageSquare,
  Package, Globe, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fetchClientUsage, useAccessLog, brl, brlFull, type ClientUsage, type Client } from '@/hooks/useAdmin';
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

export function UsoDoSistema({ client }: { client: Client }) {
  const [uso, setUso] = useState<ClientUsage | null>(null);
  const [carregando, setCarregando] = useState(false);
  const { data: log = [], refetch: recarregarLog } = useAccessLog(client.id);

  const consultar = async () => {
    if (!client.lojista_company_id) return;
    setCarregando(true);
    try {
      const dados = await fetchClientUsage({
        company_id: client.lojista_company_id,
        client_id: client.id,
        client_name: client.company_name,
        purpose: 'acompanhamento de uso',
      });
      setUso(dados);
      recarregarLog();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  if (!client.lojista_company_id) {
    return (
      <Panel className="p-5">
        <p className="text-[12.5px] text-foreground/45">
          O sistema deste cliente ainda não foi provisionado — sem sistema no ar, não há uso para acompanhar.
        </p>
      </Panel>
    );
  }

  /* ── Antes de consultar: o aviso, não os dados ────────────────── */
  if (!uso) {
    return (
      <div className="space-y-3">
        <Panel className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/12 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4.5 w-4.5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-foreground">Dados de uso de {client.company_name}</p>
              <p className="text-[12px] text-foreground/45 mt-1.5 leading-relaxed">
                A Via Pesados é <span className="text-foreground/70 font-medium">operadora</span> dos dados
                deste cliente — ele é o controlador. Esta janela devolve apenas{' '}
                <span className="text-foreground/70 font-medium">contagens, somas e distribuições</span>:
                quantos veículos, qual a mistura de tipos, faturamento agregado, vendas por mês.
              </p>
              <p className="text-[12px] text-foreground/45 mt-2 leading-relaxed">
                Nenhum nome, telefone, CPF, CNPJ, placa ou e-mail atravessa — a consulta não lê coluna
                pessoal alguma. E cada acesso fica registrado com seu e-mail e a data, sem possibilidade
                de edição ou exclusão, como manda o art. 37 da LGPD.
              </p>
              <button onClick={consultar} disabled={carregando}
                className="mt-4 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center gap-2">
                {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Consultar uso do sistema
              </button>
            </div>
          </div>
        </Panel>

        {log.length > 0 && (
          <div>
            <SectionHeader title="Acessos registrados" right={<span className="text-[11px] text-foreground/35">{log.length}</span>} />
            <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
              {log.slice(0, 8).map((a) => (
                <div key={a.id} className="px-4 py-2.5 flex items-center gap-3 text-[12px]">
                  <p className="text-foreground/70 flex-1 truncate">{a.member_email}</p>
                  <p className="text-foreground/35 shrink-0">{a.purpose}</p>
                  <p className="text-foreground/35 tabular-nums shrink-0">
                    {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </Panel>
          </div>
        )}
      </div>
    );
  }

  /* ── Com dados ────────────────────────────────────────────────── */
  const { estoque, por_tipo, por_marca, por_carroceria, site, vendas, vendas_por_mes, vendas_por_tipo, atividade } = uso;
  const totalTipo = por_tipo.reduce((s, t) => s + t.total, 0);
  const maxFat = Math.max(1, ...vendas_por_mes.map((m) => m.faturamento));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-foreground/35">
          Agregado em {new Date(uso.gerado_em).toLocaleString('pt-BR')} · acesso registrado
        </p>
        <button onClick={consultar} disabled={carregando}
          className="h-7 px-2.5 rounded-lg text-[11.5px] text-foreground/45 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors flex items-center gap-1.5">
          {carregando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Atualizar
        </button>
      </div>

      {/* Estoque */}
      <div>
        <SectionHeader title="Estoque" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Veículos" value={estoque.total} sub={`${estoque.disponiveis} disponíveis`} accent="text-primary" />
          <Kpi label="Vendidos" value={estoque.vendidos} sub="saíram do pátio" accent="text-emerald-500" />
          <Kpi label="Valor em pátio" value={brl(estoque.valor_tabela)} sub="preço de tabela" />
          <Kpi label="No site" value={site.publicados} sub={`de ${site.total} cadastrados`} />
        </div>
      </div>

      {/* Mistura da frota — "mais caminhão ou carreta" */}
      <div className="grid md:grid-cols-2 gap-3">
        <Distribuicao titulo="Por tipo de veículo"
          itens={por_tipo.map((t) => ({ rotulo: t.tipo, valor: t.total }))} total={totalTipo} />
        <Distribuicao titulo="Por carroceria"
          itens={por_carroceria.map((c) => ({ rotulo: c.carroceria, valor: c.total }))} total={estoque.total} />
      </div>

      <Distribuicao titulo="Por marca"
        itens={por_marca.map((m) => ({ rotulo: m.marca, valor: m.total }))} total={estoque.total} />

      {/* Vendas */}
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

      {/* Evolução */}
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

      {/* Uso da plataforma: volume, não conteúdo */}
      <div>
        <SectionHeader title="Uso da plataforma" right={<span className="text-[11px] text-foreground/35">volume, não conteúdo</span>} />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Usuários" value={uso.uso.usuarios} />
          <Kpi label="Contatos" value={uso.uso.contatos} />
          <Kpi label="Leads" value={uso.uso.leads} />
          <Kpi label="Conversas" value={uso.uso.conversas} />
          <Kpi label="WhatsApp" value={uso.uso.instancias_wa} sub="instâncias" />
        </div>
      </div>

      {/* Sinal de vida — o melhor previsor de churn */}
      <div>
        <SectionHeader title="Última atividade" right={<span className="text-[11px] text-foreground/35">sinal de vida da conta</span>} />
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {([
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

      {/* Registro do tratamento */}
      <div>
        <SectionHeader title="Acessos registrados"
          right={<span className="text-[11px] text-foreground/35">art. 37 · sem edição nem exclusão</span>} />
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {log.slice(0, 10).map((a) => (
            <div key={a.id} className="px-4 py-2.5 flex items-center gap-3 text-[12px]">
              <p className="text-foreground/70 flex-1 truncate">{a.member_email}</p>
              <p className="text-foreground/35 shrink-0 hidden sm:block">{a.purpose}</p>
              <p className="text-foreground/35 tabular-nums shrink-0">
                {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
