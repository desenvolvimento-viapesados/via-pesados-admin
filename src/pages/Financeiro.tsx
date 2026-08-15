import { useState } from 'react';
import { Plus, TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle2, X, AlertCircle, Pencil, Trash2, RefreshCw, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fmt, fmtDate, cn } from '@/lib/utils';

interface Lancamento {
  id: string;
  tipo: 'receita' | 'despesa';
  categoria: string;
  descricao: string;
  valor: number;
  vencimento: string;
  status: 'pago' | 'recebido' | 'pendente' | 'vencido' | 'cancelado';
  cliente?: string;
  recorrente: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pago:      { label: 'Pago',      color: 'bg-green-500/15 text-green-600 dark:text-green-400',   icon: <CheckCircle2 className="h-3 w-3" /> },
  recebido:  { label: 'Recebido', color: 'bg-green-500/15 text-green-600 dark:text-green-400',   icon: <CheckCircle2 className="h-3 w-3" /> },
  pendente:  { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400', icon: <Clock className="h-3 w-3" /> },
  vencido:   { label: 'Vencido',  color: 'bg-red-500/15 text-red-500',                           icon: <AlertCircle className="h-3 w-3" /> },
  cancelado: { label: 'Cancelado',color: 'bg-muted text-muted-foreground',                       icon: <X className="h-3 w-3" /> },
};

const CATS_RECEITA = ['Assinatura Mensal', 'Setup / Onboarding', 'Consultoria', 'Expansão de Plano', 'Multa de Cancelamento', 'Outros'];
const CATS_DESPESA = ['Infraestrutura', 'Salários e RH', 'Marketing', 'Ferramentas e SaaS', 'Contabilidade', 'Impostos e Taxas', 'Jurídico', 'Outros'];

const LANCAMENTOS_INIT: Lancamento[] = [
  { id: 'f1',  tipo: 'receita', categoria: 'Assinatura Mensal',  descricao: 'iTruck Pesados — Pro',       valor: 3200, vencimento: '2026-09-01', status: 'recebido', cliente: 'iTruck Pesados',       recorrente: true  },
  { id: 'f2',  tipo: 'receita', categoria: 'Assinatura Mensal',  descricao: 'Trans Horizonte — Basic',    valor: 890,  vencimento: '2026-09-05', status: 'pendente', cliente: 'Trans Horizonte',      recorrente: true  },
  { id: 'f3',  tipo: 'receita', categoria: 'Assinatura Mensal',  descricao: 'Caminhões do Vale — Pro',    valor: 3200, vencimento: '2026-09-10', status: 'pendente', cliente: 'Caminhões do Vale',     recorrente: true  },
  { id: 'f4',  tipo: 'receita', categoria: 'Setup / Onboarding', descricao: 'Frota Norte Sul — setup',   valor: 800,  vencimento: '2026-08-14', status: 'vencido',  cliente: 'Frota Norte Sul',       recorrente: false },
  { id: 'f5',  tipo: 'receita', categoria: 'Assinatura Mensal',  descricao: 'Pesados Goiás — Pro',        valor: 3200, vencimento: '2026-09-20', status: 'pendente', cliente: 'Pesados Goiás',         recorrente: true  },
  { id: 'f6',  tipo: 'despesa', categoria: 'Infraestrutura',     descricao: 'Supabase — plano Pro',       valor: 1200, vencimento: '2026-09-01', status: 'pago',     recorrente: true  },
  { id: 'f7',  tipo: 'despesa', categoria: 'Ferramentas e SaaS', descricao: 'Vercel Pro',                 valor: 300,  vencimento: '2026-09-01', status: 'pago',     recorrente: true  },
  { id: 'f8',  tipo: 'despesa', categoria: 'Marketing',          descricao: 'Tráfego pago — agosto',      valor: 2500, vencimento: '2026-08-25', status: 'pendente', recorrente: false },
  { id: 'f9',  tipo: 'despesa', categoria: 'Contabilidade',      descricao: 'Escritório Contábil Mensal', valor: 800,  vencimento: '2026-09-05', status: 'pendente', recorrente: true  },
  { id: 'f10', tipo: 'despesa', categoria: 'Salários e RH',      descricao: 'Folha de pagamento',         valor: 18000,vencimento: '2026-09-05', status: 'pendente', recorrente: true  },
];

export default function Financeiro() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(LANCAMENTOS_INIT);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Partial<Lancamento>>({ tipo: 'receita', status: 'pendente', recorrente: false });
  const [tab, setTab] = useState('todos');

  const receitas = lancamentos.filter(l => l.tipo === 'receita');
  const despesas = lancamentos.filter(l => l.tipo === 'despesa');
  const totalReceitas = receitas.filter(l => ['recebido', 'pago'].includes(l.status)).reduce((s, l) => s + l.valor, 0);
  const totalDespesas = despesas.filter(l => ['pago', 'recebido'].includes(l.status)).reduce((s, l) => s + l.valor, 0);
  const totalPendente = lancamentos.filter(l => l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
  const saldo = totalReceitas - totalDespesas;

  const filtered = tab === 'todos' ? lancamentos : lancamentos.filter(l => l.tipo === tab);

  function handleAdd() {
    if (!form.descricao || !form.valor) return;
    const novo: Lancamento = {
      id: `f${Date.now()}`,
      tipo: form.tipo ?? 'receita',
      categoria: form.categoria ?? 'Outros',
      descricao: form.descricao ?? '',
      valor: form.valor ?? 0,
      vencimento: form.vencimento ?? new Date().toISOString().split('T')[0],
      status: form.status ?? 'pendente',
      cliente: form.cliente,
      recorrente: form.recorrente ?? false,
    };
    setLancamentos(prev => [novo, ...prev]);
    setForm({ tipo: 'receita', status: 'pendente', recorrente: false });
    setAddOpen(false);
  }

  function markPaid(id: string) {
    setLancamentos(prev => prev.map(l => l.id === id ? { ...l, status: l.tipo === 'receita' ? 'recebido' : 'pago' } : l));
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Financeiro</h1>
          <p className="text-[13px] text-foreground/50 mt-0.5">Fluxo de caixa da Via Pesados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="h-4 w-4" />Exportar</Button>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Novo lançamento</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Receitas (recebido)',  value: fmt(totalReceitas), icon: TrendingUp,    color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Despesas (pagas)',     value: fmt(totalDespesas), icon: TrendingDown,  color: 'text-red-500',     bg: 'bg-red-500/10' },
          { label: 'Saldo',               value: fmt(saldo),         icon: DollarSign,    color: saldo >= 0 ? 'text-emerald-500' : 'text-red-500', bg: saldo >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10' },
          { label: 'Pendentes',           value: fmt(totalPendente), icon: Clock,         color: 'text-yellow-500',  bg: 'bg-yellow-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-black/[0.07] dark:border-white/[0.07]">
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">{label}</p>
                <p className="text-xl font-bold text-foreground mt-1.5">{value}</p>
              </div>
              <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', bg)}>
                <Icon className={cn('h-4.5 w-4.5', color)} style={{ height: 18, width: 18 }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs + table */}
      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-[13px]">Lançamentos</CardTitle>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="receita">Receitas</TabsTrigger>
                <TabsTrigger value="despesa">Despesas</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.05]">
            {filtered.map(l => (
              <div key={l.id} className="flex items-center gap-4 py-3">
                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', l.tipo === 'receita' ? 'bg-emerald-500/10' : 'bg-red-500/10')}>
                  {l.tipo === 'receita'
                    ? <TrendingUp className="h-4 w-4 text-emerald-500" />
                    : <TrendingDown className="h-4 w-4 text-red-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-foreground truncate">{l.descricao}</p>
                    {l.recorrente && <span className="text-[9px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0"><RefreshCw className="inline h-2.5 w-2.5 mr-0.5" />recorrente</span>}
                  </div>
                  <p className="text-[11px] text-foreground/40">{l.categoria} · vence {fmtDate(l.vencimento)}{l.cliente ? ` · ${l.cliente}` : ''}</p>
                </div>
                <p className={cn('text-[13px] font-bold shrink-0', l.tipo === 'receita' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                  {l.tipo === 'receita' ? '+' : '-'}{fmt(l.valor)}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_CONFIG[l.status].color)}>
                    {STATUS_CONFIG[l.status].icon}
                    {STATUS_CONFIG[l.status].label}
                  </span>
                  {l.status === 'pendente' && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => markPaid(l.id)}>
                      Quitar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Tipo</Label>
              <div className="flex gap-2 mt-1">
                {(['receita', 'despesa'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setForm(p => ({ ...p, tipo: t }))}
                    className={cn(
                      'flex-1 py-2 rounded-lg border text-[13px] font-medium transition-all',
                      form.tipo === t
                        ? t === 'receita' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 border-red-500/40 text-red-500'
                        : 'border-input hover:bg-muted',
                    )}
                  >
                    {t === 'receita' ? '↑ Receita' : '↓ Despesa'}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2"><Label>Descrição</Label><Input className="mt-1" value={form.descricao ?? ''} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm(p => ({ ...p, categoria: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {(form.tipo === 'receita' ? CATS_RECEITA : CATS_DESPESA).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Valor (R$)</Label><Input className="mt-1" type="number" value={form.valor ?? ''} onChange={e => setForm(p => ({ ...p, valor: Number(e.target.value) }))} /></div>
            <div><Label>Vencimento</Label><Input className="mt-1" type="date" value={form.vencimento ?? ''} onChange={e => setForm(p => ({ ...p, vencimento: e.target.value }))} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as Lancamento['status'] }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="recebido">Recebido</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.tipo === 'receita' && (
              <div className="col-span-2"><Label>Cliente (opcional)</Label><Input className="mt-1" value={form.cliente ?? ''} onChange={e => setForm(p => ({ ...p, cliente: e.target.value }))} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
