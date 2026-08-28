import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useProspects, useMeetings, useDemos, useClients, useTickets, usePayments, brl,
} from '@/hooks/useAdmin';
import { SectionHeader, Panel } from '@/components/admin/ui';

/* ══════════════════════════════════════════════════════════════════
   Duas regras governam esta tela:

   1. O esqueleto é o mesmo com 0 e com 300 clientes. Nada nasce nem
      some por condição de layout — a fila enche, a curva sobe, as
      gavetas ganham conteúdo. Tela que muda de forma parece quebrada.

   2. Número estimado não é renderizado. A versão anterior imprimia
      "vida média 36 meses" (chumbado), "NRR 100%" (fallback) e um LTV
      derivado dos dois, todos com o mesmo peso de um número medido.
      Sem insumo real, a linha não existe.

   Cor significa "faça algo", "aconteceu" ou "clique aqui".
   Cor nunca significa "está bom".
   ══════════════════════════════════════════════════════════════════ */

const dias = (ms: number) => Math.floor(ms / 86_400_000);
const desde = (iso: string) => dias(Date.now() - new Date(iso).getTime());
const hoje = () => new Date().toISOString().slice(0, 10);

const mesLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    .replace('. de ', '/');
};

const ultimosMeses = (n: number) => {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

/* ── Fila de ação ────────────────────────────────────────────────── */
type Severidade = 'critico' | 'hoje' | 'atencao';

interface ItemFila {
  tipo: string;
  nome: string;
  meta: string;
  severidade: Severidade;
  idade: number;
  destino: string;
}

const PESO: Record<Severidade, number> = { critico: 0, hoje: 1, atencao: 2 };

const BARRA: Record<Severidade, string> = {
  critico: 'bg-red-500',
  hoje: 'bg-primary',
  atencao: 'bg-amber-500',
};

/* ── Linha de gaveta ─────────────────────────────────────────────── */
const Gaveta = ({
  titulo, resumo, vazia, aberta, onToggle, children,
}: {
  titulo: string;
  resumo: string;
  vazia: boolean;
  aberta: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <div className="border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0">
    <button
      onClick={vazia ? undefined : onToggle}
      disabled={vazia}
      className={cn(
        'w-full flex items-center gap-3 py-3.5 text-left transition-colors',
        vazia ? 'cursor-default' : 'hover:text-foreground group',
      )}
    >
      <p className={cn('text-[13px] flex-1', vazia ? 'text-foreground/40' : 'text-foreground/80')}>
        {titulo}
      </p>
      <p className={cn('text-[12.5px] shrink-0', vazia ? 'text-foreground/25' : 'text-foreground/45')}>
        {vazia ? '—' : resumo}
      </p>
      {!vazia && (
        aberta
          ? <ChevronDown className="h-4 w-4 text-foreground/30 shrink-0" />
          : <ChevronRight className="h-4 w-4 text-foreground/25 group-hover:text-foreground/50 shrink-0 transition-colors" />
      )}
    </button>
    {aberta && !vazia && <div className="pb-4">{children}</div>}
  </div>
);

/** Linha de detalhe: rótulo à esquerda, valor à direita. Nunca um cartão —
 *  camada de detalhe não pode competir visualmente com o assunto. */
const Linha = ({ label, valor, onClick }: { label: React.ReactNode; valor: React.ReactNode; onClick?: () => void }) => (
  <div
    onClick={onClick}
    className={cn(
      'flex items-center gap-3 py-2 border-b border-black/[0.04] dark:border-white/[0.04] last:border-b-0',
      onClick && 'cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.03] -mx-2 px-2 rounded-md',
    )}
  >
    <div className="text-[12.5px] text-foreground/60 flex-1 min-w-0">{label}</div>
    <div className="text-[12.5px] text-foreground/80 tabular-nums shrink-0">{valor}</div>
  </div>
);

/* ══ Página ═══════════════════════════════════════════════════════ */
export default function Relatorios() {
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const { data: prospects = [] } = useProspects();
  const { data: meetings = [] } = useMeetings();
  const { data: demos = [] } = useDemos();
  const { data: tickets = [] } = useTickets();
  const { data: payments = [] } = usePayments();

  const [janela, setJanela] = useState<12 | 0>(12);
  const [gaveta, setGaveta] = useState<'aquisicao' | 'carteira' | null>(null);

  /* ── Zona 1 · o que pede resposta hoje ───────────────────────── */
  const fila = useMemo<ItemFila[]>(() => {
    const itens: ItemFila[] = [];
    const h = hoje();

    payments
      .filter((p) => p.status !== 'pago' && p.status !== 'cancelado' && p.due_date < h)
      .forEach((p) => itens.push({
        tipo: 'Cobrança',
        nome: p.client?.company_name ?? p.description,
        meta: `${brl(Number(p.amount))} · ${dias(Date.now() - new Date(p.due_date + 'T12:00:00').getTime())} dias`,
        severidade: 'critico',
        idade: dias(Date.now() - new Date(p.due_date + 'T12:00:00').getTime()),
        destino: '/pagamentos',
      }));

    tickets
      .filter((t) => t.status !== 'resolvido' && (t.priority === 'alta' || t.priority === 'urgente'))
      .forEach((t) => itens.push({
        tipo: 'Ticket',
        nome: t.subject,
        meta: `${t.priority} · ${desde(t.created_at)} dias`,
        severidade: 'critico',
        idade: desde(t.created_at),
        destino: '/tickets',
      }));

    meetings
      .filter((m) => m.status === 'agendada' && m.scheduled_at?.slice(0, 10) === h)
      .forEach((m) => itens.push({
        tipo: 'Reunião',
        nome: m.title,
        meta: `hoje, ${new Date(m.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        severidade: 'hoje',
        idade: 0,
        destino: '/crm',
      }));

    prospects
      .filter((p) => !['ganho', 'perdido'].includes(p.stage) && desde(p.updated_at) > 10)
      .forEach((p) => itens.push({
        tipo: 'Prospect',
        nome: p.company_name,
        meta: `parado há ${desde(p.updated_at)} dias`,
        severidade: 'atencao',
        idade: desde(p.updated_at),
        destino: '/crm',
      }));

    clients
      .filter((c) => c.status === 'onboarding' && desde(c.created_at) > 30)
      .forEach((c) => itens.push({
        tipo: 'Onboarding',
        nome: c.company_name,
        meta: `há ${desde(c.created_at)} dias`,
        severidade: 'atencao',
        idade: desde(c.created_at),
        destino: `/clientes/${c.id}`,
      }));

    return itens.sort((a, b) => PESO[a.severidade] - PESO[b.severidade] || b.idade - a.idade);
  }, [payments, tickets, meetings, prospects, clients]);

  const criticos = fila.filter((i) => i.severidade === 'critico').length;

  /* ── Zona 2 · a empresa cresceu? ─────────────────────────────── */
  const crescimento = useMemo(() => {
    const primeiro = clients.length
      ? clients.reduce((min, c) => (c.created_at < min ? c.created_at : min), clients[0].created_at)
      : null;
    const nMeses = janela === 12
      ? 12
      : Math.max(12, primeiro
        ? Math.ceil((Date.now() - new Date(primeiro).getTime()) / (30 * 86_400_000)) + 1
        : 12);
    const meses = ultimosMeses(nMeses);

    const vivo = (c: typeof clients[number], corte: Date) => {
      if (new Date(c.created_at) >= corte) return false;
      if (!c.canceled_at) return c.status !== 'cancelado';
      return new Date(c.canceled_at) >= corte;
    };

    const serie = meses.map((m) => {
      const corte = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1);
      const ativos = clients.filter((c) => vivo(c, corte));
      return {
        mes: m,
        ativos: ativos.length,
        mrr: ativos.reduce((s, c) => s + Number(c.mrr ?? 0), 0),
        entraram: clients.filter((c) => c.created_at.slice(0, 7) === m).length,
        sairam: clients.filter((c) => (c.canceled_at ?? '').slice(0, 7) === m).length,
      };
    });

    const atual = serie[serie.length - 1];
    const anterior = serie[serie.length - 2];
    const mrr = atual?.mrr ?? 0;
    const ativos = atual?.ativos ?? 0;
    // Delta só quando houve mês anterior com base — variação sobre o nada não é variação.
    const delta = anterior && (anterior.mrr > 0 || mrr > 0) ? mrr - anterior.mrr : null;

    return { serie, mrr, ativos, delta, arpa: ativos >= 3 ? mrr / ativos : null };
  }, [clients, janela]);

  /* ── Gaveta: aquisição ───────────────────────────────────────── */
  const aquisicao = useMemo(() => {
    const ETAPAS = [
      { key: 'novo', label: 'Novos' },
      { key: 'contato', label: 'Em contato' },
      { key: 'reuniao', label: 'Reunião' },
      { key: 'amostra', label: 'Amostra' },
      { key: 'proposta', label: 'Proposta' },
      { key: 'fechamento', label: 'Fechamento' },
    ];
    const funil = ETAPAS.map(({ key, label }) => ({
      label,
      total: prospects.filter((p) => p.stage === key).length,
    }));

    const ganhos = prospects.filter((p) => p.stage === 'ganho').length;
    const perdidos = prospects.filter((p) => p.stage === 'perdido').length;
    const fechados = ganhos + perdidos;

    const ciclos = clients
      .filter((c) => c.contract_signed_at)
      .map((c) => dias(new Date(c.contract_signed_at!).getTime() - new Date(c.created_at).getTime()))
      .filter((d) => d >= 0);

    const motivos: Record<string, number> = {};
    prospects.filter((p) => p.stage === 'perdido').forEach((p) => {
      const r = p.lost_reason?.trim() || 'Sem motivo registrado';
      motivos[r] = (motivos[r] ?? 0) + 1;
    });

    const convertidas = demos.filter((d) => d.status === 'convertida').length;
    const novosNaJanela = clients.filter((c) => desde(c.created_at) <= 30).length;

    return {
      funil,
      maxFunil: Math.max(...funil.map((f) => f.total), 0),
      ganhos, perdidos, fechados,
      ciclo: ciclos.length ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length) : null,
      motivos: Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 4),
      demos: demos.length, convertidas,
      novosNaJanela,
      vazia: prospects.length === 0 && demos.length === 0,
    };
  }, [prospects, clients, demos]);

  /* ── Gaveta: carteira ────────────────────────────────────────── */
  const carteira = useMemo(() => {
    const ativos = clients.filter((c) => c.status === 'ativo' || c.status === 'onboarding');
    const mrrTotal = ativos.reduce((s, c) => s + Number(c.mrr ?? 0), 0);
    const cancelados = clients.filter((c) => c.status === 'cancelado');
    const emAberto = payments.filter((p) => p.status !== 'pago' && p.status !== 'cancelado');

    const linhas = [...ativos]
      .sort((a, b) => Number(b.mrr ?? 0) - Number(a.mrr ?? 0))
      .map((c) => ({
        id: c.id,
        nome: c.company_name,
        plano: c.plan,
        mrr: Number(c.mrr ?? 0),
        share: mrrTotal ? (Number(c.mrr ?? 0) / mrrTotal) * 100 : 0,
        entrou: new Date(c.created_at).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        emAberto: emAberto.filter((p) => p.client_id === c.id).length,
        tickets: tickets.filter((t) => t.client_id === c.id && t.status !== 'resolvido').length,
      }));

    return {
      linhas,
      cancelados: cancelados.length,
      churnReais: cancelados.reduce((s, c) => s + Number(c.mrr ?? 0), 0),
      vazia: clients.length === 0,
    };
  }, [clients, payments, tickets]);

  /* ── Curva do MRR ────────────────────────────────────────────── */
  const curva = useMemo(() => {
    const s = crescimento.serie;
    const max = Math.max(...s.map((p) => p.mrr), 0);
    const L = 100;
    const pontos = s.map((p, i) => {
      const x = s.length > 1 ? (i / (s.length - 1)) * 100 : 0;
      const y = max > 0 ? L - (p.mrr / max) * L : L;
      return `${x},${y}`;
    });
    return { d: pontos.join(' '), temMovimento: max > 0 };
  }, [crescimento.serie]);

  const marcasEixo = (() => {
    const s = crescimento.serie;
    if (s.length < 3) return s.map((p) => p.mes);
    return [s[0].mes, s[Math.floor(s.length / 2)].mes, s[s.length - 1].mes];
  })();

  return (
    <div className="flex flex-col gap-6 sm:gap-9 max-w-5xl">

      {/* ══ ZONA 1 · AÇÃO ═══════════════════════════════════════ */}
      <div>
        <SectionHeader
          title="Ação"
          right={
            fila.length > 0 ? (
              <span className={cn(
                'min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums',
                criticos > 0 ? 'bg-red-500 text-white' : 'bg-foreground/10 text-foreground/60',
              )}>
                {fila.length}
              </span>
            ) : undefined
          }
        />
        <Panel className="overflow-hidden">
          {fila.length === 0 ? (
            // Boa notícia não merece meia dobra: uma linha, na altura de um item.
            <div className="px-4 h-11 flex items-center gap-3">
              <p className="text-[13px] text-foreground/60 flex-1">Fila limpa</p>
              <p className="text-[11.5px] text-foreground/30">nada vencido · nada crítico · nada parado</p>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
              {fila.slice(0, 6).map((item, i) => (
                <button
                  key={`${item.tipo}-${i}`}
                  onClick={() => navigate(item.destino)}
                  className={cn(
                    'w-full h-11 pr-3 flex items-center gap-3 text-left transition-colors group',
                    item.severidade === 'critico'
                      ? 'bg-red-500/[0.06] hover:bg-red-500/[0.10]'
                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]',
                  )}
                >
                  <span className={cn('w-[3px] h-full shrink-0', BARRA[item.severidade])} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/35 w-20 shrink-0">
                    {item.tipo}
                  </span>
                  <span className="text-[13px] text-foreground/85 flex-1 truncate">{item.nome}</span>
                  <span className="text-[11.5px] text-foreground/45 tabular-nums shrink-0">{item.meta}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-foreground/20 group-hover:text-foreground/50 shrink-0 transition-colors" />
                </button>
              ))}
              {fila.length > 6 && (
                <button
                  onClick={() => navigate('/crm')}
                  className="w-full h-9 px-4 text-left text-[11.5px] text-foreground/40 hover:text-foreground/70 transition-colors"
                >
                  mais {fila.length - 6}
                </button>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* ══ ZONA 2 · CRESCIMENTO ════════════════════════════════ */}
      <div>
        <SectionHeader
          title="Crescimento"
          right={
            <div className="flex items-center gap-1">
              {([[12, '12m'], [0, 'Tudo']] as const).map(([v, l]) => (
                <button
                  key={l}
                  onClick={() => setJanela(v)}
                  className={cn(
                    'h-6 px-2 rounded-md text-[11px] font-medium transition-colors',
                    janela === v
                      ? 'bg-foreground/10 text-foreground/80'
                      : 'text-foreground/35 hover:text-foreground/60',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          }
        />
        <Panel className="p-5 sm:p-6">
          {/* O número e a curva são um objeto só: a pergunta é a inclinação. */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={cn(
                'text-[30px] font-bold tracking-tight tabular-nums leading-none',
                crescimento.mrr > 0 ? 'text-foreground' : 'text-foreground/30',
              )}>
                {brl(crescimento.mrr)}
              </p>
              <p className="text-[12px] text-foreground/40 mt-1.5">
                {crescimento.ativos === 0
                  ? '0 clientes'
                  : `${crescimento.ativos} cliente${crescimento.ativos > 1 ? 's' : ''}`}
                {crescimento.arpa !== null && ` · ${brl(crescimento.arpa)} por conta`}
              </p>
            </div>
            {crescimento.delta !== null && crescimento.delta !== 0 && (
              <p className={cn(
                'text-[12px] font-semibold tabular-nums shrink-0',
                crescimento.delta > 0 ? 'text-emerald-500' : 'text-red-400',
              )}>
                {crescimento.delta > 0 ? '▲' : '▼'} {brl(Math.abs(crescimento.delta))} no mês
              </p>
            )}
          </div>

          <div className="mt-6">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-[100px] overflow-visible">
              <polyline
                points={curva.d}
                fill="none"
                stroke="var(--primary, #FF6E00)"
                strokeWidth={curva.temMovimento ? 1.2 : 0.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={curva.temMovimento ? 1 : 0.4}
              />
            </svg>
            <div className="flex justify-between mt-2">
              {marcasEixo.map((m) => (
                <span key={m} className="text-[10px] text-foreground/30 capitalize">{mesLabel(m)}</span>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* ══ ZONA 3 · GAVETAS ════════════════════════════════════ */}
      <Panel className="px-5">
        <Gaveta
          titulo="Aquisição"
          resumo={
            aquisicao.novosNaJanela > 0
              ? `${aquisicao.novosNaJanela} cliente${aquisicao.novosNaJanela > 1 ? 's' : ''} novo${aquisicao.novosNaJanela > 1 ? 's' : ''}`
              : `${prospects.filter((p) => !['ganho', 'perdido'].includes(p.stage)).length} no funil`
          }
          vazia={aquisicao.vazia}
          aberta={gaveta === 'aquisicao'}
          onToggle={() => setGaveta(gaveta === 'aquisicao' ? null : 'aquisicao')}
        >
          <div className="space-y-0.5">
            {aquisicao.funil.map((e, i) => {
              const anterior = i > 0 ? aquisicao.funil[i - 1].total : null;
              const queda = anterior && anterior > 0 && e.total < anterior
                ? Math.round((1 - e.total / anterior) * 100)
                : null;
              return (
                <Linha
                  key={e.label}
                  onClick={() => navigate('/crm')}
                  label={
                    <div className="flex items-center gap-2.5">
                      <span className="w-24 shrink-0">{e.label}</span>
                      <span className="flex-1 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.06] overflow-hidden max-w-[160px]">
                        {/* Barra de zero tem largura zero: toco mínimo sugere atividade onde não há. */}
                        <span
                          className="block h-full rounded-full bg-primary/60"
                          style={{ width: aquisicao.maxFunil ? `${(e.total / aquisicao.maxFunil) * 100}%` : '0%' }}
                        />
                      </span>
                    </div>
                  }
                  valor={
                    <>
                      {e.total}
                      {queda !== null && <span className="text-foreground/30 ml-1.5">−{queda}%</span>}
                    </>
                  }
                />
              );
            })}
            {aquisicao.fechados > 0 && (
              <Linha
                label="Win rate"
                valor={`${Math.round((aquisicao.ganhos / aquisicao.fechados) * 100)}% · ${aquisicao.ganhos} de ${aquisicao.fechados}`}
              />
            )}
            {aquisicao.demos > 0 && (
              <Linha label="Conversão de amostra" valor={`${aquisicao.convertidas} de ${aquisicao.demos}`} />
            )}
            {aquisicao.ciclo !== null && (
              <Linha label="Ciclo de venda" valor={`${aquisicao.ciclo} dias`} />
            )}
            {aquisicao.motivos.map(([motivo, n]) => (
              <Linha key={motivo} label={<span className="text-foreground/45">Perdido · {motivo}</span>} valor={n} />
            ))}
          </div>
        </Gaveta>

        <Gaveta
          titulo="Carteira"
          resumo={
            carteira.cancelados > 0
              ? `${carteira.cancelados} cancelamento${carteira.cancelados > 1 ? 's' : ''}`
              : `${carteira.linhas.length} cliente${carteira.linhas.length === 1 ? '' : 's'}`
          }
          vazia={carteira.vazia}
          aberta={gaveta === 'carteira'}
          onToggle={() => setGaveta(gaveta === 'carteira' ? null : 'carteira')}
        >
          <div className="space-y-0.5">
            {carteira.linhas.map((c) => (
              <Linha
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                label={
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-foreground/80 truncate">{c.nome}</span>
                    <span className="text-[11px] text-foreground/30 shrink-0">{c.plano}</span>
                    {c.emAberto > 0 && (
                      <span className="text-[11px] text-amber-500 shrink-0">{c.emAberto} em aberto</span>
                    )}
                    {c.tickets > 0 && (
                      <span className="text-[11px] text-foreground/35 shrink-0">{c.tickets} ticket{c.tickets > 1 ? 's' : ''}</span>
                    )}
                  </div>
                }
                valor={
                  <>
                    {brl(c.mrr)}
                    <span className="text-foreground/30 ml-1.5">{Math.round(c.share)}%</span>
                  </>
                }
              />
            ))}
            {carteira.cancelados > 0 && (
              <Linha
                label={<span className="text-foreground/45">Cancelamentos</span>}
                valor={`${carteira.cancelados} · ${brl(carteira.churnReais)}`}
              />
            )}
            <div className="pt-3 mt-1">
              {[...crescimento.serie].reverse().slice(0, 6).map((s) => (
                <Linha
                  key={s.mes}
                  label={<span className="capitalize text-foreground/45">{mesLabel(s.mes)}</span>}
                  valor={
                    <span className="flex items-center gap-3">
                      <span className="text-emerald-500/80 w-8 text-right">{s.entraram || '—'}</span>
                      <span className="text-red-400/70 w-8 text-right">{s.sairam || '—'}</span>
                      <span className="text-foreground/30 w-8 text-right">{s.ativos}</span>
                      <span className="w-20 text-right">{brl(s.mrr)}</span>
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        </Gaveta>
      </Panel>
    </div>
  );
}
