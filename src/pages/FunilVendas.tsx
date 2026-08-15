import { useState } from 'react';
import { Plus, MoreHorizontal, Building2, DollarSign, Calendar, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { fmt, cn } from '@/lib/utils';

type Tipo = 'lojista' | 'transportador' | 'corretor';

interface Lead {
  id: string;
  nome: string;
  tipo: Tipo;
  cidade: string;
  uf: string;
  valor: number;
  contato: string;
  telefone: string;
  origem: string;
  etapa: string;
  criado: string;
  notas: string;
}

const ETAPAS = [
  { id: 'prospeccao',   label: 'Prospecção',   color: 'border-blue-400/40 bg-blue-400/5',     dot: 'bg-blue-400' },
  { id: 'qualificacao', label: 'Qualificação',  color: 'border-indigo-400/40 bg-indigo-400/5', dot: 'bg-indigo-400' },
  { id: 'proposta',     label: 'Proposta',      color: 'border-violet-400/40 bg-violet-400/5', dot: 'bg-violet-400' },
  { id: 'negociacao',   label: 'Negociação',    color: 'border-orange-400/40 bg-orange-400/5', dot: 'bg-orange-400' },
  { id: 'fechamento',   label: 'Fechamento',    color: 'border-emerald-400/40 bg-emerald-400/5',dot: 'bg-emerald-400' },
];

const TIPO_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  lojista:      { label: 'Lojista',       variant: 'default' },
  transportador:{ label: 'Transportador', variant: 'secondary' },
  corretor:     { label: 'Corretor',      variant: 'outline' },
};

const LEADS_INIT: Lead[] = [
  { id: 'l1', nome: 'Pesados Nordeste',   tipo: 'lojista',       cidade: 'Fortaleza',   uf: 'CE', valor: 3200, contato: 'José Moura',    telefone: '(85)99123-4567', origem: 'Indicação',   etapa: 'prospeccao',   criado: '2026-08-10', notas: '' },
  { id: 'l2', nome: 'Trans Minas',        tipo: 'transportador', cidade: 'Uberaba',     uf: 'MG', valor: 1800, contato: 'Paulo Ferreira', telefone: '(34)98765-4321', origem: 'Site',        etapa: 'prospeccao',   criado: '2026-08-09', notas: '' },
  { id: 'l3', nome: 'Corretor Santos',    tipo: 'corretor',      cidade: 'Santos',      uf: 'SP', valor: 490,  contato: 'Bruno Santos',   telefone: '(13)99234-5678', origem: 'LinkedIn',    etapa: 'qualificacao', criado: '2026-08-08', notas: '' },
  { id: 'l4', nome: 'Truck Centro',       tipo: 'lojista',       cidade: 'Brasília',    uf: 'DF', valor: 3200, contato: 'Cláudio Lima',   telefone: '(61)98877-1234', origem: 'WhatsApp',    etapa: 'qualificacao', criado: '2026-08-07', notas: 'Demonstração agendada' },
  { id: 'l5', nome: 'Frotão RS',          tipo: 'transportador', cidade: 'Caxias',      uf: 'RS', valor: 1800, contato: 'Rodrigo Brito',  telefone: '(54)99543-2100', origem: 'Feira',       etapa: 'proposta',     criado: '2026-08-05', notas: 'Aguarda proposta formal' },
  { id: 'l6', nome: 'Veículos Recife',    tipo: 'lojista',       cidade: 'Recife',      uf: 'PE', valor: 3200, contato: 'Eduardo Neto',   telefone: '(81)98456-7890', origem: 'Indicação',   etapa: 'proposta',     criado: '2026-08-03', notas: '' },
  { id: 'l7', nome: 'Trans Amazônia',     tipo: 'transportador', cidade: 'Manaus',      uf: 'AM', valor: 1800, contato: 'Marcos Silva',   telefone: '(92)99876-5432', origem: 'Instagram',   etapa: 'negociacao',   criado: '2026-08-01', notas: 'Pediu desconto 10%' },
  { id: 'l8', nome: 'Corretor Belém',     tipo: 'corretor',      cidade: 'Belém',       uf: 'PA', valor: 490,  contato: 'Sônia Farias',   telefone: '(91)98321-6543', origem: 'Site',        etapa: 'fechamento',   criado: '2026-07-29', notas: 'Contrato sendo assinado' },
];

function LeadCard({ lead, onMove }: { lead: Lead; onMove: (id: string, etapa: string) => void }) {
  const tipo = TIPO_CONFIG[lead.tipo];
  return (
    <div className="rounded-xl border border-black/[0.07] dark:border-white/[0.07] bg-card p-3.5 flex flex-col gap-2.5 hover:shadow-elevated hover:border-black/[0.12] dark:hover:border-white/[0.12] transition-all cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold text-foreground leading-tight">{lead.nome}</p>
        <Badge variant={tipo.variant} className="text-[10px] shrink-0">{tipo.label}</Badge>
      </div>
      <p className="text-[11px] text-foreground/50">{lead.cidade} — {lead.uf}</p>
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold text-primary">{fmt(lead.valor)}/mês</p>
        <span className="text-[10px] text-foreground/40">{lead.origem}</span>
      </div>
      {lead.notas && (
        <p className="text-[11px] text-foreground/50 bg-black/[0.03] dark:bg-white/[0.03] rounded-lg px-2.5 py-1.5 leading-snug">{lead.notas}</p>
      )}
      <div className="flex items-center gap-1 pt-1">
        {ETAPAS.filter(e => e.id !== lead.etapa).map(e => (
          <button
            key={e.id}
            onClick={(ev) => { ev.stopPropagation(); onMove(lead.id, e.id); }}
            title={`Mover para ${e.label}`}
            className={cn('h-1.5 flex-1 rounded-full transition-opacity hover:opacity-80', e.dot)}
          />
        ))}
      </div>
    </div>
  );
}

export default function FunilVendas() {
  const [leads, setLeads] = useState<Lead[]>(LEADS_INIT);
  const [addOpen, setAddOpen] = useState(false);
  const [newLead, setNewLead] = useState<Partial<Lead>>({ tipo: 'lojista', etapa: 'prospeccao', origem: 'Site' });

  const totalPipeline = leads.reduce((s, l) => s + l.valor, 0);

  function moveLeadTo(id: string, etapa: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, etapa } : l));
  }

  function handleAdd() {
    if (!newLead.nome) return;
    const lead: Lead = {
      id: `l${Date.now()}`,
      nome: newLead.nome ?? '',
      tipo: (newLead.tipo ?? 'lojista') as Tipo,
      cidade: newLead.cidade ?? '',
      uf: newLead.uf ?? '',
      valor: newLead.valor ?? 1200,
      contato: newLead.contato ?? '',
      telefone: newLead.telefone ?? '',
      origem: newLead.origem ?? 'Manual',
      etapa: newLead.etapa ?? 'prospeccao',
      criado: new Date().toISOString().split('T')[0],
      notas: newLead.notas ?? '',
    };
    setLeads(prev => [...prev, lead]);
    setNewLead({ tipo: 'lojista', etapa: 'prospeccao', origem: 'Site' });
    setAddOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Funil de Vendas</h1>
          <p className="text-[13px] text-foreground/50 mt-0.5">{leads.length} leads · pipeline {fmt(totalPipeline)}/mês</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Novo Lead
        </Button>
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto -mx-6 px-6">
        <div className="flex gap-3 min-w-[900px]">
          {ETAPAS.map(etapa => {
            const etapaLeads = leads.filter(l => l.etapa === etapa.id);
            const etapaMRR = etapaLeads.reduce((s, l) => s + l.valor, 0);
            return (
              <div key={etapa.id} className={cn('flex-1 min-w-[200px] flex flex-col rounded-2xl border p-3 gap-3', etapa.color)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('h-2 w-2 rounded-full', etapa.dot)} />
                    <p className="text-[12px] font-semibold text-foreground">{etapa.label}</p>
                  </div>
                  <span className="text-[11px] font-bold bg-black/[0.06] dark:bg-white/[0.06] px-1.5 py-0.5 rounded-full text-foreground/60">{etapaLeads.length}</span>
                </div>
                <p className="text-[10px] text-foreground/40 -mt-1">{fmt(etapaMRR)}/mês</p>
                <div className="flex flex-col gap-2">
                  {etapaLeads.map(lead => (
                    <LeadCard key={lead.id} lead={lead} onMove={moveLeadTo} />
                  ))}
                </div>
                {etapaLeads.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-[11px] text-foreground/30">Sem leads</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome da empresa *</Label><Input className="mt-1" value={newLead.nome ?? ''} onChange={e => setNewLead(p => ({ ...p, nome: e.target.value }))} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={newLead.tipo} onValueChange={v => setNewLead(p => ({ ...p, tipo: v as Tipo }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lojista">Lojista</SelectItem>
                  <SelectItem value="transportador">Transportador</SelectItem>
                  <SelectItem value="corretor">Corretor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Etapa inicial</Label>
              <Select value={newLead.etapa} onValueChange={v => setNewLead(p => ({ ...p, etapa: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ETAPAS.map(e => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Contato</Label><Input className="mt-1" value={newLead.contato ?? ''} onChange={e => setNewLead(p => ({ ...p, contato: e.target.value }))} /></div>
            <div><Label>Telefone</Label><Input className="mt-1" value={newLead.telefone ?? ''} onChange={e => setNewLead(p => ({ ...p, telefone: e.target.value }))} /></div>
            <div><Label>Cidade</Label><Input className="mt-1" value={newLead.cidade ?? ''} onChange={e => setNewLead(p => ({ ...p, cidade: e.target.value }))} /></div>
            <div><Label>UF</Label><Input className="mt-1" maxLength={2} value={newLead.uf ?? ''} onChange={e => setNewLead(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
            <div>
              <Label>Valor MRR (R$)</Label>
              <Input className="mt-1" type="number" value={newLead.valor ?? ''} onChange={e => setNewLead(p => ({ ...p, valor: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={newLead.origem} onValueChange={v => setNewLead(p => ({ ...p, origem: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Site', 'WhatsApp', 'Indicação', 'LinkedIn', 'Instagram', 'Feira', 'Manual'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Notas</Label><Textarea className="mt-1" rows={2} value={newLead.notas ?? ''} onChange={e => setNewLead(p => ({ ...p, notas: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Adicionar lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
