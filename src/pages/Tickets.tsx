import { useState } from 'react';
import { Plus, MessageSquare, AlertCircle, Clock, CheckCircle2, Search, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fmtDate, cn } from '@/lib/utils';

interface Ticket {
  id: string;
  cliente: string;
  assunto: string;
  descricao: string;
  prioridade: 'alta' | 'media' | 'baixa';
  status: 'aberto' | 'respondido' | 'resolvido';
  criado: string;
  atualizado: string;
  mensagens: number;
  atribuido: string;
}

const TICKETS_INIT: Ticket[] = [
  { id: 'T-041', cliente: 'iTruck Pesados',     assunto: 'Erro ao subir anúncio no marketplace',       descricao: 'Ao tentar publicar um veículo no marketplace, aparece erro 500.',             prioridade: 'alta',  status: 'aberto',     criado: '2026-08-14', atualizado: '2026-08-14', mensagens: 2,  atribuido: 'Dev' },
  { id: 'T-040', cliente: 'Trans Horizonte',    assunto: 'Dúvida sobre relatório de KM',               descricao: 'Como faço para filtrar o relatório de KM por motorista?',                   prioridade: 'baixa', status: 'respondido', criado: '2026-08-13', atualizado: '2026-08-14', mensagens: 4,  atribuido: 'Suporte' },
  { id: 'T-039', cliente: 'Frota Norte Sul',    assunto: 'Problema no acesso do usuário João',         descricao: 'O usuário João não consegue mais fazer login. Aparece "conta suspensa".',    prioridade: 'media', status: 'aberto',     criado: '2026-08-13', atualizado: '2026-08-13', mensagens: 1,  atribuido: 'Suporte' },
  { id: 'T-038', cliente: 'Corretor Machado',   assunto: 'Solicita upgrade de plano',                  descricao: 'Gostaria de fazer upgrade para o plano Pro.',                                prioridade: 'media', status: 'resolvido', criado: '2026-08-12', atualizado: '2026-08-13', mensagens: 5,  atribuido: 'Comercial' },
  { id: 'T-037', cliente: 'Caminhões do Vale',  assunto: 'Bug no módulo financeiro — duplica lançamento', descricao: 'Ao salvar um lançamento, ele é salvo duas vezes na lista.',              prioridade: 'alta',  status: 'respondido', criado: '2026-08-11', atualizado: '2026-08-12', mensagens: 6,  atribuido: 'Dev' },
  { id: 'T-036', cliente: 'Pesados Goiás',      assunto: 'Solicita treinamento para equipe',            descricao: 'Gostaríamos de um treinamento online para nossa equipe de vendas.',          prioridade: 'baixa', status: 'resolvido', criado: '2026-08-10', atualizado: '2026-08-11', mensagens: 3,  atribuido: 'CS' },
];

const PRIO_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  alta:  { label: 'Alta',  color: 'bg-red-500/15 text-red-500',                               dot: 'bg-red-500' },
  media: { label: 'Média', color: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',    dot: 'bg-yellow-500' },
  baixa: { label: 'Baixa', color: 'bg-green-500/15 text-green-600 dark:text-green-400',       dot: 'bg-green-500' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  aberto:     { label: 'Aberto',     color: 'bg-orange-500/15 text-orange-600 dark:text-orange-400', icon: <AlertCircle className="h-3 w-3" /> },
  respondido: { label: 'Respondido', color: 'bg-blue-500/15 text-blue-500',                          icon: <MessageSquare className="h-3 w-3" /> },
  resolvido:  { label: 'Resolvido',  color: 'bg-muted text-muted-foreground',                        icon: <CheckCircle2 className="h-3 w-3" /> },
};

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>(TICKETS_INIT);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [prioFilter, setPrioFilter] = useState('todas');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [resposta, setResposta] = useState('');
  const [form, setForm] = useState({ cliente: '', assunto: '', descricao: '', prioridade: 'media' });

  const filtered = tickets.filter(t => {
    const matchSearch = t.assunto.toLowerCase().includes(search.toLowerCase()) || t.cliente.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'todos' || t.status === statusFilter;
    const matchPrio = prioFilter === 'todas' || t.prioridade === prioFilter;
    return matchSearch && matchStatus && matchPrio;
  });

  const qtdAberto = tickets.filter(t => t.status === 'aberto').length;
  const qtdAlta = tickets.filter(t => t.prioridade === 'alta' && t.status !== 'resolvido').length;

  function handleAdd() {
    if (!form.assunto || !form.cliente) return;
    const t: Ticket = {
      id: `T-${(tickets.length + 42).toString().padStart(3, '0')}`,
      cliente: form.cliente,
      assunto: form.assunto,
      descricao: form.descricao,
      prioridade: form.prioridade as Ticket['prioridade'],
      status: 'aberto',
      criado: new Date().toISOString().split('T')[0],
      atualizado: new Date().toISOString().split('T')[0],
      mensagens: 0,
      atribuido: 'Suporte',
    };
    setTickets(prev => [t, ...prev]);
    setForm({ cliente: '', assunto: '', descricao: '', prioridade: 'media' });
    setAddOpen(false);
  }

  function handleResponder() {
    if (!selected || !resposta) return;
    setTickets(prev => prev.map(t => t.id === selected.id
      ? { ...t, status: 'respondido', mensagens: t.mensagens + 1, atualizado: new Date().toISOString().split('T')[0] }
      : t,
    ));
    setResposta('');
    setSelected(null);
  }

  function handleResolver(id: string) {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: 'resolvido' } : t));
    setSelected(null);
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tickets de Suporte</h1>
          <p className="text-[13px] text-foreground/50 mt-0.5">{qtdAberto} abertos · {qtdAlta} prioritários</p>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Novo Ticket</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
          <Input placeholder="Buscar por assunto ou cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="aberto">Aberto</SelectItem>
            <SelectItem value="respondido">Respondido</SelectItem>
            <SelectItem value="resolvido">Resolvido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={prioFilter} onValueChange={setPrioFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {filtered.map(t => (
          <button
            key={t.id}
            onClick={() => setSelected(t)}
            className="group flex items-center gap-4 p-4 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] bg-card hover:bg-black/[0.02] dark:hover:bg-white/[0.02] hover:shadow-elevated hover:border-black/[0.12] dark:hover:border-white/[0.12] transition-all text-left"
          >
            <div className={cn('h-2 w-2 rounded-full shrink-0', PRIO_CONFIG[t.prioridade].dot)} />
            <div className="w-14 shrink-0">
              <p className="text-[11px] font-mono font-bold text-foreground/40">{t.id}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate">{t.assunto}</p>
              <p className="text-[11px] text-foreground/40 mt-0.5">{t.cliente} · {fmtDate(t.criado)} · {t.mensagens} mensagem{t.mensagens !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', PRIO_CONFIG[t.prioridade].color)}>{PRIO_CONFIG[t.prioridade].label}</span>
              <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_CONFIG[t.status].color)}>
                {STATUS_CONFIG[t.status].icon}{STATUS_CONFIG[t.status].label}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-foreground/20 group-hover:text-foreground/50 transition-colors shrink-0" />
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <MessageSquare className="h-10 w-10 mx-auto text-foreground/20 mb-3" />
            <p className="text-[13px] text-foreground/40">Nenhum ticket encontrado</p>
          </div>
        )}
      </div>

      {/* Dialog — detalhe */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono font-bold text-foreground/40">{selected.id}</span>
                <DialogTitle className="text-base">{selected.assunto}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_CONFIG[selected.status].color)}>
                  {STATUS_CONFIG[selected.status].icon}{STATUS_CONFIG[selected.status].label}
                </span>
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', PRIO_CONFIG[selected.prioridade].color)}>{PRIO_CONFIG[selected.prioridade].label}</span>
                <span className="text-[11px] text-foreground/40">{selected.cliente}</span>
                <span className="text-[11px] text-foreground/40">· atribuído a {selected.atribuido}</span>
              </div>
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-[13px] text-foreground">{selected.descricao}</p>
                <p className="text-[11px] text-foreground/40 mt-2">Aberto em {fmtDate(selected.criado)} · {selected.mensagens} mensagem{selected.mensagens !== 1 ? 's' : ''}</p>
              </div>
              {selected.status !== 'resolvido' && (
                <div>
                  <Label>Responder</Label>
                  <Textarea className="mt-1" rows={3} placeholder="Digite sua resposta..." value={resposta} onChange={e => setResposta(e.target.value)} />
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              {selected.status !== 'resolvido' && (
                <>
                  <Button variant="outline" onClick={() => handleResolver(selected.id)}>
                    <CheckCircle2 className="h-4 w-4" />Resolver
                  </Button>
                  <Button onClick={handleResponder} disabled={!resposta}>Responder</Button>
                </>
              )}
              {selected.status === 'resolvido' && (
                <Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog — novo */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Ticket</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4">
            <div><Label>Cliente</Label><Input className="mt-1" value={form.cliente} onChange={e => setForm(p => ({ ...p, cliente: e.target.value }))} /></div>
            <div><Label>Assunto</Label><Input className="mt-1" value={form.assunto} onChange={e => setForm(p => ({ ...p, assunto: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Textarea className="mt-1" rows={3} value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade} onValueChange={v => setForm(p => ({ ...p, prioridade: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Criar ticket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
