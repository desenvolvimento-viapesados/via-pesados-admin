import { useState } from 'react';
import { CheckCircle2, Clock, AlertCircle, RefreshCw, Plus, Send, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { fmt, fmtDate, cn } from '@/lib/utils';
import { CLIENTES_MOCK } from './Clientes';

const COBRANCAS = CLIENTES_MOCK.map((c, i) => ({
  id: `cob-${c.id}`,
  cliente: c.nome,
  tipo: c.tipo,
  plano: c.plano,
  valor: c.mrr,
  vencimento: c.vencimento,
  status: c.inadimplente ? 'vencido' : i % 4 === 0 ? 'pago' : i % 3 === 0 ? 'pendente' : 'pago',
  metodo: i % 2 === 0 ? 'Pix' : 'Boleto',
  diasAtraso: c.inadimplente ? Math.floor(Math.random() * 30) + 5 : 0,
}));

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pago:     { label: 'Pago',     color: 'bg-green-500/15 text-green-600 dark:text-green-400',   icon: <CheckCircle2 className="h-3 w-3" /> },
  pendente: { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400', icon: <Clock className="h-3 w-3" /> },
  vencido:  { label: 'Vencido',  color: 'bg-red-500/15 text-red-500',                           icon: <AlertCircle className="h-3 w-3" /> },
};

export default function Pagamentos() {
  const [statusFilter, setStatusFilter] = useState('todos');

  const filtered = statusFilter === 'todos' ? COBRANCAS : COBRANCAS.filter(c => c.status === statusFilter);

  const totalMRR = COBRANCAS.reduce((s, c) => s + c.valor, 0);
  const totalPago = COBRANCAS.filter(c => c.status === 'pago').reduce((s, c) => s + c.valor, 0);
  const totalPendente = COBRANCAS.filter(c => c.status === 'pendente').reduce((s, c) => s + c.valor, 0);
  const totalVencido = COBRANCAS.filter(c => c.status === 'vencido').reduce((s, c) => s + c.valor, 0);
  const qtdVencido = COBRANCAS.filter(c => c.status === 'vencido').length;
  const taxaRecebimento = Math.round((totalPago / totalMRR) * 100);

  return (
    <div className="flex flex-col gap-6 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pagamentos</h1>
          <p className="text-[13px] text-foreground/50 mt-0.5">Gerenciamento de cobranças e adimplência</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Send className="h-4 w-4" />Cobrar inadimplentes</Button>
          <Button size="sm" variant="outline"><Download className="h-4 w-4" />Exportar</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'MRR Total',      value: fmt(totalMRR),      sub: `${COBRANCAS.length} clientes`,    color: 'text-foreground' },
          { label: 'Recebido',       value: fmt(totalPago),     sub: `taxa ${taxaRecebimento}%`,        color: 'text-emerald-500' },
          { label: 'A Receber',      value: fmt(totalPendente), sub: `${COBRANCAS.filter(c => c.status === 'pendente').length} cobranças`, color: 'text-yellow-500' },
          { label: 'Inadimplente',   value: fmt(totalVencido),  sub: `${qtdVencido} cliente${qtdVencido !== 1 ? 's' : ''}`, color: 'text-red-500' },
        ].map(({ label, value, sub, color }) => (
          <Card key={label} className="border-black/[0.07] dark:border-white/[0.07]">
            <CardContent className="p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">{label}</p>
              <p className={cn('text-xl font-bold mt-1.5', color)}>{value}</p>
              <p className="text-[11px] text-foreground/40 mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Taxa de recebimento */}
      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-medium text-foreground">Taxa de Recebimento — agosto 2026</p>
            <p className="text-[13px] font-bold text-foreground">{taxaRecebimento}%</p>
          </div>
          <Progress value={taxaRecebimento} className="h-2.5" />
          <div className="flex justify-between mt-2">
            <span className="text-[11px] text-foreground/40">0%</span>
            <span className="text-[11px] text-foreground/40">Meta: 95%</span>
            <span className="text-[11px] text-foreground/40">100%</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[13px]">Cobranças do mês</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.05]">
            {filtered.map(c => (
              <div key={c.id} className="flex items-center gap-4 py-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-[11px] font-bold shrink-0">
                  {c.cliente.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{c.cliente}</p>
                  <p className="text-[11px] text-foreground/40">{c.plano} · {c.metodo} · vence {c.vencimento}</p>
                </div>
                {c.diasAtraso > 0 && (
                  <span className="text-[11px] font-semibold text-red-500 shrink-0">{c.diasAtraso}d atraso</span>
                )}
                <p className="text-[13px] font-bold text-foreground shrink-0">{fmt(c.valor)}</p>
                <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', STATUS_CONFIG[c.status].color)}>
                  {STATUS_CONFIG[c.status].icon}
                  {STATUS_CONFIG[c.status].label}
                </span>
                {c.status !== 'pago' && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] shrink-0">
                    <Send className="h-3 w-3" />Cobrar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
