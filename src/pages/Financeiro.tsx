import { useMemo, useState } from 'react';
import {
  Plus, TrendingUp, TrendingDown, Wallet, Loader2, Trash2, Check, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useClients, usePayments, useFinCategories, useFinTransactions,
  useCreateFinTransaction, useUpdateFinTransaction, useDeleteFinTransaction,
  brl, brlFull, type FinTransaction, type FinStatus,
} from '@/hooks/useAdmin';
import { SectionHeader, Panel, Kpi, EmptyState } from '@/components/admin/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const hoje = () => new Date().toISOString().slice(0, 10);
const mesDe = (d: string) => d.slice(0, 7);

const mesLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};

const dataLabel = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';

/** Últimos N meses como 'YYYY-MM', do mais antigo ao mais recente. */
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

const STATUS_CFG: Record<FinStatus, { label: string; cls: string }> = {
  pago:      { label: 'Pago',      cls: 'bg-emerald-500/15 text-emerald-500' },
  pendente:  { label: 'Pendente',  cls: 'bg-amber-500/15 text-amber-500' },
  atrasado:  { label: 'Atrasado',  cls: 'bg-red-500/15 text-red-400' },
  cancelado: { label: 'Cancelado', cls: 'bg-foreground/10 text-foreground/40' },
};

const PERIODOS = [
  { key: 'mes',   label: 'Este mês' },
  { key: 'tri',   label: '3 meses' },
  { key: 'ano',   label: '12 meses' },
  { key: 'tudo',  label: 'Tudo' },
] as const;
type Periodo = typeof PERIODOS[number]['key'];

/* ── Diálogo de lançamento ──────────────────────────────────────── */
function LancamentoDialog({ open, onClose, tipo }: { open: boolean; onClose: () => void; tipo: 'receita' | 'despesa' }) {
  const { data: categorias = [] } = useFinCategories();
  const { data: clients = [] } = useClients();
  const criar = useCreateFinTransaction();

  const vazio = {
    description: '', amount: '', category_id: '', client_id: '',
    due_date: hoje(), competence_date: hoje(), status: 'pendente' as FinStatus,
    recurrence: 'unica' as FinTransaction['recurrence'], parcelas: '2', notes: '',
  };
  const [form, setForm] = useState(vazio);
  const [salvando, setSalvando] = useState(false);

  const doTipo = categorias.filter((c) => c.type === tipo);

  const salvar = async () => {
    const valor = Number(form.amount.replace(/\./g, '').replace(',', '.'));
    if (!form.description.trim()) { toast.error('Descreva o lançamento'); return; }
    if (!valor || valor <= 0) { toast.error('Informe um valor'); return; }

    setSalvando(true);
    try {
      const base = {
        type: tipo,
        status: form.status,
        category_id: form.category_id || null,
        client_id: form.client_id || null,
        description: form.description.trim(),
        notes: form.notes.trim() || null,
        payment_date: form.status === 'pago' ? form.due_date : null,
      };

      // Recorrente e parcelado viram várias linhas: o fluxo de caixa
      // precisa de uma data por parcela, não de um total solto.
      const repeticoes =
        form.recurrence === 'unica' ? 1
        : form.recurrence === 'parcelada' ? Math.max(2, Number(form.parcelas) || 2)
        : 12;
      const passoMeses =
        form.recurrence === 'trimestral' ? 3
        : form.recurrence === 'anual' ? 12
        : 1;

      const grupo = repeticoes > 1 ? crypto.randomUUID() : null;
      const valorParcela = form.recurrence === 'parcelada' ? valor / repeticoes : valor;

      const rows = Array.from({ length: repeticoes }, (_, i) => {
        const venc = new Date(form.due_date + 'T12:00:00');
        venc.setMonth(venc.getMonth() + i * passoMeses);
        const comp = new Date(form.competence_date + 'T12:00:00');
        comp.setMonth(comp.getMonth() + i * passoMeses);
        return {
          ...base,
          amount: Number(valorParcela.toFixed(2)),
          due_date: venc.toISOString().slice(0, 10),
          competence_date: comp.toISOString().slice(0, 10),
          payment_date: i === 0 ? base.payment_date : null,
          status: (i === 0 ? form.status : 'pendente') as FinStatus,
          recurrence: form.recurrence,
          installment_group_id: grupo,
          installment_number: repeticoes > 1 ? i + 1 : null,
          total_installments: repeticoes > 1 ? repeticoes : null,
        };
      });

      await criar.mutateAsync(rows);
      toast.success(repeticoes > 1 ? `${repeticoes} lançamentos criados` : 'Lançamento criado');
      setForm(vazio);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">
            {tipo === 'receita' ? 'Nova receita' : 'Nova despesa'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 pt-1">
          <input className={inputCls} placeholder="Descrição *" value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />

          <div className="grid grid-cols-2 gap-2.5">
            <input className={inputCls} placeholder="Valor (R$) *" inputMode="decimal" value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            <select className={inputCls} value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
              <option value="">Categoria…</option>
              {doTipo.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {tipo === 'receita' && (
            <select className={inputCls} value={form.client_id}
              onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}>
              <option value="">Vincular a um cliente (opcional)…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <p className="text-[10.5px] text-foreground/40 mb-1 px-1">Vencimento</p>
              <input type="date" className={inputCls} value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div>
              <p className="text-[10.5px] text-foreground/40 mb-1 px-1">Competência</p>
              <input type="date" className={inputCls} value={form.competence_date}
                onChange={(e) => setForm((f) => ({ ...f, competence_date: e.target.value }))} />
            </div>
          </div>
          <p className="text-[10px] text-foreground/30 leading-snug px-1">
            Vencimento é quando o dinheiro anda; competência é o mês a que o resultado pertence. O DRE
            usa a competência, o fluxo de caixa usa o vencimento.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <select className={inputCls} value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as FinStatus }))}>
              <option value="pendente">Pendente</option>
              <option value="pago">{tipo === 'receita' ? 'Recebido' : 'Pago'}</option>
              <option value="atrasado">Atrasado</option>
            </select>
            <select className={inputCls} value={form.recurrence}
              onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as FinTransaction['recurrence'] }))}>
              <option value="unica">Única</option>
              <option value="mensal">Mensal (12×)</option>
              <option value="trimestral">Trimestral (12×)</option>
              <option value="anual">Anual (12×)</option>
              <option value="parcelada">Parcelada</option>
            </select>
          </div>

          {form.recurrence === 'parcelada' && (
            <input className={inputCls} placeholder="Número de parcelas" inputMode="numeric" value={form.parcelas}
              onChange={(e) => setForm((f) => ({ ...f, parcelas: e.target.value }))} />
          )}

          <textarea className={cn(inputCls, 'h-16 py-2 resize-none')} placeholder="Observações"
            value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />

          <button onClick={salvar} disabled={salvando}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Lançar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Página ─────────────────────────────────────────────────────── */
export default function Financeiro() {
  const { data: clients = [] } = useClients();
  const { data: payments = [] } = usePayments();
  const { data: transacoes = [], isLoading } = useFinTransactions();
  const atualizar = useUpdateFinTransaction();
  const remover = useDeleteFinTransaction();

  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [dialogo, setDialogo] = useState<'receita' | 'despesa' | null>(null);

  const inicio = useMemo(() => {
    const d = new Date();
    if (periodo === 'mes') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    if (periodo === 'tri') { d.setMonth(d.getMonth() - 2); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
    if (periodo === 'ano') { d.setMonth(d.getMonth() - 11); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
    return '0000-01-01';
  }, [periodo]);

  const noPeriodo = useMemo(
    () => transacoes.filter((t) => t.competence_date >= inicio && t.status !== 'cancelado'),
    [transacoes, inicio],
  );

  const stats = useMemo(() => {
    const receitas = noPeriodo.filter((t) => t.type === 'receita');
    const despesas = noPeriodo.filter((t) => t.type === 'despesa');

    const somar = (l: FinTransaction[]) => l.reduce((s, t) => s + Number(t.amount), 0);
    const recebido = somar(receitas.filter((t) => t.status === 'pago'));
    const pago = somar(despesas.filter((t) => t.status === 'pago'));

    // MRR contratado dos clientes ativos — a receita recorrente que
    // sustenta a operação, independente do que já entrou no caixa.
    const mrr = clients
      .filter((c) => c.status === 'ativo')
      .reduce((s, c) => s + Number(c.mrr ?? 0), 0);

    const aReceber = payments
      .filter((p) => p.status !== 'pago')
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);

    const inadimplencia = payments
      .filter((p) => p.status !== 'pago' && p.due_date < hoje())
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);

    const porCategoria = (tipo: 'receita' | 'despesa') => {
      const mapa = new Map<string, { nome: string; cor: string; total: number }>();
      noPeriodo.filter((t) => t.type === tipo).forEach((t) => {
        const nome = t.category?.name ?? 'Sem categoria';
        const atual = mapa.get(nome) ?? { nome, cor: t.category?.color ?? '#64748b', total: 0 };
        atual.total += Number(t.amount);
        mapa.set(nome, atual);
      });
      return [...mapa.values()].sort((a, b) => b.total - a.total);
    };

    return {
      receitas: somar(receitas),
      despesas: somar(despesas),
      resultado: somar(receitas) - somar(despesas),
      recebido, pago, caixa: recebido - pago,
      mrr, aReceber, inadimplencia,
      catReceita: porCategoria('receita'),
      catDespesa: porCategoria('despesa'),
    };
  }, [noPeriodo, clients, payments]);

  // Série mensal por competência: é ela que mostra se o negócio cresce.
  const serie = useMemo(() => {
    const meses = ultimosMeses(12);
    return meses.map((m) => {
      const doMes = transacoes.filter((t) => mesDe(t.competence_date) === m && t.status !== 'cancelado');
      const rec = doMes.filter((t) => t.type === 'receita').reduce((s, t) => s + Number(t.amount), 0);
      const des = doMes.filter((t) => t.type === 'despesa').reduce((s, t) => s + Number(t.amount), 0);
      return { mes: m, receita: rec, despesa: des, resultado: rec - des };
    });
  }, [transacoes]);

  const maxSerie = Math.max(1, ...serie.map((s) => Math.max(s.receita, s.despesa)));

  const marcarPago = async (t: FinTransaction) => {
    await atualizar.mutateAsync({ id: t.id, status: 'pago', payment_date: hoje() });
    toast.success(t.type === 'receita' ? 'Recebimento confirmado' : 'Pagamento confirmado');
  };

  const excluir = async (t: FinTransaction) => {
    if (!confirm(`Excluir "${t.description}"?`)) return;
    await remover.mutateAsync(t.id);
    toast.success('Lançamento excluído');
  };

  return (
    <div className="flex flex-col gap-7">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Financeiro</h1>
          <p className="text-[12px] text-foreground/40 mt-0.5">Caixa, resultado e recorrência da Via Pesados</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDialogo('receita')}
            className="h-9 px-3 rounded-xl bg-emerald-500/15 text-emerald-500 text-[12.5px] font-semibold hover:bg-emerald-500/25 transition-colors flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />Receita
          </button>
          <button onClick={() => setDialogo('despesa')}
            className="h-9 px-3 rounded-xl bg-red-500/15 text-red-400 text-[12.5px] font-semibold hover:bg-red-500/25 transition-colors flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />Despesa
          </button>
        </div>
      </div>

      {/* Período */}
      <div className="flex items-center gap-1.5 -mt-3">
        {PERIODOS.map((p) => (
          <button key={p.key} onClick={() => setPeriodo(p.key)}
            className={cn(
              'h-7 px-3 rounded-lg text-[11.5px] font-medium transition-colors',
              periodo === p.key
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground/40 hover:text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
            )}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Recorrência — o número que define uma empresa de software */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="MRR ativo" value={brl(stats.mrr)} sub={`ARR ${brl(stats.mrr * 12)}`} accent="text-primary" />
        <Kpi label="Receita no período" value={brl(stats.receitas)} sub={`${brl(stats.recebido)} já recebido`} accent="text-emerald-500" />
        <Kpi label="Despesa no período" value={brl(stats.despesas)} sub={`${brl(stats.pago)} já pago`} accent="text-red-400" />
        <Kpi
          label="Resultado"
          value={brl(stats.resultado)}
          sub={stats.receitas > 0 ? `margem ${Math.round((stats.resultado / stats.receitas) * 100)}%` : 'sem receita no período'}
          accent={stats.resultado >= 0 ? 'text-emerald-500' : 'text-red-400'}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi label="Caixa do período" value={brl(stats.caixa)} sub="entrou menos saiu"
          accent={stats.caixa >= 0 ? 'text-foreground' : 'text-red-400'} />
        <Kpi label="A receber" value={brl(stats.aReceber)} sub="cobranças em aberto" />
        <Kpi label="Inadimplência" value={brl(stats.inadimplencia)} sub="vencidas e não pagas"
          accent={stats.inadimplencia > 0 ? 'text-red-400' : 'text-foreground/40'} />
      </div>

      {/* Receita × despesa por competência */}
      <div>
        <SectionHeader
          title="Receita e despesa por mês"
          right={<span className="text-[11px] text-foreground/35">competência · 12 meses</span>}
        />
        <Panel className="p-4">
          <div className="flex items-end gap-2 h-44">
            {serie.map((s) => (
              <div key={s.mes} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div className="w-full flex items-end justify-center gap-0.5 flex-1">
                  <div
                    className="w-1/2 rounded-t bg-emerald-500/70 hover:bg-emerald-500 transition-colors min-h-[2px]"
                    style={{ height: `${(s.receita / maxSerie) * 100}%` }}
                    title={`Receita ${brlFull(s.receita)}`}
                  />
                  <div
                    className="w-1/2 rounded-t bg-red-500/60 hover:bg-red-500/90 transition-colors min-h-[2px]"
                    style={{ height: `${(s.despesa / maxSerie) * 100}%` }}
                    title={`Despesa ${brlFull(s.despesa)}`}
                  />
                </div>
                <span className="text-[9.5px] text-foreground/35 capitalize">{mesLabel(s.mes)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.06]">
            <span className="flex items-center gap-1.5 text-[11px] text-foreground/45">
              <span className="h-2 w-2 rounded-full bg-emerald-500/70" />Receita
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-foreground/45">
              <span className="h-2 w-2 rounded-full bg-red-500/60" />Despesa
            </span>
          </div>
        </Panel>
      </div>

      {/* Onde entra e onde sai */}
      <div className="grid md:grid-cols-2 gap-5">
        {([
          { titulo: 'Entra', icone: <TrendingUp className="h-4 w-4 text-emerald-500" />, lista: stats.catReceita, total: stats.receitas },
          { titulo: 'Sai', icone: <TrendingDown className="h-4 w-4 text-red-400" />, lista: stats.catDespesa, total: stats.despesas },
        ]).map(({ titulo, icone, lista, total }) => (
          <div key={titulo}>
            <SectionHeader title={`${titulo} · por categoria`} right={<span className="text-[11px] text-foreground/35 tabular-nums">{brl(total)}</span>} />
            <Panel className="p-4">
              {lista.length === 0 ? (
                <p className="text-[12px] text-foreground/30 py-6 text-center">Nada lançado no período.</p>
              ) : (
                <div className="space-y-2.5">
                  {lista.map((c) => (
                    <div key={c.nome} className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.cor }} />
                      <p className="text-[12px] text-foreground/60 flex-1 truncate">{c.nome}</p>
                      <div className="w-24 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.06] overflow-hidden shrink-0">
                        <div className="h-full rounded-full" style={{ width: `${(c.total / (total || 1)) * 100}%`, background: c.cor }} />
                      </div>
                      <p className="text-[12px] font-semibold tabular-nums w-20 text-right shrink-0">{brl(c.total)}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-black/[0.06] dark:border-white/[0.06]">
                {icone}
                <span className="text-[11px] text-foreground/35">{lista.length} categoria{lista.length === 1 ? '' : 's'} no período</span>
              </div>
            </Panel>
          </div>
        ))}
      </div>

      {/* Lançamentos */}
      <div>
        <SectionHeader title="Lançamentos" right={<span className="text-[11px] text-foreground/35">{noPeriodo.length} no período</span>} />
        <Panel className="overflow-hidden">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>
          ) : noPeriodo.length === 0 ? (
            <EmptyState icon={<Wallet className="h-6 w-6" />} title="Nenhum lançamento no período"
              sub="Use os botões de receita e despesa para começar." />
          ) : (
            <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
              {noPeriodo.slice(0, 60).map((t) => (
                <div key={t.id} className="px-4 py-3 flex items-center gap-3 group">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: t.category?.color ?? '#64748b' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-foreground truncate">
                      {t.description}
                      {t.total_installments && (
                        <span className="text-foreground/35 ml-1.5 text-[11px]">
                          {t.installment_number}/{t.total_installments}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-foreground/35 truncate">
                      {t.category?.name ?? 'Sem categoria'}
                      {t.client?.company_name ? ` · ${t.client.company_name}` : ''}
                      {` · vence ${dataLabel(t.due_date)}`}
                    </p>
                  </div>
                  <span className={cn('px-2 py-0.5 rounded-md text-[10.5px] font-semibold shrink-0', STATUS_CFG[t.status].cls)}>
                    {t.status === 'pago' && t.type === 'receita' ? 'Recebido' : STATUS_CFG[t.status].label}
                  </span>
                  <p className={cn('text-[13px] font-bold tabular-nums w-24 text-right shrink-0',
                    t.type === 'receita' ? 'text-emerald-500' : 'text-red-400')}>
                    {t.type === 'receita' ? '+' : '−'}{brl(Number(t.amount))}
                  </p>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {t.status !== 'pago' && (
                      <button onClick={() => marcarPago(t)} title="Marcar como pago"
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => excluir(t)} title="Excluir"
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* DRE por competência */}
      <div>
        <SectionHeader title="DRE — resultado por competência" right={<span className="text-[11px] text-foreground/35">últimos 12 meses</span>} />
        <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {[...serie].reverse().map((s) => (
            <div key={s.mes} className="px-4 py-2.5 flex items-center gap-3 text-[12px]">
              <p className="text-foreground/60 capitalize w-20 shrink-0">{mesLabel(s.mes)}</p>
              <p className="text-emerald-500 tabular-nums w-24">{s.receita ? brl(s.receita) : '—'}</p>
              <p className="text-red-400 tabular-nums w-24">{s.despesa ? `−${brl(s.despesa)}` : '—'}</p>
              <div className="flex-1 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.06] overflow-hidden">
                <div className={cn('h-full rounded-full', s.resultado >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60')}
                  style={{ width: `${Math.min(100, (Math.abs(s.resultado) / maxSerie) * 100)}%` }} />
              </div>
              <p className={cn('font-bold tabular-nums w-24 text-right shrink-0',
                s.resultado > 0 ? 'text-emerald-500' : s.resultado < 0 ? 'text-red-400' : 'text-foreground/30')}>
                {s.resultado ? brl(s.resultado) : '—'}
              </p>
            </div>
          ))}
        </Panel>
      </div>

      {stats.inadimplencia > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-foreground/60 leading-relaxed">
            <span className="font-semibold text-red-400">{brlFull(stats.inadimplencia)}</span> em cobranças
            vencidas e não pagas. Elas contam no MRR contratado, mas não entraram no caixa — vale conferir
            em Pagamentos antes de considerar a receita realizada.
          </p>
        </div>
      )}

      {dialogo && <LancamentoDialog open onClose={() => setDialogo(null)} tipo={dialogo} />}
    </div>
  );
}
