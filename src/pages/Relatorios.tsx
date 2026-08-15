import { useState } from 'react';
import { Download, TrendingUp, Users, DollarSign, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { fmt, cn } from '@/lib/utils';

const MRR_HISTORICO = [
  { mes: 'Mar', mrr: 58000, clientes: 35 },
  { mes: 'Abr', mrr: 63000, clientes: 38 },
  { mes: 'Mai', mrr: 68500, clientes: 40 },
  { mes: 'Jun', mrr: 72000, clientes: 42 },
  { mes: 'Jul', mrr: 79200, clientes: 45 },
  { mes: 'Ago', mrr: 87400, clientes: 48 },
];

const CHURN_HISTORICO = [
  { mes: 'Mar', churn: 3.1 },
  { mes: 'Abr', churn: 2.8 },
  { mes: 'Mai', churn: 2.5 },
  { mes: 'Jun', churn: 2.9 },
  { mes: 'Jul', churn: 2.5 },
  { mes: 'Ago', churn: 2.1 },
];

const PLANO_DIST = [
  { name: 'Starter', value: 8,  color: '#94a3b8' },
  { name: 'Basic',   value: 14, color: '#60a5fa' },
  { name: 'Pro',     value: 22, color: '#f97316' },
  { name: 'Enterprise',value: 4, color: '#a78bfa' },
];

const TIPO_DIST = [
  { name: 'Lojista',       value: 22, color: '#f97316' },
  { name: 'Transportador', value: 18, color: '#60a5fa' },
  { name: 'Corretor',      value: 8,  color: '#34d399' },
];

const TOP_CLIENTES = [
  { nome: 'Pesados Goiás',          mrr: 3200, crescimento: 0,   plano: 'Pro' },
  { nome: 'iTruck Pesados',         mrr: 3200, crescimento: 0,   plano: 'Pro' },
  { nome: 'Caminhões do Vale',      mrr: 3200, crescimento: 10,  plano: 'Pro' },
  { nome: 'Transportadora Rápida',  mrr: 1800, crescimento: -5,  plano: 'Pro' },
  { nome: 'Frota Norte Sul',        mrr: 1800, crescimento: 0,   plano: 'Pro' },
];

const CUSTOM_TOOLTIP = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-elevated">
      <p className="text-[11px] font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-[11px]" style={{ color: p.color }}>
          {p.name}: {p.name === 'mrr' ? fmt(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function Relatorios() {
  const [periodo, setPeriodo] = useState('6m');

  const mrrAtual = MRR_HISTORICO[MRR_HISTORICO.length - 1].mrr;
  const mrrAnterior = MRR_HISTORICO[MRR_HISTORICO.length - 2].mrr;
  const mrrGrowth = ((mrrAtual - mrrAnterior) / mrrAnterior * 100).toFixed(1);

  return (
    <div className="flex flex-col gap-6 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Relatórios</h1>
          <p className="text-[13px] text-foreground/50 mt-0.5">Métricas e performance da plataforma</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-28 h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3m">3 meses</SelectItem>
              <SelectItem value="6m">6 meses</SelectItem>
              <SelectItem value="12m">12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm"><Download className="h-4 w-4" />Exportar PDF</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'MRR Atual',      value: fmt(mrrAtual),                   delta: `+${mrrGrowth}%`,    positive: true  },
          { label: 'Clientes Ativos',value: '48',                             delta: '+3 este mês',       positive: true  },
          { label: 'Churn Rate',     value: '2.1%',                           delta: '-0.4% vs anterior', positive: true  },
          { label: 'ARPU',           value: fmt(mrrAtual / 48),               delta: '+5% vs anterior',   positive: true  },
        ].map(({ label, value, delta, positive }) => (
          <Card key={label} className="border-black/[0.07] dark:border-white/[0.07]">
            <CardContent className="p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">{label}</p>
              <p className="text-xl font-bold text-foreground mt-1.5">{value}</p>
              <div className={cn('flex items-center gap-1 mt-1', positive ? 'text-emerald-500' : 'text-red-500')}>
                {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                <span className="text-[11px] font-medium">{delta}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="crescimento">
        <TabsList>
          <TabsTrigger value="crescimento">Crescimento</TabsTrigger>
          <TabsTrigger value="distribuicao">Distribuição</TabsTrigger>
          <TabsTrigger value="clientes">Top Clientes</TabsTrigger>
        </TabsList>

        {/* Crescimento */}
        <TabsContent value="crescimento" className="flex flex-col gap-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="border-black/[0.07] dark:border-white/[0.07]">
              <CardHeader className="pb-3"><CardTitle className="text-[13px]">MRR — Evolução</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={MRR_HISTORICO} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CUSTOM_TOOLTIP />} />
                    <Bar dataKey="mrr" name="mrr" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-black/[0.07] dark:border-white/[0.07]">
              <CardHeader className="pb-3"><CardTitle className="text-[13px]">Clientes Ativos — Evolução</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={MRR_HISTORICO}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} domain={[30, 55]} />
                    <Tooltip content={<CUSTOM_TOOLTIP />} />
                    <Line dataKey="clientes" name="clientes" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-black/[0.07] dark:border-white/[0.07] lg:col-span-2">
              <CardHeader className="pb-3"><CardTitle className="text-[13px]">Churn Rate (%)</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={CHURN_HISTORICO}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} domain={[0, 5]} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<CUSTOM_TOOLTIP />} />
                    <Line dataKey="churn" name="churn" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Distribuição */}
        <TabsContent value="distribuicao" className="grid lg:grid-cols-2 gap-4">
          <Card className="border-black/[0.07] dark:border-white/[0.07]">
            <CardHeader className="pb-3"><CardTitle className="text-[13px]">Distribuição por Plano</CardTitle></CardHeader>
            <CardContent className="pt-0 flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={PLANO_DIST} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} strokeWidth={0}>
                    {PLANO_DIST.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {PLANO_DIST.map(p => (
                  <div key={p.name} className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="text-[12px] text-foreground">{p.name}</span>
                    <span className="text-[12px] font-bold text-foreground ml-auto">{p.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-black/[0.07] dark:border-white/[0.07]">
            <CardHeader className="pb-3"><CardTitle className="text-[13px]">Distribuição por Tipo</CardTitle></CardHeader>
            <CardContent className="pt-0 flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={TIPO_DIST} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} strokeWidth={0}>
                    {TIPO_DIST.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {TIPO_DIST.map(p => (
                  <div key={p.name} className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="text-[12px] text-foreground">{p.name}</span>
                    <span className="text-[12px] font-bold text-foreground ml-auto">{p.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top clientes */}
        <TabsContent value="clientes">
          <Card className="border-black/[0.07] dark:border-white/[0.07]">
            <CardHeader className="pb-3"><CardTitle className="text-[13px]">Top Clientes por MRR</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                {TOP_CLIENTES.map((c, i) => (
                  <div key={c.nome} className="flex items-center gap-4 py-3">
                    <span className="text-[13px] font-bold text-foreground/20 w-5 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground">{c.nome}</p>
                      <p className="text-[11px] text-foreground/40">Plano {c.plano}</p>
                    </div>
                    <p className="text-[13px] font-bold text-foreground">{fmt(c.mrr)}</p>
                    <div className={cn('flex items-center gap-1 text-[11px] font-medium', c.crescimento > 0 ? 'text-emerald-500' : c.crescimento < 0 ? 'text-red-500' : 'text-foreground/40')}>
                      {c.crescimento !== 0 && (c.crescimento > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />)}
                      {c.crescimento !== 0 ? `${c.crescimento > 0 ? '+' : ''}${c.crescimento}%` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
