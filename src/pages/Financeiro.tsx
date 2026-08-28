import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Loader2, Trash2, Check, ChevronRight, AlertTriangle, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useClients, usePayments, useFinCategories, useFinTransactions,
  useCreateFinTransaction, useUpdateFinTransaction, useDeleteFinTransaction,
  brl, brlFull, type FinTransaction, type FinStatus,
} from '@/hooks/useAdmin';
import { SectionHeader, Panel } from '@/components/admin/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/* ══════════════════════════════════════════════════════════════════
   Uma pergunta: sobra ou falta dinheiro?

   Um regime só na superfície — CAIXA, pela data em que o dinheiro
   andou. Competência (DRE, categorias) vive atrás de "Detalhar".
   A versão anterior punha "Resultado" (competência) colado em "Caixa
   do período" (caixa), mesmo tamanho, sem nada dizendo em qual acreditar.

   Vermelho aqui significa ATRASO, nunca "isto é uma despesa" — com
   receita zerada, toda linha ficaria vermelha e o vermelho pararia de
   significar coisa alguma.
   ══════════════════════════════════════════════════════════════════ */

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const hoje = () => new Date().toISOString().slice(0, 10);
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const dias = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000);

const mesLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
};
const mesExtenso = (m: string) => {
  const [y, mo] = m.split('-');
  const s = new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const dataCurta = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

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

/** A data que importa para cada lançamento: se o dinheiro andou, foi
 *  quando andou; se não andou, é quando deveria. Uma regra só — assim a
 *  lista reconcilia exatamente com a faixa de quatro. */
const dataDoEvento = (t: FinTransaction) => t.payment_date ?? t.due_date;

/** Atraso é derivado, nunca um campo que alguém troca à mão. */
const atrasado = (t: FinTransaction) =>
  t.status === 'pendente' && t.due_date < hoje();

/* ── Diálogo de lançamento ──────────────────────────────────────── */
function LancamentoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: categorias = [] } = useFinCategories();
  const { data: clients = [] } = useClients();
  const criar = useCreateFinTransaction();

  const vazio = {
    tipo: 'despesa' as 'receita' | 'despesa',
    description: '', amount: '', category_id: '', client_id: '',
    due_date: hoje(), competence_date: hoje(), pago: false,
    recurrence: 'unica' as FinTransaction['recurrence'], parcelas: '2', notes: '',
  };
  const [form, setForm] = useState(vazio);
  const [salvando, setSalvando] = useState(false);

  const doTipo = categorias.filter((c) => c.type === form.tipo);

  const salvar = async () => {
    const valor = Number(form.amount.replace(/\./g, '').replace(',', '.'));
    if (!form.description.trim()) { toast.error('Descreva o lançamento'); return; }
    if (!valor || valor <= 0) { toast.error('Informe um valor'); return; }

    setSalvando(true);
    try {
      const repeticoes =
        form.recurrence === 'unica' ? 1
        : form.recurrence === 'parcelada' ? Math.max(2, Number(form.parcelas) || 2)
        : 12;
      const passo = form.recurrence === 'trimestral' ? 3 : form.recurrence === 'anual' ? 12 : 1;
      const grupo = repeticoes > 1 ? crypto.randomUUID() : null;
      const valorParcela = form.recurrence === 'parcelada' ? valor / repeticoes : valor;

      const rows = Array.from({ length: repeticoes }, (_, i) => {
        const venc = new Date(form.due_date + 'T12:00:00');
        venc.setMonth(venc.getMonth() + i * passo);
        const comp = new Date(form.competence_date + 'T12:00:00');
        comp.setMonth(comp.getMonth() + i * passo);
        const pago = i === 0 && form.pago;
        return {
          type: form.tipo,
          status: (pago ? 'pago' : 'pendente') as FinStatus,
          category_id: form.category_id || null,
          client_id: form.client_id || null,
          description: form.description.trim(),
          notes: form.notes.trim() || null,
          amount: Number(valorParcela.toFixed(2)),
          due_date: venc.toISOString().slice(0, 10),
          competence_date: comp.toISOString().slice(0, 10),
          payment_date: pago ? form.due_date : null,
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
        <DialogHeader><DialogTitle className="text-[15px] font-semibold">Novo lançamento</DialogTitle></DialogHeader>

        <div className="space-y-2.5 pt-1">
          {/* Receita ou despesa é escolha do formulário, não da página. */}
          <div className="flex p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.05]">
            {(['despesa', 'receita'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setForm((f) => ({ ...f, tipo: t, category_id: '' }))}
                className={cn(
                  'flex-1 h-8 rounded-lg text-[12.5px] font-medium capitalize transition-colors',
                  form.tipo === t ? 'bg-background text-foreground shadow-sm' : 'text-foreground/40',
                )}
              >
                {t}
              </button>
            ))}
          </div>

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

          {form.tipo === 'receita' && (
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
              <p className="text-[10.5px] text-foreground/40 mb-1 px-1">Competência (mês do resultado)</p>
              <input type="date" className={inputCls} value={form.competence_date}
                onChange={(e) => setForm((f) => ({ ...f, competence_date: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <select className={inputCls} value={form.recurrence}
              onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as FinTransaction['recurrence'] }))}>
              <option value="unica">Única</option>
              <option value="mensal">Mensal (12×)</option>
              <option value="trimestral">Trimestral (12×)</option>
              <option value="anual">Anual (12×)</option>
              <option value="parcelada">Parcelada</option>
            </select>
            {form.recurrence === 'parcelada' ? (
              <input className={inputCls} placeholder="Parcelas" inputMode="numeric" value={form.parcelas}
                onChange={(e) => setForm((f) => ({ ...f, parcelas: e.target.value }))} />
            ) : (
              <label className="flex items-center gap-2 px-3 h-10 rounded-xl border border-black/[0.1] dark:border-white/[0.1] cursor-pointer">
                <input type="checkbox" checked={form.pago}
                  onChange={(e) => setForm((f) => ({ ...f, pago: e.target.checked }))}
                  className="accent-primary" />
                <span className="text-[12.5px] text-foreground/70">Já {form.tipo === 'receita' ? 'recebido' : 'pago'}</span>
              </label>
            )}
          </div>

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

/* ── Detalhar: competência, que não cabe na superfície ──────────── */
function DetalharDialog({
  open, onClose, serie, categorias,
}: {
  open: boolean;
  onClose: () => void;
  serie: { mes: string; receita: number; despesa: number; resultado: number }[];
  categorias: { receita: { nome: string; cor: string; total: number }[]; despesa: { nome: string; cor: string; total: number }[] };
}) {
  const max = Math.max(1, ...serie.map((s) => Math.abs(s.resultado)));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Resultado por competência</DialogTitle>
        </DialogHeader>

        <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05] -mx-1">
          {[...serie].reverse().map((s) => (
            <div key={s.mes} className="px-1 py-2 flex items-center gap-3 text-[12px]">
              <p className="text-foreground/50 capitalize w-14 shrink-0">{mesLabel(s.mes)}</p>
              <p className="text-foreground/60 tabular-nums w-24">{s.receita ? brl(s.receita) : '—'}</p>
              <p className="text-foreground/60 tabular-nums w-24">{s.despesa ? `−${brl(s.despesa)}` : '—'}</p>
              <div className="flex-1 h-1 rounded-full bg-black/[0.05] dark:bg-white/[0.06] overflow-hidden">
                <div className={cn('h-full rounded-full', s.resultado >= 0 ? 'bg-emerald-500/50' : 'bg-red-500/50')}
                  style={{ width: `${(Math.abs(s.resultado) / max) * 100}%` }} />
              </div>
              <p className={cn('font-semibold tabular-nums w-24 text-right shrink-0',
                s.resultado > 0 ? 'text-emerald-500' : s.resultado < 0 ? 'text-red-400' : 'text-foreground/25')}>
                {s.resultado ? brl(s.resultado) : '—'}
              </p>
            </div>
          ))}
        </div>

        {(categorias.receita.length > 0 || categorias.despesa.length > 0) && (
          <div className="grid sm:grid-cols-2 gap-5 pt-3">
            {([['Entra', categorias.receita], ['Sai', categorias.despesa]] as const).map(([titulo, lista]) => {
              const total = lista.reduce((s, c) => s + c.total, 0);
              return (
                <div key={titulo}>
                  <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30 mb-2">{titulo}</p>
                  <div className="space-y-2">
                    {lista.length === 0
                      ? <p className="text-[12px] text-foreground/25">—</p>
                      : lista.map((c) => (
                        <div key={c.nome} className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c.cor }} />
                          <p className="text-[12px] text-foreground/60 flex-1 truncate">{c.nome}</p>
                          <p className="text-[12px] tabular-nums shrink-0">{brl(c.total)}</p>
                          <p className="text-[10.5px] text-foreground/25 tabular-nums w-9 text-right shrink-0">
                            {total ? `${Math.round((c.total / total) * 100)}%` : ''}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ══ Página ═══════════════════════════════════════════════════════ */
type Chip = 'tudo' | 'receber' | 'pagar' | 'atrasados';

export default function Financeiro() {
  const navigate = useNavigate();
  const { data: payments = [] } = usePayments();
  const { data: transacoes = [], isLoading } = useFinTransactions();
  const atualizar = useUpdateFinTransaction();
  const remover = useDeleteFinTransaction();

  const meses = useMemo(() => ultimosMeses(12), []);
  const [mes, setMes] = useState(meses[meses.length - 1]);
  const [chip, setChip] = useState<Chip>('tudo');
  const [lancar, setLancar] = useState(false);
  const [detalhar, setDetalhar] = useState(false);

  const vivas = useMemo(() => transacoes.filter((t) => t.status !== 'cancelado'), [transacoes]);

  /* ── O mês selecionado, por data de evento ───────────────────── */
  const doMes = useMemo(
    () => vivas.filter((t) => dataDoEvento(t).slice(0, 7) === mes),
    [vivas, mes],
  );

  const caixa = useMemo(() => {
    const somar = (l: FinTransaction[]) => l.reduce((s, t) => s + Number(t.amount), 0);
    const entrou = somar(doMes.filter((t) => t.type === 'receita' && t.status === 'pago'));
    const saiu = somar(doMes.filter((t) => t.type === 'despesa' && t.status === 'pago'));
    return {
      entrou, saiu, saldo: entrou - saiu,
      aReceber: somar(doMes.filter((t) => t.type === 'receita' && t.status !== 'pago')),
      aPagar: somar(doMes.filter((t) => t.type === 'despesa' && t.status !== 'pago')),
      temBase: doMes.length > 0,
    };
  }, [doMes]);

  /* ── Curva: o mesmo número no tempo ──────────────────────────── */
  const serieCaixa = useMemo(() => meses.map((m) => {
    const doM = vivas.filter((t) => dataDoEvento(t).slice(0, 7) === m && t.status === 'pago');
    const e = doM.filter((t) => t.type === 'receita').reduce((s, t) => s + Number(t.amount), 0);
    const s = doM.filter((t) => t.type === 'despesa').reduce((s2, t) => s2 + Number(t.amount), 0);
    return { mes: m, saldo: e - s };
  }), [vivas, meses]);

  const maxSaldo = Math.max(1, ...serieCaixa.map((s) => Math.abs(s.saldo)));

  /* ── Competência: só atrás de Detalhar ───────────────────────── */
  const serieCompetencia = useMemo(() => meses.map((m) => {
    const doM = vivas.filter((t) => t.competence_date.slice(0, 7) === m);
    const r = doM.filter((t) => t.type === 'receita').reduce((s, t) => s + Number(t.amount), 0);
    const d = doM.filter((t) => t.type === 'despesa').reduce((s, t) => s + Number(t.amount), 0);
    return { mes: m, receita: r, despesa: d, resultado: r - d };
  }), [vivas, meses]);

  const categorias = useMemo(() => {
    const agrupar = (tipo: 'receita' | 'despesa') => {
      const mapa = new Map<string, { nome: string; cor: string; total: number }>();
      vivas.filter((t) => t.type === tipo && t.competence_date.slice(0, 7) === mes).forEach((t) => {
        const nome = t.category?.name ?? 'Sem categoria';
        const a = mapa.get(nome) ?? { nome, cor: t.category?.color ?? '#64748b', total: 0 };
        a.total += Number(t.amount);
        mapa.set(nome, a);
      });
      return [...mapa.values()].sort((a, b) => b.total - a.total);
    };
    return { receita: agrupar('receita'), despesa: agrupar('despesa') };
  }, [vivas, mes]);

  /* ── A linha de ação: um slot só, nunca dois ─────────────────── */
  const acao = useMemo(() => {
    const h = hoje();
    const vencidas = [
      ...vivas.filter(atrasado).map((t) => ({ valor: Number(t.amount), data: t.due_date, cobranca: false })),
      ...payments
        .filter((p) => p.status !== 'pago' && p.status !== 'cancelado' && p.due_date < h)
        .map((p) => ({ valor: Number(p.amount), data: p.due_date, cobranca: true })),
    ];
    if (vencidas.length > 0) {
      const maisVelha = vencidas.reduce((a, b) => (a.data < b.data ? a : b));
      return {
        tom: 'critico' as const,
        total: vencidas.reduce((s, v) => s + v.valor, 0),
        n: vencidas.length,
        detalhe: `o mais velho há ${dias(maisVelha.data, h)} dias`,
        temCobranca: vencidas.some((v) => v.cobranca),
      };
    }

    const limite = emDias(7);
    const proximas = [
      ...vivas.filter((t) => t.status === 'pendente' && t.due_date >= h && t.due_date <= limite)
        .map((t) => ({ valor: Number(t.amount), cobranca: false })),
      ...payments.filter((p) => p.status !== 'pago' && p.status !== 'cancelado' && p.due_date >= h && p.due_date <= limite)
        .map((p) => ({ valor: Number(p.amount), cobranca: true })),
    ];
    if (proximas.length > 0) {
      return {
        tom: 'atencao' as const,
        total: proximas.reduce((s, v) => s + v.valor, 0),
        n: proximas.length,
        detalhe: 'nos próximos 7 dias',
        temCobranca: proximas.some((v) => v.cobranca),
      };
    }
    return null;
  }, [vivas, payments]);

  /* ── Lista ───────────────────────────────────────────────────── */
  const lista = useMemo(() => {
    const f = doMes.filter((t) => {
      if (chip === 'receber') return t.type === 'receita' && t.status !== 'pago';
      if (chip === 'pagar') return t.type === 'despesa' && t.status !== 'pago';
      if (chip === 'atrasados') return atrasado(t);
      return true;
    });
    return f.sort((a, b) => dataDoEvento(b).localeCompare(dataDoEvento(a)));
  }, [doMes, chip]);

  const marcarPago = async (t: FinTransaction) => {
    await atualizar.mutateAsync({ id: t.id, status: 'pago', payment_date: hoje() });
    toast.success(t.type === 'receita' ? 'Recebimento confirmado' : 'Pagamento confirmado');
  };

  const excluir = async (t: FinTransaction) => {
    if (!confirm(`Excluir "${t.description}"?`)) return;
    await remover.mutateAsync(t.id);
    toast.success('Lançamento excluído');
  };

  const CHIPS: { key: Chip; label: string }[] = [
    { key: 'tudo', label: 'Tudo' },
    { key: 'receber', label: 'A receber' },
    { key: 'pagar', label: 'A pagar' },
    { key: 'atrasados', label: 'Atrasados' },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-5xl">

      {/* ── Escopo e a única ação da página ─────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-foreground/50">{mesExtenso(mes)}</p>
        <button
          onClick={() => setLancar(true)}
          className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />Lançar
        </button>
      </div>

      {/* ══ O OBJETO ═══════════════════════════════════════════ */}
      <Panel className="overflow-hidden">
        <div className="p-5 sm:p-6 pb-4">
          <p className={cn(
            'text-[32px] sm:text-[44px] font-bold tracking-tight tabular-nums leading-none',
            !caixa.temBase || caixa.saldo === 0 ? 'text-foreground/30'
              : caixa.saldo > 0 ? 'text-emerald-500' : 'text-red-400',
          )}>
            {brl(caixa.saldo)}
            <span className="text-[15px] font-light text-foreground/40 ml-2.5 tracking-normal">
              {!caixa.temBase || caixa.saldo === 0 ? 'sem movimento' : caixa.saldo > 0 ? 'sobrou' : 'faltou'}
            </span>
          </p>

          {/* A curva é o mesmo número no tempo — e é o controle de mês. */}
          <div className="mt-6 flex items-end gap-1 h-[76px]">
            {serieCaixa.map((s) => {
              const alt = Math.abs(s.saldo) / maxSaldo;
              const positivo = s.saldo >= 0;
              return (
                <button
                  key={s.mes}
                  onClick={() => setMes(s.mes)}
                  title={`${mesExtenso(s.mes)} · ${brlFull(s.saldo)}`}
                  className="flex-1 h-full flex flex-col justify-center group"
                >
                  <div className="flex-1 flex flex-col justify-end">
                    {positivo && s.saldo !== 0 && (
                      <span className="w-full rounded-t-sm bg-emerald-500/60 group-hover:bg-emerald-500 transition-colors"
                        style={{ height: `${alt * 100}%` }} />
                    )}
                  </div>
                  <span className={cn(
                    'h-px w-full shrink-0 transition-colors',
                    s.mes === mes ? 'bg-foreground/40' : 'bg-black/[0.10] dark:bg-white/[0.12]',
                  )} />
                  <div className="flex-1">
                    {!positivo && (
                      <span className="block w-full rounded-b-sm bg-red-500/50 group-hover:bg-red-500/80 transition-colors"
                        style={{ height: `${alt * 100}%` }} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-1 mt-1.5">
            {serieCaixa.map((s) => (
              <span key={s.mes} className={cn(
                'flex-1 text-center text-[9.5px] capitalize transition-colors',
                s.mes === mes ? 'text-foreground/60 font-medium' : 'text-foreground/25',
              )}>
                {mesLabel(s.mes)}
              </span>
            ))}
          </div>
        </div>

        {/* A faixa de quatro — e cada célula filtra a lista. */}
        <div className="grid grid-cols-4 border-t border-black/[0.06] dark:border-white/[0.06] divide-x divide-black/[0.06] dark:divide-white/[0.06]">
          {([
            { label: 'Entrou', v: caixa.entrou, chip: 'tudo' as Chip },
            { label: 'Saiu', v: caixa.saiu, chip: 'tudo' as Chip },
            { label: 'A receber', v: caixa.aReceber, chip: 'receber' as Chip },
            { label: 'A pagar', v: caixa.aPagar, chip: 'pagar' as Chip },
          ]).map(({ label, v, chip: c }) => (
            <button key={label} onClick={() => setChip(c)}
              className="px-3 py-3 text-center hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors">
              <p className={cn('text-[17px] font-bold tabular-nums leading-none',
                v > 0 ? 'text-foreground' : 'text-foreground/25')}>
                {v > 0 ? brl(v) : '—'}
              </p>
              <p className="text-[10px] text-foreground/35 mt-1.5">{label}</p>
            </button>
          ))}
        </div>
      </Panel>

      {/* ── A linha de ação: só quando há o que fazer ───────────── */}
      {acao && (
        <button
          onClick={() => (acao.temCobranca ? navigate('/pagamentos') : setChip('atrasados'))}
          className={cn(
            'h-11 px-4 rounded-xl flex items-center gap-3 text-left transition-colors',
            acao.tom === 'critico'
              ? 'bg-red-500/[0.08] hover:bg-red-500/[0.13] border border-red-500/20'
              : 'bg-amber-500/[0.07] hover:bg-amber-500/[0.12] border border-amber-500/20',
          )}
        >
          {acao.tom === 'critico'
            ? <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            : <Clock className="h-4 w-4 text-amber-500 shrink-0" />}
          <p className="text-[13px] flex-1">
            <span className={cn('font-semibold', acao.tom === 'critico' ? 'text-red-400' : 'text-amber-500')}>
              {brlFull(acao.total)}
            </span>
            <span className="text-foreground/55">
              {acao.tom === 'critico' ? ' vencidos' : ' a vencer'} · {acao.n} lançamento{acao.n > 1 ? 's' : ''}, {acao.detalhe}
            </span>
          </p>
          <ChevronRight className="h-4 w-4 text-foreground/25 shrink-0" />
        </button>
      )}

      {/* ── Lançamentos ─────────────────────────────────────────── */}
      <div>
        <SectionHeader
          title="Lançamentos"
          right={
            <div className="flex items-center gap-1">
              {CHIPS.map((c) => (
                <button key={c.key} onClick={() => setChip(c.key)}
                  className={cn('h-6 px-2 rounded-md text-[11px] font-medium transition-colors',
                    chip === c.key ? 'bg-foreground/10 text-foreground/80' : 'text-foreground/35 hover:text-foreground/60')}>
                  {c.label}
                </button>
              ))}
              <button onClick={() => setDetalhar(true)}
                className="h-6 px-2 rounded-md text-[11px] font-medium text-foreground/35 hover:text-foreground/70 transition-colors flex items-center gap-0.5">
                Detalhar<ChevronRight className="h-3 w-3" />
              </button>
            </div>
          }
        />
        <Panel className="overflow-hidden">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-foreground/30" /></div>
          ) : lista.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-3">
              <p className="text-[13px] text-foreground/40">
                {chip === 'tudo' ? 'Nada lançado ainda' : 'Nada aqui neste mês'}
              </p>
              {chip === 'tudo' && (
                <button onClick={() => setLancar(true)}
                  className="h-8 px-3.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-all">
                  Lançar
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
              {lista.map((t) => {
                const venceLogo = t.status === 'pendente' && !atrasado(t) && t.due_date <= emDias(7);
                return (
                  <div key={t.id} className="h-12 pr-3 flex items-center gap-3">
                    {/* Cor na linha pertence ao ESTADO. Despesa não é vermelha. */}
                    <span className={cn('w-[3px] h-full shrink-0',
                      atrasado(t) ? 'bg-red-500' : venceLogo ? 'bg-amber-500' : 'bg-transparent')} />
                    {/* ● o dinheiro andou · ○ ainda não */}
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0',
                      t.status === 'pago' ? 'bg-foreground/50' : 'border border-foreground/30')} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-foreground/85 truncate leading-tight">
                        {t.description}
                        {t.total_installments && (
                          <span className="text-foreground/30 ml-1.5 text-[11px]">
                            {t.installment_number}/{t.total_installments}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-foreground/35 truncate leading-tight mt-0.5">
                        {[t.category?.name, t.client?.company_name, dataCurta(dataDoEvento(t))]
                          .filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <p className={cn('text-[13px] font-semibold tabular-nums shrink-0',
                      t.type === 'receita' ? 'text-foreground/85' : 'text-foreground/55')}>
                      {t.type === 'receita' ? '+' : '−'}{brl(Number(t.amount))}
                    </p>
                    {/* Ação sempre visível: atrás de hover ela não existe no celular. */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {t.status !== 'pago' && (
                        <button onClick={() => marcarPago(t)} title="Marcar como pago"
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground/25 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => excluir(t)} title="Excluir"
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground/25 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {lancar && <LancamentoDialog open onClose={() => setLancar(false)} />}
      {detalhar && (
        <DetalharDialog open onClose={() => setDetalhar(false)}
          serie={serieCompetencia} categorias={categorias} />
      )}
    </div>
  );
}
