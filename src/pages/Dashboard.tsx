import { useNavigate } from 'react-router-dom';
import {
  Users, DollarSign, TrendingUp, AlertCircle,
  Kanban, BarChart3, CreditCard, Building2, UserCheck,
  Clock, CheckCircle2, ArrowUpRight, Truck, Wrench,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fmt } from '@/lib/utils';
import { cn } from '@/lib/utils';

const STATS = [
  { label: 'Clientes Ativos',    value: '48',         sub: '+3 este mês',      icon: Users,      color: 'text-blue-500',    bg: 'bg-blue-500/10' },
  { label: 'MRR',                value: fmt(87400),   sub: '+12% vs mês ant.', icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { label: 'Ticket Abertos',     value: '7',          sub: '2 urgentes',       icon: AlertCircle,color: 'text-orange-500',  bg: 'bg-orange-500/10' },
  { label: 'Churn Rate',         value: '2.1%',       sub: '-0.4% vs mês ant.',icon: TrendingUp, color: 'text-violet-500',  bg: 'bg-violet-500/10' },
];

const TIPO_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  lojista:      { label: 'Lojista',      variant: 'default' },
  transportador:{ label: 'Transportador',variant: 'secondary' },
  corretor:     { label: 'Corretor',     variant: 'outline' },
};

const CLIENTES_RECENTES = [
  { id: '1', nome: 'iTruck Pesados',     tipo: 'lojista',       plano: 'Pro',    status: 'active',  valor: 3200, vencimento: '2026-09-01' },
  { id: '2', nome: 'Trans Horizonte',    tipo: 'transportador', plano: 'Basic',  status: 'active',  valor: 890,  vencimento: '2026-09-05' },
  { id: '3', nome: 'Corretor Machado',   tipo: 'corretor',      plano: 'Starter',status: 'active',  valor: 490,  vencimento: '2026-08-20' },
  { id: '4', nome: 'Frota Norte Sul',    tipo: 'transportador', plano: 'Pro',    status: 'pending', valor: 1800, vencimento: '2026-08-14' },
  { id: '5', nome: 'Caminhões do Vale',  tipo: 'lojista',       plano: 'Pro',    status: 'active',  valor: 3200, vencimento: '2026-09-10' },
];

const TICKETS_RECENTES = [
  { id: 'T-041', cliente: 'iTruck Pesados',    assunto: 'Erro ao subir anúncio no marketplace', prioridade: 'alta',   status: 'aberto',      criado: '14/08' },
  { id: 'T-040', cliente: 'Trans Horizonte',   assunto: 'Dúvida sobre relatório de KM',         prioridade: 'baixa',  status: 'respondido',  criado: '13/08' },
  { id: 'T-039', cliente: 'Frota Norte Sul',   assunto: 'Problema no acesso do usuário João',   prioridade: 'media',  status: 'aberto',      criado: '13/08' },
  { id: 'T-038', cliente: 'Corretor Machado',  assunto: 'Solicita upgrade de plano',            prioridade: 'media',  status: 'resolvido',   criado: '12/08' },
];

const PRIORIDADE_CONFIG: Record<string, string> = {
  alta:  'bg-red-500/15 text-red-500',
  media: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  baixa: 'bg-green-500/15 text-green-600 dark:text-green-400',
};

const STATUS_TICKET: Record<string, string> = {
  aberto:     'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  respondido: 'bg-blue-500/15 text-blue-500',
  resolvido:  'bg-muted text-muted-foreground',
};

const FUNIL = [
  { stage: 'Prospecção',  count: 14, color: 'bg-blue-400' },
  { stage: 'Qualificação',count: 9,  color: 'bg-indigo-400' },
  { stage: 'Proposta',    count: 5,  color: 'bg-violet-400' },
  { stage: 'Negociação',  count: 3,  color: 'bg-orange-400' },
  { stage: 'Fechamento',  count: 2,  color: 'bg-emerald-400' },
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6 max-w-7xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-[13px] text-foreground/50 mt-0.5">Visão geral da Via Pesados — agosto 2026</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <Card key={label} className="border-black/[0.07] dark:border-white/[0.07]">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium text-foreground/40 uppercase tracking-wide">{label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1.5">{value}</p>
                  <p className="text-[11px] text-foreground/40 mt-1">{sub}</p>
                </div>
                <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', bg)}>
                  <Icon className={cn('h-4.5 w-4.5', color)} style={{ height: 18, width: 18 }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">

        {/* Funil resumo */}
        <Card className="border-black/[0.07] dark:border-white/[0.07]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[13px]">Funil de Vendas</CardTitle>
              <button onClick={() => navigate('/funil')} className="text-[11px] text-primary flex items-center gap-1 hover:gap-1.5 transition-all">
                Ver <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex flex-col gap-2">
            {FUNIL.map(({ stage, count, color }) => (
              <div key={stage} className="flex items-center gap-3">
                <div className="w-20 shrink-0">
                  <p className="text-[12px] text-foreground/60">{stage}</p>
                </div>
                <div className="flex-1 h-5 rounded-md bg-black/[0.04] dark:bg-white/[0.04] overflow-hidden">
                  <div className={cn('h-full rounded-md transition-all', color)} style={{ width: `${(count / 14) * 100}%` }} />
                </div>
                <span className="text-[12px] font-semibold text-foreground w-4 text-right">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Clientes recentes */}
        <Card className="lg:col-span-2 border-black/[0.07] dark:border-white/[0.07]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[13px]">Clientes — Visão Rápida</CardTitle>
              <button onClick={() => navigate('/clientes')} className="text-[11px] text-primary flex items-center gap-1 hover:gap-1.5 transition-all">
                Ver todos <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.05]">
              {CLIENTES_RECENTES.map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className="flex items-center gap-3 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors text-left"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-[11px] font-bold shrink-0">
                    {c.nome.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{c.nome}</p>
                    <p className="text-[11px] text-foreground/40">{c.plano} · vence {c.vencimento}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={TIPO_CONFIG[c.tipo].variant} className="text-[10px]">
                      {TIPO_CONFIG[c.tipo].label}
                    </Badge>
                    <div className={cn('h-2 w-2 rounded-full', c.status === 'active' ? 'bg-emerald-500' : 'bg-yellow-500')} />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tickets recentes */}
      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[13px]">Tickets Recentes</CardTitle>
            <button onClick={() => navigate('/tickets')} className="text-[11px] text-primary flex items-center gap-1 hover:gap-1.5 transition-all">
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.05]">
            {TICKETS_RECENTES.map(t => (
              <button
                key={t.id}
                onClick={() => navigate('/tickets')}
                className="flex items-center gap-3 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors text-left"
              >
                <span className="text-[11px] font-mono font-bold text-foreground/40 w-10 shrink-0">{t.id}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{t.assunto}</p>
                  <p className="text-[11px] text-foreground/40">{t.cliente} · {t.criado}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', PRIORIDADE_CONFIG[t.prioridade])}>
                    {t.prioridade}
                  </span>
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_TICKET[t.status])}>
                    {t.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
