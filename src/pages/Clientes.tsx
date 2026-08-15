import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Building2, ChevronRight, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export const CLIENTES_MOCK = [
  { id: '1',  nome: 'iTruck Pesados',         tipo: 'lojista',       plano: 'Pro',     status: 'active',   users: 8,  mrr: 3200, cidade: 'Belo Horizonte', uf: 'MG', vencimento: '2026-09-01', inadimplente: false },
  { id: '2',  nome: 'Trans Horizonte',         tipo: 'transportador', plano: 'Basic',   status: 'active',   users: 3,  mrr: 890,  cidade: 'São Paulo',      uf: 'SP', vencimento: '2026-09-05', inadimplente: false },
  { id: '3',  nome: 'Corretor Machado',        tipo: 'corretor',      plano: 'Starter', status: 'active',   users: 1,  mrr: 490,  cidade: 'Curitiba',       uf: 'PR', vencimento: '2026-08-20', inadimplente: false },
  { id: '4',  nome: 'Frota Norte Sul',         tipo: 'transportador', plano: 'Pro',     status: 'pending',  users: 5,  mrr: 1800, cidade: 'Porto Alegre',   uf: 'RS', vencimento: '2026-08-14', inadimplente: true  },
  { id: '5',  nome: 'Caminhões do Vale',       tipo: 'lojista',       plano: 'Pro',     status: 'active',   users: 6,  mrr: 3200, cidade: 'Uberlândia',     uf: 'MG', vencimento: '2026-09-10', inadimplente: false },
  { id: '6',  nome: 'Transportadora Rápida',   tipo: 'transportador', plano: 'Pro',     status: 'active',   users: 4,  mrr: 1800, cidade: 'Campinas',       uf: 'SP', vencimento: '2026-09-15', inadimplente: false },
  { id: '7',  nome: 'Loja Pesados SP',         tipo: 'lojista',       plano: 'Basic',   status: 'active',   users: 2,  mrr: 1200, cidade: 'São Paulo',      uf: 'SP', vencimento: '2026-08-28', inadimplente: false },
  { id: '8',  nome: 'Corretor Almeida',        tipo: 'corretor',      plano: 'Starter', status: 'inactive', users: 1,  mrr: 490,  cidade: 'Recife',         uf: 'PE', vencimento: '2026-07-10', inadimplente: true  },
  { id: '9',  nome: 'Pesados Goiás',           tipo: 'lojista',       plano: 'Pro',     status: 'active',   users: 7,  mrr: 3200, cidade: 'Goiânia',        uf: 'GO', vencimento: '2026-09-20', inadimplente: false },
  { id: '10', nome: 'Frota Centro Oeste',      tipo: 'transportador', plano: 'Basic',   status: 'active',   users: 3,  mrr: 890,  cidade: 'Brasília',       uf: 'DF', vencimento: '2026-09-25', inadimplente: false },
];

const TIPO_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  lojista:      { label: 'Lojista',       variant: 'default' },
  transportador:{ label: 'Transportador', variant: 'secondary' },
  corretor:     { label: 'Corretor',      variant: 'outline' },
};

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  active:   { label: 'Ativo',      dot: 'bg-emerald-500' },
  pending:  { label: 'Pendente',   dot: 'bg-yellow-500' },
  inactive: { label: 'Inativo',    dot: 'bg-red-500' },
};

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function Clientes() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');

  const filtered = CLIENTES_MOCK.filter(c => {
    const matchSearch = c.nome.toLowerCase().includes(search.toLowerCase()) || c.cidade.toLowerCase().includes(search.toLowerCase());
    const matchTipo = tipoFilter === 'todos' || c.tipo === tipoFilter;
    const matchStatus = statusFilter === 'todos' || c.status === statusFilter;
    return matchSearch && matchTipo && matchStatus;
  });

  const totalMRR = filtered.reduce((s, c) => s + c.mrr, 0);

  return (
    <div className="flex flex-col gap-6 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Clientes</h1>
          <p className="text-[13px] text-foreground/50 mt-0.5">{filtered.length} cliente{filtered.length !== 1 ? 's' : ''} · MRR {fmt(totalMRR)}</p>
        </div>
        <Button onClick={() => navigate('/novo-cliente')}>
          <Plus className="h-4 w-4" /> Novo Cliente
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
          <Input
            placeholder="Buscar por nome ou cidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="lojista">Lojista</SelectItem>
            <SelectItem value="transportador">Transportador</SelectItem>
            <SelectItem value="corretor">Corretor</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="inactive">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {filtered.map(c => (
          <button
            key={c.id}
            onClick={() => navigate(`/clientes/${c.id}`)}
            className="group flex items-center gap-4 p-4 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] bg-card hover:bg-black/[0.02] dark:hover:bg-white/[0.02] hover:border-black/[0.12] dark:hover:border-white/[0.12] hover:shadow-elevated transition-all text-left"
          >
            {/* Avatar */}
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-sm font-bold shrink-0">
              {c.nome.charAt(0)}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-semibold text-foreground">{c.nome}</p>
                {c.inadimplente && (
                  <span className="text-[10px] font-bold bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded-full">INADIMPLENTE</span>
                )}
              </div>
              <p className="text-[11px] text-foreground/40 mt-0.5">{c.cidade} — {c.uf} · {c.users} usuário{c.users !== 1 ? 's' : ''} · vence {c.vencimento}</p>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden sm:block text-right">
                <p className="text-[13px] font-semibold text-foreground">{fmt(c.mrr)}</p>
                <p className="text-[10px] text-foreground/40">/ mês</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={TIPO_CONFIG[c.tipo].variant} className="text-[10px] hidden sm:flex">
                  {TIPO_CONFIG[c.tipo].label}
                </Badge>
                <div className="flex items-center gap-1.5">
                  <div className={cn('h-2 w-2 rounded-full', STATUS_CONFIG[c.status].dot)} />
                  <span className="text-[11px] text-foreground/50 hidden sm:block">{STATUS_CONFIG[c.status].label}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-foreground/20 group-hover:text-foreground/50 transition-colors" />
            </div>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Building2 className="h-10 w-10 mx-auto text-foreground/20 mb-3" />
            <p className="text-[13px] text-foreground/40">Nenhum cliente encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
