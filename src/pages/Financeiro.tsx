import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, TrendingUp, TrendingDown, DollarSign, Clock, AlertCircle, CheckCircle2, X, Pencil, Trash2,
  BarChart3, Landmark, Check, Layers, Repeat, Building2, ChevronRight, Zap, Wrench, Monitor, Megaphone, Wifi,
  Receipt, ShieldCheck, Calculator, Scale, Package, Truck, Plane, Coffee, BookOpen, Briefcase, Building, Gift,
  MoreHorizontal, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useClients, usePayments, useFinCategories, useFinTransactions, useCreateFinCategory,
  useCreateFinTransaction, useUpdateFinTransaction, useDeleteFinTransaction, useChannels,
  brlFull, type FinTransaction, type FinStatus, type Payment,
} from '@/hooks/useAdmin';
import { useFrente } from '@/contexts/FrenteContext';
import { rotuloDaFrente } from '@/lib/frente';
import { sugestoesQueFaltam } from '@/lib/categoriasFinanceiras';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangeSelector } from '@/components/ui/date-range-selector';
import { formatBRLInput, parseBRLInput } from '@/utils/brCurrency';
import { cn } from '@/lib/utils';
import { mrrDaCarteira } from '@/lib/mrr';

/* ══════════════════════════════════════════════════════════════════
   Cópia da tela Financeiro do sistema do lojista, com os dados do admin.

   O que é só de loja de veículo ficou lá: salário automático da equipe,
   venda, veículo, departamento e a tabela de recorrências. Aqui a
   recorrência materializa as linhas na hora (12 meses, 12 trimestres…),
   como o lançamento do admin sempre fez.

   O que é só do admin ficou aqui: cliente na receita, canal de aquisição
   na despesa (numerador do CAC), competência separada do vencimento, a
   frente (na Empresa, lançar é custo geral, sem cliente), o aviso de
   vencidos com as cobranças e o Repasse para o Santander.

   "Vencido" não é um status que alguém grava: é pendente com o
   vencimento no passado. O banco do admin não tem 'vencido'.
   ══════════════════════════════════════════════════════════════════ */

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
};

const hoje = () => new Date().toISOString().slice(0, 10);
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const dias = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000);

/** numeric chega do PostgREST como texto às vezes; somar texto concatena. */
const valor = (t: { amount: number | string | null | undefined }) => Number(t.amount) || 0;

/** Atraso é derivado, nunca um campo que alguém troca à mão. */
const vencido = (t: FinTransaction) =>
  t.status === 'atrasado' || (t.status === 'pendente' && !!t.due_date && t.due_date < hoje());

/** O status que a tela mostra: o do banco, com o atraso derivado por cima. */
const statusDe = (t: FinTransaction): string => (vencido(t) ? 'vencido' : t.status);

/* As mensalidades dos clientes moram em `payments` (cobranças do Asaas), não
   em `financial_transactions`. Sem isso o Financeiro dizia "nenhuma receita"
   com a carteira pagando todo mês. Elas entram aqui como receita só de
   leitura: quem mexe nelas é a tela de Pagamentos. */
const ID_COBRANCA = 'cobranca:';
const ehCobranca = (t: { id: string }) => t.id.startsWith(ID_COBRANCA);
const CATEGORIA_MENSALIDADE = { id: '__mensalidades__', name: 'Mensalidades', color: '#FF6E00', type: 'receita' };
function cobrancaComoLancamento(p: Payment): FinTransaction {
  const pagoEm = p.paid_at ? p.paid_at.slice(0, 10) : null;
  return {
    id: ID_COBRANCA + p.id,
    type: 'receita',
    status: p.status,
    category_id: CATEGORIA_MENSALIDADE.id,
    client_id: p.client_id,
    description: p.description || 'Mensalidade',
    amount: Number(p.amount) || 0,
    due_date: p.due_date,
    payment_date: pagoEm,
    competence_date: p.due_date,
    recurrence: p.asaas_subscription_id ? 'mensal' : 'unica',
    installment_number: null, total_installments: null, installment_group_id: null,
    notes: null, attachment_url: null, channel_id: null,
    frente: p.frente as FinTransaction['frente'],
    created_by: null, created_at: p.created_at,
    category: CATEGORIA_MENSALIDADE,
    client: p.client ?? null,
  };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pendente: { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400', icon: <Clock className="h-3 w-3" /> },
  pago: { label: 'Pago', color: 'bg-green-500/15 text-green-600 dark:text-green-400', icon: <CheckCircle2 className="h-3 w-3" /> },
  recebido: { label: 'Recebido', color: 'bg-green-500/15 text-green-600 dark:text-green-400', icon: <CheckCircle2 className="h-3 w-3" /> },
  vencido: { label: 'Vencido', color: 'bg-red-500/15 text-red-500', icon: <AlertCircle className="h-3 w-3" /> },
  cancelado: { label: 'Cancelado', color: 'bg-muted text-muted-foreground', icon: <X className="h-3 w-3" /> },
};

// ─── Categorias sugeridas ───────────────────────────────
const CAT_ICONS: Record<string, React.ReactNode> = {
  'Serviços':               <Wrench className="h-4 w-4" />,
  'Aluguel Recebido':       <Building2 className="h-4 w-4" />,
  'Bonificação':            <Gift className="h-4 w-4" />,
  'Aluguel':                <Building className="h-4 w-4" />,
  'Energia e Água':         <Zap className="h-4 w-4" />,
  'Manutenção do Espaço':   <Wrench className="h-4 w-4" />,
  'Telefonia e Internet':   <Wifi className="h-4 w-4" />,
  'Software e Tecnologia':  <Monitor className="h-4 w-4" />,
  'Marketing e Publicidade':<Megaphone className="h-4 w-4" />,
  'Contabilidade':          <Calculator className="h-4 w-4" />,
  'Impostos e Taxas':       <Receipt className="h-4 w-4" />,
  'Despesas Bancárias':     <Landmark className="h-4 w-4" />,
  'Seguros da Empresa':     <ShieldCheck className="h-4 w-4" />,
  'Material de Escritório': <Package className="h-4 w-4" />,
  'Combustível e Transporte':<Truck className="h-4 w-4" />,
  'Viagens e Hospedagem':   <Plane className="h-4 w-4" />,
  'Alimentação':            <Coffee className="h-4 w-4" />,
  'Treinamento e Cursos':   <BookOpen className="h-4 w-4" />,
  'Jurídico':               <Scale className="h-4 w-4" />,
  'Consultoria':            <Briefcase className="h-4 w-4" />,
  'Outros':                 <MoreHorizontal className="h-4 w-4" />,
};

const CAT_GROUPS: Record<'receita' | 'despesa', { label: string; color: string; cats: string[] }[]> = {
  receita: [
    { label: 'Serviços Prestados', color: '#10b981', cats: ['Serviços'] },
    { label: 'Rendimentos',        color: '#f59e0b', cats: ['Aluguel Recebido', 'Bonificação', 'Outros'] },
  ],
  despesa: [
    { label: 'Espaço & Infraestrutura',    color: '#6366f1', cats: ['Aluguel', 'Energia e Água', 'Manutenção do Espaço'] },
    { label: 'Tecnologia & Comunicação',   color: '#0ea5e9', cats: ['Telefonia e Internet', 'Software e Tecnologia'] },
    { label: 'Marketing',                  color: '#ec4899', cats: ['Marketing e Publicidade'] },
    { label: 'Financeiro & Administração', color: '#f59e0b', cats: ['Contabilidade', 'Impostos e Taxas', 'Despesas Bancárias', 'Seguros da Empresa', 'Material de Escritório'] },
    { label: 'Mobilidade',                 color: '#10b981', cats: ['Combustível e Transporte', 'Viagens e Hospedagem'] },
    { label: 'Pessoas & Aprendizado',      color: '#8b5cf6', cats: ['Alimentação', 'Treinamento e Cursos'] },
    { label: 'Jurídico & Consultoria',     color: '#ef4444', cats: ['Jurídico', 'Consultoria'] },
    { label: 'Outros',                     color: '#6B7280', cats: ['Outros'] },
  ],
};

const getCatGroup = (catName: string | null | undefined, type: 'receita' | 'despesa') =>
  catName ? (CAT_GROUPS[type].find(g => g.cats.includes(catName)) ?? null) : null;

/* A recorrência do admin: as linhas nascem todas de uma vez. */
const RECURRENCE_TYPES: { value: FinTransaction['recurrence']; label: string; desc: string }[] = [
  { value: 'unica',      label: 'Não se repete', desc: 'Lançamento único' },
  { value: 'mensal',     label: 'Mensal',        desc: 'Todo mês, por 12 meses' },
  { value: 'trimestral', label: 'Trimestral',    desc: 'A cada 3 meses, 12 vezes' },
  { value: 'anual',      label: 'Anual',         desc: 'Todo ano, por 12 anos' },
  { value: 'parcelada',  label: 'Parcelada',     desc: 'O valor dividido em parcelas' },
];

type Etapa = 'tipo' | 'valor' | 'vinculo' | 'quando';

// ─── Wizard de Lançamento ─────────────────────────────
function LaunchWizard({ onClose, initial }: { onClose: () => void; initial?: FinTransaction | null }) {
  const { data: categories = [] } = useFinCategories();
  const { data: clients = [] } = useClients();
  const { data: canais = [] } = useChannels();
  const criar = useCreateFinTransaction();
  const atualizar = useUpdateFinTransaction();
  const criarCategoria = useCreateFinCategory();
  /* Na Empresa, lançar aqui é custo geral da Via Pesados: sem cliente, que
     é sempre de uma frente (e o banco recusaria o vínculo). */
  const { frente } = useFrente();
  const naEmpresa = frente === 'empresa';

  const isEdit = !!initial?.id;
  const [type, setType] = useState<'receita' | 'despesa'>(initial?.type || 'despesa');
  const [description, setDescription] = useState(initial?.description || '');
  const [amount, setAmount] = useState(initial ? formatBRLInput(Math.round(valor(initial) * 100)) : '');
  const [dueDate, setDueDate] = useState(initial?.due_date || hoje());
  const [competenceDate, setCompetenceDate] = useState(initial?.competence_date || hoje());
  const [status, setStatus] = useState<'pendente' | 'pago'>(initial?.status === 'pago' ? 'pago' : 'pendente');
  const [paymentDate, setPaymentDate] = useState(initial?.payment_date || '');
  // categoria: um id existente ou um nome sugerido, criado ao salvar
  const [categoryId, setCategoryId] = useState(initial?.category_id || '');
  const [categoryCustom, setCategoryCustom] = useState('');
  const [clientId, setClientId] = useState(initial?.client_id || '');
  const [channelId, setChannelId] = useState(initial?.channel_id || '');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [recurrence, setRecurrence] = useState<FinTransaction['recurrence']>('unica');
  const [parcelas, setParcelas] = useState('2');
  const [saving, setSaving] = useState(false);
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [step, setStep] = useState(0);
  const descRef = useRef<HTMLInputElement>(null);
  const amtRef = useRef<HTMLInputElement>(null);

  /* Receita na Empresa não tem a quem se ligar: a etapa some. */
  const temVinculo = type === 'despesa' || !naEmpresa;
  const etapas: Etapa[] = [
    ...(isEdit ? [] : ['tipo' as const]),
    'valor',
    ...(temVinculo ? ['vinculo' as const] : []),
    'quando',
  ];
  const etapa: Etapa = etapas[Math.min(step, etapas.length - 1)] ?? 'valor';
  const ultima = step >= etapas.length - 1;

  // Foco no primeiro campo ao trocar de etapa — NÃO via autoFocus (loop de render)
  useEffect(() => {
    const t = setTimeout(() => {
      if (etapa === 'valor') descRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [etapa]);

  const filteredCats = categories.filter(c => c.type === type);

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const nova = await criarCategoria.mutateAsync({
        name: newCatName.trim(), type, color: type === 'receita' ? '#22c55e' : '#6366f1',
      });
      if (nova?.id) {
        setCategoryId(nova.id);
        setCategoryCustom('');
        setNewCatName('');
        setShowNewCatInput(false);
      }
    } catch (e) {
      toast.error('Não consegui criar a categoria', { description: (e as Error).message });
    }
  };

  const handleSave = async () => {
    const totalAmt = parseBRLInput(amount) || 0;
    if (!description.trim()) { toast.error('Descreva o lançamento'); return; }
    if (totalAmt <= 0) { toast.error('Informe um valor'); return; }

    setSaving(true);
    try {
      // Categoria sugerida vira categoria de verdade na hora de salvar
      let catId: string | null = categoryId || null;
      if (!catId && categoryCustom.trim()) {
        const nova = await criarCategoria.mutateAsync({
          name: categoryCustom.trim(), type, color: type === 'receita' ? '#22c55e' : '#6366f1',
        });
        catId = nova?.id ?? null;
      }

      const client_id = type === 'receita' && !naEmpresa ? (clientId || null) : (naEmpresa ? null : (initial?.client_id ?? null));
      // Só faz sentido em despesa: é o numerador do CAC por canal.
      const channel_id = type === 'despesa' ? (channelId || null) : null;
      const pago = status === 'pago';

      if (isEdit && initial) {
        await atualizar.mutateAsync({
          id: initial.id,
          type,
          status: (pago ? 'pago' : 'pendente') as FinStatus,
          description: description.trim(),
          amount: Number(totalAmt.toFixed(2)),
          due_date: dueDate,
          competence_date: competenceDate,
          payment_date: pago ? (paymentDate || dueDate) : null,
          category_id: catId,
          client_id,
          channel_id,
          notes: notes.trim() || null,
        });
        toast.success('Lançamento atualizado');
        onClose();
        return;
      }

      const repeticoes =
        recurrence === 'unica' ? 1
        : recurrence === 'parcelada' ? Math.max(2, Number(parcelas) || 2)
        : 12;
      const passo = recurrence === 'trimestral' ? 3 : recurrence === 'anual' ? 12 : 1;
      const grupo = repeticoes > 1 ? crypto.randomUUID() : null;
      const valorParcela = recurrence === 'parcelada' ? totalAmt / repeticoes : totalAmt;

      const rows = Array.from({ length: repeticoes }, (_, i) => {
        const venc = new Date(dueDate + 'T12:00:00');
        venc.setMonth(venc.getMonth() + i * passo);
        const comp = new Date(competenceDate + 'T12:00:00');
        comp.setMonth(comp.getMonth() + i * passo);
        const estaPago = i === 0 && pago;
        return {
          type,
          status: (estaPago ? 'pago' : 'pendente') as FinStatus,
          category_id: catId,
          channel_id,
          client_id,
          description: description.trim(),
          notes: notes.trim() || null,
          amount: Number(valorParcela.toFixed(2)),
          due_date: venc.toISOString().slice(0, 10),
          competence_date: comp.toISOString().slice(0, 10),
          payment_date: estaPago ? (paymentDate || dueDate) : null,
          recurrence,
          installment_group_id: grupo,
          installment_number: repeticoes > 1 ? i + 1 : null,
          total_installments: repeticoes > 1 ? repeticoes : null,
        };
      });

      await criar.mutateAsync(rows);
      toast.success(repeticoes > 1 ? `${repeticoes} lançamentos criados` : 'Lançamento criado');
      onClose();
    } catch (e) {
      toast.error('Não consegui salvar o lançamento', { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    if (etapa === 'valor') return description.trim().length > 0 && amount.length > 0;
    return true;
  };

  const StepDots = () => (
    <div className="flex items-center gap-1.5">
      {etapas.map((_, i) => (
        <div key={i} className={cn('rounded-full transition-all duration-300', i < step ? 'h-1.5 w-5 bg-primary' : i === step ? 'h-1.5 w-7 bg-primary' : 'h-1.5 w-1.5 bg-foreground/15')} />
      ))}
    </div>
  );

  const nomeDoTipo = type === 'receita' ? 'Receita' : 'Despesa';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-card border border-border/60 rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-3 shrink-0">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {isEdit ? 'Editar Lançamento' : etapa === 'tipo' ? (naEmpresa ? 'Novo custo geral' : 'Novo Lançamento') : `Nova ${nomeDoTipo}`}
            </p>
            <StepDots />
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-xl text-foreground/30 hover:text-foreground hover:bg-muted/60 transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Conteúdo com rolagem */}
        <div className="px-7 py-4 overflow-y-auto flex-1">

          {/* ── Tipo ── */}
          {etapa === 'tipo' && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <h2 className="text-2xl font-bold tracking-tight">O que é?</h2>
                <p className="text-sm text-muted-foreground mt-1">Escolha o tipo de lançamento</p>
              </div>
              {([
                { value: 'receita' as const, label: 'Receita', desc: 'Entrada de dinheiro — mensalidades, implantações...', icon: TrendingUp, cls: 'border-emerald-500/50 bg-emerald-500/[0.06] hover:bg-emerald-500/10', ic: 'text-emerald-500' },
                { value: 'despesa' as const, label: 'Despesa', desc: 'Saída de dinheiro — custos, fornecedores...', icon: TrendingDown, cls: 'border-red-500/50 bg-red-500/[0.06] hover:bg-red-500/10', ic: 'text-red-500' },
              ]).map(opt => {
                const Icon = opt.icon;
                return (
                  <button key={opt.value} type="button"
                    onClick={() => { if (opt.value !== type) { setCategoryId(''); setCategoryCustom(''); } setType(opt.value); setStep(1); }}
                    className={cn('w-full flex items-center gap-4 px-6 py-5 rounded-2xl border-2 transition-all text-left', opt.cls)}>
                    <div className="w-12 h-12 rounded-2xl bg-background/50 flex items-center justify-center shrink-0">
                      <Icon className={cn('h-6 w-6 stroke-[1.5]', opt.ic)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base">{opt.label}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Categoria + Descrição + Valor ── */}
          {etapa === 'valor' && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <h2 className="text-2xl font-bold tracking-tight">{type === 'receita' ? 'Qual receita?' : 'Qual despesa?'}</h2>
                <p className="text-sm text-muted-foreground mt-1">Categoria, descrição e valor</p>
              </div>

              {/* Categoria */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Categoria</p>
                <div className="space-y-3">
                  {filteredCats.length > 0 && (
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1.5">Minhas categorias</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {filteredCats.map(c => (
                          <button key={c.id} type="button"
                            onClick={() => { setCategoryId(c.id === categoryId ? '' : c.id); setCategoryCustom(''); }}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-medium transition-all text-left',
                              c.id === categoryId ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/40 text-foreground'
                            )}>
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                            <span className="truncate">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sugestões agrupadas — só as que ainda não existem */}
                  {CAT_GROUPS[type].map(group => {
                    const groupCats = sugestoesQueFaltam(group.cats, filteredCats.map(c => c.name));
                    if (groupCats.length === 0) return null;
                    const gc = group.color;
                    return (
                      <div key={group.label}>
                        <p className="text-[9px] font-semibold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"
                           style={{ color: gc + 'bb' }}>
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: gc }} />
                          {group.label}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {groupCats.map(label => {
                            const isSelected = categoryCustom === label;
                            return (
                              <button key={label} type="button"
                                onClick={() => { setCategoryId(''); setCategoryCustom(isSelected ? '' : label); }}
                                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-medium transition-all text-left"
                                style={isSelected
                                  ? { borderColor: gc + '99', backgroundColor: gc + '1a', color: gc }
                                  : { borderColor: gc + '30' }
                                }>
                                <span className="shrink-0" style={{ color: isSelected ? gc : gc + '80' }}>
                                  {CAT_ICONS[label] ?? <MoreHorizontal className="h-4 w-4" />}
                                </span>
                                <span className="truncate">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Nova categoria */}
                  {showNewCatInput ? (
                    <div className="flex gap-2">
                      <input
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
                        placeholder="Nome da categoria..."
                        autoFocus
                        className="flex-1 bg-muted/30 border border-primary/40 rounded-xl px-3 h-10 text-sm outline-none"
                      />
                      <button type="button" onClick={handleCreateCategory}
                        disabled={!newCatName.trim() || criarCategoria.isPending}
                        className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 shrink-0">
                        {criarCategoria.isPending ? '...' : 'Salvar'}
                      </button>
                      <button type="button" onClick={() => { setShowNewCatInput(false); setNewCatName(''); }}
                        className="h-10 w-10 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:bg-muted/40 shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowNewCatInput(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border/50 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-all w-full">
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      Nova categoria
                    </button>
                  )}
                </div>
              </div>

              {/* Descrição */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Descrição</p>
                <input
                  ref={descRef}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && amtRef.current?.focus()}
                  placeholder={type === 'receita' ? 'Ex: Mensalidade, implantação...' : 'Ex: Aluguel, servidor, marketing...'}
                  className="w-full bg-muted/30 border border-border/60 rounded-xl px-4 h-12 text-sm outline-none focus:border-primary/40 focus:bg-background transition-all placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Valor */}
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground select-none pointer-events-none">R$</span>
                <input
                  ref={amtRef}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={e => setAmount(formatBRLInput(e.target.value))}
                  className="w-full pl-12 h-16 bg-muted/30 border border-border/60 rounded-xl text-3xl font-bold outline-none focus:border-primary/40 focus:bg-background transition-all tracking-tight"
                />
              </div>
            </div>
          )}

          {/* ── Vínculo: cliente na receita, canal na despesa ── */}
          {etapa === 'vinculo' && type === 'receita' && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <h2 className="text-2xl font-bold tracking-tight">De qual cliente?</h2>
                <p className="text-sm text-muted-foreground mt-1">Vincular a receita a um cliente é opcional</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setClientId('')}
                  className={cn('flex flex-col items-start px-4 py-3 rounded-xl border text-left transition-all',
                    !clientId ? 'border-primary bg-primary/8 text-primary' : 'border-border hover:bg-muted/30')}>
                  <p className="font-semibold text-sm">Nenhum</p>
                  <p className={cn('text-xs mt-0.5', !clientId ? 'text-primary/70' : 'text-muted-foreground')}>Receita avulsa</p>
                </button>
                <div className={cn('flex flex-col items-start px-4 py-3 rounded-xl border text-left',
                  clientId ? 'border-primary bg-primary/8 text-primary' : 'border-border')}>
                  <p className="font-semibold text-sm">Cliente</p>
                  <p className={cn('text-xs mt-0.5 truncate max-w-full', clientId ? 'text-primary/70' : 'text-muted-foreground')}>
                    {clients.find(c => c.id === clientId)?.company_name ?? 'Escolha abaixo'}
                  </p>
                </div>
              </div>

              {clients.length > 0 ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                      value={buscaCliente}
                      onChange={(e) => setBuscaCliente(e.target.value)}
                      placeholder="Buscar pelo nome..."
                      className="w-full h-11 pl-9 pr-3 rounded-xl bg-muted/30 border border-border text-sm outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>
                  {(() => {
                    const busca = buscaCliente.trim().toLowerCase();
                    const achados = busca
                      ? clients.filter(c => (c.company_name ?? '').toLowerCase().includes(busca))
                      : clients;
                    if (achados.length === 0) {
                      return <p className="text-sm text-muted-foreground text-center py-6">Nenhum cliente com esse nome.</p>;
                    }
                    return (
                      <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto">
                        {achados.map(c => {
                          const selected = clientId === c.id;
                          return (
                            <button key={c.id} type="button"
                              onClick={() => setClientId(selected ? '' : c.id)}
                              className={cn(
                                'flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition-all',
                                selected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/40 text-foreground',
                              )}>
                              <div className={cn('h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all', selected ? 'border-primary bg-primary' : 'border-muted-foreground/30')}>
                                {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                              {c.company_name}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum cliente cadastrado.</p>
              )}
            </div>
          )}

          {etapa === 'vinculo' && type === 'despesa' && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <h2 className="text-2xl font-bold tracking-tight">É custo de aquisição?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Marcando o canal, esta despesa entra no CAC dele em Relatórios → Canais.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => setChannelId('')}
                  className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-medium transition-all text-left',
                    !channelId ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/40 text-foreground')}>
                  <span className="truncate">Não, despesa comum</span>
                </button>
                {canais.map(c => (
                  <button key={c.id} type="button" onClick={() => setChannelId(c.id === channelId ? '' : c.id)}
                    className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-medium transition-all text-left',
                      c.id === channelId ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/40 text-foreground')}>
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color || '#64748b' }} />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Data + Status + Recorrência + Extras ── */}
          {etapa === 'quando' && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <h2 className="text-2xl font-bold tracking-tight">Quando e como?</h2>
                <p className="text-sm text-muted-foreground mt-1 truncate max-w-xs mx-auto">{description}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Vencimento</p>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-11 rounded-xl" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Competência</p>
                  <Input type="date" value={competenceDate} onChange={e => setCompetenceDate(e.target.value)} className="h-11 rounded-xl" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">Competência é o mês a que o resultado pertence.</p>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {(type === 'receita'
                    ? [{ v: 'pendente' as const, label: 'A Receber', Icon: Clock, c: 'text-orange-500', bg: 'bg-orange-500/10', b: 'border-orange-500/40' }, { v: 'pago' as const, label: 'Recebido', Icon: CheckCircle2, c: 'text-emerald-500', bg: 'bg-emerald-500/10', b: 'border-emerald-500/40' }]
                    : [{ v: 'pendente' as const, label: 'A Pagar', Icon: Clock, c: 'text-orange-500', bg: 'bg-orange-500/10', b: 'border-orange-500/40' }, { v: 'pago' as const, label: 'Já Paguei', Icon: CheckCircle2, c: 'text-emerald-500', bg: 'bg-emerald-500/10', b: 'border-emerald-500/40' }]
                  ).map(opt => {
                    const active = status === opt.v;
                    return (
                      <button key={opt.v} type="button" onClick={() => setStatus(opt.v)}
                        className={cn('flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all', active ? `${opt.bg} ${opt.b} ${opt.c}` : 'border-border hover:bg-muted/40')}>
                        <opt.Icon className={cn('h-4 w-4', active ? opt.c : 'text-muted-foreground')} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {status === 'pago' && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Data de {type === 'receita' ? 'Recebimento' : 'Pagamento'}</p>
                    <Input type="date" value={paymentDate || dueDate} onChange={e => setPaymentDate(e.target.value)} className="h-11 rounded-xl" />
                  </div>
                )}
              </div>

              {!isEdit && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Recorrência</p>
                  <div className="grid grid-cols-2 gap-2">
                    {RECURRENCE_TYPES.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setRecurrence(opt.value)}
                        className={cn(
                          'flex flex-col items-start px-4 py-3 rounded-xl border text-sm transition-all text-left',
                          recurrence === opt.value ? 'border-primary bg-primary/8 text-primary' : 'border-border hover:bg-muted/30'
                        )}>
                        <p className="font-semibold">{opt.label}</p>
                        <p className={cn('text-xs mt-0.5', recurrence === opt.value ? 'text-primary/70' : 'text-muted-foreground')}>{opt.desc}</p>
                      </button>
                    ))}
                  </div>

                  {recurrence === 'parcelada' && (
                    <div className="mt-3 p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3">
                      <p className="text-sm font-medium">Em quantas parcelas?</p>
                      <div className="flex items-center gap-3">
                        <input
                          type="number" min="2" max="120"
                          value={parcelas}
                          onChange={e => setParcelas(e.target.value.replace(/\D/g, ''))}
                          className="w-24 h-10 text-center bg-background border border-border/60 rounded-xl text-lg font-bold outline-none focus:border-primary/40 transition-all"
                        />
                        <span className="text-sm text-muted-foreground">
                          parcelas
                          {(parseBRLInput(amount) ?? 0) > 0 && (
                            <span className="ml-1 text-primary font-medium">
                              (de {fmt((parseBRLInput(amount) ?? 0) / Math.max(2, Number(parcelas) || 2))})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Observações (opcional)</p>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Notas adicionais..."
                  className="w-full bg-muted/30 border border-border/60 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary/40 transition-all placeholder:text-muted-foreground/50 resize-none" />
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-7 pb-7 pt-3 flex items-center gap-3 shrink-0 border-t border-border/40">
          {step > 0 && (
            <button type="button" onClick={() => setStep(s => s - 1)}
              className="h-12 px-5 rounded-xl border border-border text-sm font-medium hover:bg-muted/40 transition-colors shrink-0">
              Voltar
            </button>
          )}
          {!ultima ? (
            etapa !== 'tipo' && (
              <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}
                className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 transition-all hover:brightness-110 flex items-center justify-center gap-2">
                Continuar <ChevronRight className="h-4 w-4" />
              </button>
            )
          ) : (
            <button type="button" onClick={handleSave} disabled={saving || !description || !amount}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 transition-all hover:brightness-110">
              {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Registrar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Badge de status ─────────────────────────────────────────────────────────
function StatusBadge({ status, type }: { status: string; type?: string }) {
  // Na receita, "A Receber" em vez de "Pendente" e "Recebido" em vez de "Pago"
  if (type === 'receita') {
    if (status === 'pendente') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-600 dark:text-yellow-400">
          <Clock className="h-3 w-3" />A Receber
        </span>
      );
    }
    if (status === 'pago') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" />Recebido
        </span>
      );
    }
  }
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pendente;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Tabela de transações ─────────────────────────────────────────────────────
function TransactionTable({
  items, onPay, onEdit, onDelete, emptyIcon, emptyMsg, naEmpresa,
}: {
  items: FinTransaction[];
  onPay: (t: FinTransaction) => void;
  onEdit: (t: FinTransaction) => void;
  onDelete: (t: FinTransaction) => void;
  emptyIcon: React.ReactNode;
  emptyMsg: string;
  naEmpresa: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="text-muted-foreground/50 mb-3">{emptyIcon}</div>
        <p className="text-muted-foreground text-sm">{emptyMsg}</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="whitespace-nowrap">Vencimento</TableHead>
          <TableHead className="whitespace-nowrap">Descrição</TableHead>
          <TableHead className="whitespace-nowrap hidden sm:table-cell">Categoria</TableHead>
          <TableHead className="whitespace-nowrap">Status</TableHead>
          <TableHead className="text-right whitespace-nowrap">Valor</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(t => {
          /* Na Empresa a lista junta as duas frentes e os custos gerais. Só o
             custo geral se mexe aqui — lançamento de uma frente se edita
             dentro dela (o banco também só deixa assim). */
          const cobranca = ehCobranca(t);
          const daqui = !cobranca && (!naEmpresa || t.frente === 'empresa');
          const st = statusDe(t);
          const sub = [
            naEmpresa ? (t.frente === 'empresa' ? 'Custo geral' : rotuloDaFrente(t.frente)) : null,
            t.client?.company_name ?? null,
            cobranca ? 'Cobrança do Asaas' : null,
          ].filter(Boolean).join(' · ');
          return (
            <TableRow key={t.id}>
              <TableCell className="text-sm">
                <div>{fmtDate(t.due_date)}</div>
                {t.total_installments && t.total_installments > 1 && (
                  <div className="text-xs text-muted-foreground">{t.installment_number}/{t.total_installments}</div>
                )}
                {(t.recurrence === 'mensal' || t.recurrence === 'trimestral' || t.recurrence === 'anual') && (
                  <div className="text-xs text-blue-500 flex items-center gap-0.5"><Repeat className="h-2.5 w-2.5" /> {t.recurrence}</div>
                )}
              </TableCell>
              <TableCell>
                <div className="font-medium text-sm">{t.description}</div>
                {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {t.category ? (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.category.color }} />
                    {t.category.name}
                  </span>
                ) : <span className="text-muted-foreground text-xs">—</span>}
              </TableCell>
              <TableCell><StatusBadge status={st} type={t.type} /></TableCell>
              <TableCell className={`text-right font-semibold text-sm whitespace-nowrap ${t.type === 'receita' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {t.type === 'despesa' ? '-' : ''}{fmt(valor(t))}
              </TableCell>
              <TableCell>
                <div className={cn('flex items-center justify-end gap-1', !daqui && 'invisible')}>
                  {t.status !== 'pago' && t.status !== 'cancelado' && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-500/10" title={t.type === 'receita' ? 'Marcar como recebido' : 'Marcar como pago'} onClick={() => onPay(t)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Editar" onClick={() => onEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Excluir" onClick={() => onDelete(t)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </div>
  );
}

const Spinner = () => (
  <div className="flex items-center justify-center py-10">
    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
  </div>
);

const PERIOD_LABELS: Record<string, string> = {
  semana: 'Última Semana', mes: 'Este Mês', mes_passado: 'Mês Passado',
  trimestre: 'Este Trimestre', ano: 'Este Ano', todo: 'Todo o Período', personalizado: 'Personalizado',
};

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Financeiro() {
  const navigate = useNavigate();
  const { frente } = useFrente();
  const naEmpresa = frente === 'empresa';
  const { data: transacoes = [], isLoading } = useFinTransactions();
  const { data: payments = [] } = usePayments();
  const atualizar = useUpdateFinTransaction();
  const remover = useDeleteFinTransaction();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinTransaction | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [filterPeriod, setFilterPeriod] = useState<string>('mes');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [receitaGroupFilter, setReceitaGroupFilter] = useState<string | null>(null);
  const [despesaGroupFilter, setDespesaGroupFilter] = useState<string | null>(null);
  const [tab, setTab] = useState('receitas');
  const [regimeDre, setRegimeDre] = useState<'caixa' | 'competencia'>('caixa');

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t: FinTransaction) => { setEditing(t); setFormOpen(true); };

  const markAsPaid = async (t: FinTransaction) => {
    try {
      await atualizar.mutateAsync({ id: t.id, status: 'pago', payment_date: hoje() });
      toast.success(t.type === 'receita' ? 'Recebimento confirmado' : 'Pagamento confirmado');
    } catch (e) {
      toast.error('Não consegui atualizar', { description: (e as Error).message });
    }
  };

  const handleDelete = async (t: FinTransaction) => {
    if (!confirm(`Excluir "${t.description}"?`)) return;
    try {
      await remover.mutateAsync(t.id);
      toast.success('Lançamento excluído');
    } catch (e) {
      toast.error('Não consegui excluir', { description: (e as Error).message });
    }
  };

  const { start, end } = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const fmt2 = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    switch (filterPeriod) {
      case 'semana': { const d = now.getDate(); const dow = now.getDay(); return { start: fmt2(new Date(y, m, d - dow)), end: fmt2(new Date(y, m, d - dow + 6)) }; }
      case 'mes': return { start: fmt2(new Date(y, m, 1)), end: fmt2(new Date(y, m + 1, 0)) };
      case 'mes_passado': return { start: fmt2(new Date(y, m - 1, 1)), end: fmt2(new Date(y, m, 0)) };
      case 'trimestre': { const q = Math.floor(m / 3); return { start: fmt2(new Date(y, q * 3, 1)), end: fmt2(new Date(y, q * 3 + 3, 0)) }; }
      case 'ano': return { start: `${y}-01-01`, end: `${y}-12-31` };
      case 'personalizado': return { start: customStart || `${y}-01-01`, end: customEnd || `${y}-12-31` };
      case 'todo': return { start: '2000-01-01', end: '2099-12-31' };
      default: return { start: fmt2(new Date(y, m, 1)), end: fmt2(new Date(y, m + 1, 0)) };
    }
  }, [filterPeriod, customStart, customEnd]);

  const lancamentos = useMemo(() => transacoes.filter(t => t.status !== 'cancelado'), [transacoes]);
  const mensalidades = useMemo(
    () => payments.filter(p => p.status !== 'cancelado' && !!p.due_date).map(cobrancaComoLancamento),
    [payments],
  );
  const vivas = useMemo(() => [...lancamentos, ...mensalidades], [lancamentos, mensalidades]);
  const { data: clients = [] } = useClients();
  const carteira = useMemo(() => mrrDaCarteira(clients, payments), [clients, payments]);
  const doPeriodo = useMemo(
    () => vivas.filter(t => !!t.due_date && t.due_date >= start && t.due_date <= end),
    [vivas, start, end],
  );
  const filtrados = useMemo(
    () => doPeriodo.filter(t => filterStatus === 'todos' || statusDe(t) === filterStatus),
    [doPeriodo, filterStatus],
  );

  const receber = useMemo(() => filtrados.filter(t => t.type === 'receita'), [filtrados]);
  const despesas = useMemo(() => filtrados.filter(t => t.type === 'despesa'), [filtrados]);
  const filteredReceber = useMemo(() => receitaGroupFilter ? receber.filter(t => getCatGroup(t.category?.name, 'receita')?.label === receitaGroupFilter) : receber, [receber, receitaGroupFilter]);
  const filteredDespesas = useMemo(() => despesaGroupFilter ? despesas.filter(t => getCatGroup(t.category?.name, 'despesa')?.label === despesaGroupFilter) : despesas, [despesas, despesaGroupFilter]);

  const somar = (l: FinTransaction[]) => l.reduce((s, t) => s + valor(t), 0);

  const filteredStats = useMemo(() => {
    const rec = doPeriodo.filter(t => t.type === 'receita');
    const desp = doPeriodo.filter(t => t.type === 'despesa');
    const totalRecebido = somar(rec.filter(t => t.status === 'pago'));
    const totalPago = somar(desp.filter(t => t.status === 'pago'));
    return {
      totalReceber: somar(rec.filter(t => t.status !== 'pago')),
      totalPagar: somar(desp.filter(t => t.status !== 'pago')),
      vencidosReceber: somar(rec.filter(vencido)),
      vencidosPagar: somar(desp.filter(vencido)),
      receitaMes: totalRecebido, despesaMes: totalPago, saldoMes: totalRecebido - totalPago,
    };
  }, [doPeriodo]);

  const saldoGeral = useMemo(
    () => somar(vivas.filter(t => t.type === 'receita' && t.status === 'pago'))
        - somar(vivas.filter(t => t.type === 'despesa' && t.status === 'pago')),
    [vivas],
  );

  /* ── O aviso: um slot só, vencidos primeiro, depois os próximos 7 dias ── */
  const acao = useMemo(() => {
    const h = hoje();
    const vencidas = [
      ...lancamentos.filter(vencido).map(t => ({ valor: valor(t), data: t.due_date, cobranca: false })),
      ...payments
        .filter(p => p.status !== 'pago' && p.status !== 'cancelado' && !!p.due_date && p.due_date < h)
        .map(p => ({ valor: Number(p.amount) || 0, data: p.due_date, cobranca: true })),
    ];
    if (vencidas.length > 0) {
      const maisVelha = vencidas.reduce((a, b) => (a.data < b.data ? a : b));
      return {
        tom: 'critico' as const,
        total: vencidas.reduce((s, v) => s + v.valor, 0),
        n: vencidas.length,
        detalhe: `o mais velho há ${dias(maisVelha.data, h)} dias`,
        temCobranca: vencidas.some(v => v.cobranca),
      };
    }
    const limite = emDias(7);
    const proximas = [
      ...lancamentos.filter(t => t.status === 'pendente' && t.due_date >= h && t.due_date <= limite)
        .map(t => ({ valor: valor(t), cobranca: false })),
      ...payments.filter(p => p.status !== 'pago' && p.status !== 'cancelado' && !!p.due_date && p.due_date >= h && p.due_date <= limite)
        .map(p => ({ valor: Number(p.amount) || 0, cobranca: true })),
    ];
    if (proximas.length > 0) {
      return {
        tom: 'atencao' as const,
        total: proximas.reduce((s, v) => s + v.valor, 0),
        n: proximas.length,
        detalhe: 'nos próximos 7 dias',
        temCobranca: proximas.some(v => v.cobranca),
      };
    }
    return null;
  }, [lancamentos, payments]);

  const abrirAviso = () => {
    if (!acao) return;
    if (acao.temCobranca) { navigate('/pagamentos'); return; }
    if (acao.tom === 'critico') { setFilterStatus('vencido'); setFilterPeriod('todo'); }
    else { setFilterStatus('pendente'); }
    setTab('fluxo');
  };

  // Recorrentes e parcelamentos das despesas
  const recurringItems = useMemo(() => despesas.filter(t => t.recurrence === 'mensal' || t.recurrence === 'trimestral' || t.recurrence === 'anual'), [despesas]);
  const installmentItems = useMemo(() => despesas.filter(t => t.recurrence === 'parcelada' && (t.total_installments ?? 1) > 1), [despesas]);

  // DRE por mês: realizado (caixa) ou por competência
  const dre = useMemo(() => {
    const map: Record<string, { receita: number; despesa: number }> = {};
    const base = regimeDre === 'caixa' ? vivas.filter(t => t.status === 'pago') : vivas;
    base.forEach(t => {
      const data = regimeDre === 'caixa' ? (t.payment_date || t.due_date) : t.competence_date;
      if (!data) return;
      const m = data.slice(0, 7);
      if (!map[m]) map[m] = { receita: 0, despesa: 0 };
      map[m][t.type] += valor(t);
    });
    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, v]) => ({
        month,
        label: new Date(month + '-01T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        receita: v.receita, despesa: v.despesa, resultado: v.receita - v.despesa,
      }));
  }, [vivas, regimeDre]);

  const porCategoria = (tipo: 'receita' | 'despesa') => {
    const lista = doPeriodo.filter(t => t.type === tipo);
    const byCat: Record<string, { name: string; color: string; total: number; pago: number; pendente: number; count: number }> = {};
    lista.forEach(t => {
      const catId = t.category_id || '__sem_categoria__';
      if (!byCat[catId]) byCat[catId] = {
        name: t.category?.name || 'Sem categoria',
        color: t.category?.color || (tipo === 'receita' ? '#22c55e' : '#6B7280'),
        total: 0, pago: 0, pendente: 0, count: 0,
      };
      byCat[catId].total += valor(t);
      byCat[catId].count += 1;
      if (t.status === 'pago') byCat[catId].pago += valor(t);
      else byCat[catId].pendente += valor(t);
    });
    const totalGeral = somar(lista);
    return Object.entries(byCat)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([id, v]) => ({ id, ...v, percent: totalGeral > 0 ? (v.total / totalGeral) * 100 : 0 }));
  };
  const receitasPorCategoria = useMemo(() => porCategoria('receita'), [doPeriodo]); // eslint-disable-line react-hooks/exhaustive-deps
  const despesasPorCategoria = useMemo(() => porCategoria('despesa'), [doPeriodo]); // eslint-disable-line react-hooks/exhaustive-deps

  const fluxo = useMemo(() => [...filtrados].sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? '')), [filtrados]);

  const GroupChips = ({ tipo, value, onChange }: { tipo: 'receita' | 'despesa'; value: string | null; onChange: (v: string | null) => void }) => (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
      <button onClick={() => onChange(null)}
        className={cn('shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border whitespace-nowrap',
          value === null ? 'bg-foreground/90 text-background border-transparent' : 'border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground')}>
        Todos
      </button>
      {CAT_GROUPS[tipo].map(g => (
        <button key={g.label} onClick={() => onChange(value === g.label ? null : g.label)}
          className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border whitespace-nowrap"
          style={value === g.label
            ? { backgroundColor: g.color, borderColor: g.color, color: '#fff' }
            : { borderColor: g.color + '50', color: g.color + 'cc' }}>
          {g.label}
        </button>
      ))}
    </div>
  );

  const CategoryReport = ({ tipo, items }: { tipo: 'receita' | 'despesa'; items: ReturnType<typeof porCategoria> }) => (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold">{tipo === 'receita' ? 'Receitas' : 'Despesas'} por Categoria — {PERIOD_LABELS[filterPeriod] ?? 'Período'}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{item.name}</span>
                  <span className={cn('text-sm font-bold', tipo === 'receita' ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>{fmt(item.total)}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground">{item.count} lançamento{item.count !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-muted-foreground">{item.percent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
                  <div className="h-1.5 rounded-full" style={{ width: `${item.percent}%`, backgroundColor: item.color }} />
                </div>
                {tipo === 'receita' && (
                  <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>Recebido: {fmt(item.pago)}</span>
                    <span>A receber: {fmt(item.pendente)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const totalDre = dre.reduce((s, r) => ({ receita: s.receita + r.receita, despesa: s.despesa + r.despesa, resultado: s.resultado + r.resultado }), { receita: 0, despesa: 0, resultado: 0 });

  return (
    <main className="max-w-5xl space-y-5">

      {/* ── Hero ── */}
      <div className="pt-2 pb-1">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div>
        <p className="text-[11px] font-medium text-foreground/30 uppercase tracking-[0.2em] mb-3">Resultado do período</p>
        <p className={`text-[1.8rem] sm:text-[2.6rem] font-semibold tabular-nums tracking-tight leading-none break-all ${filteredStats.saldoMes >= 0 ? 'text-green-500' : 'text-red-400'}`}>
          {fmt(filteredStats.saldoMes)}
        </p>
        <p className="text-xs text-foreground/30 mt-2.5">
          Saldo histórico acumulado: <span className={`font-medium ${saldoGeral >= 0 ? 'text-green-500/70' : 'text-red-400/70'}`}>{fmt(saldoGeral)}</span>
        </p>
        </div>
        <button type="button" onClick={() => navigate('/clientes')} className="text-left sm:text-right group">
          <div className="flex gap-8 sm:justify-end">
            <div>
              <p className="text-[11px] font-medium text-foreground/30 uppercase tracking-[0.2em] mb-3">MRR total</p>
              <p className="text-[1.8rem] sm:text-[2.6rem] font-semibold tabular-nums tracking-tight leading-none text-foreground">
                {fmt(carteira.mrr + carteira.aguardando)}
              </p>
              <p className="text-xs text-foreground/30 mt-2.5">
                {carteira.contas + carteira.contasAguardando} {carteira.contas + carteira.contasAguardando === 1 ? 'cliente' : 'clientes'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-foreground/30 uppercase tracking-[0.2em] mb-3">MRR recebido</p>
              <p className="text-[1.8rem] sm:text-[2.6rem] font-semibold tabular-nums tracking-tight leading-none text-primary">
                {fmt(carteira.mrr)}
              </p>
              <p className="text-xs text-foreground/30 mt-2.5 group-hover:text-foreground/50 transition-colors">
                {carteira.contas} {carteira.contas === 1 ? 'cliente pagando' : 'clientes pagando'}
              </p>
            </div>
          </div>
        </button>
        </div>

        {/* 4 KPIs em linha */}
        <div className="mt-5 pt-4 border-t border-black/[0.07] dark:border-foreground/[0.07] grid grid-cols-2 sm:grid-cols-4 gap-y-3">
          {[
            { label: 'A Receber', value: filteredStats.totalReceber, color: 'text-green-500', sub: filteredStats.vencidosReceber > 0 ? `${fmt(filteredStats.vencidosReceber)} vencido` : 'pendente', subColor: filteredStats.vencidosReceber > 0 ? 'text-red-400' : 'text-foreground/25' },
            { label: 'Recebido', value: filteredStats.receitaMes, color: 'text-green-500', sub: 'no período', subColor: 'text-foreground/25' },
            { label: 'A Pagar', value: filteredStats.totalPagar, color: 'text-red-400', sub: filteredStats.vencidosPagar > 0 ? `${fmt(filteredStats.vencidosPagar)} vencido` : 'pendente', subColor: filteredStats.vencidosPagar > 0 ? 'text-red-500' : 'text-foreground/25' },
            { label: 'Pago', value: filteredStats.despesaMes, color: 'text-red-400', sub: 'no período', subColor: 'text-foreground/25' },
          ].map((kpi, i) => (
            <div key={i} className={i === 2 ? 'sm:pl-6 sm:border-l sm:border-black/[0.07] sm:dark:border-foreground/[0.07]' : ''}>
              <p className="text-[10px] font-medium text-foreground/35 uppercase tracking-wider mb-1">{kpi.label}</p>
              <p className={`text-base font-semibold tabular-nums ${kpi.color}`}>{fmt(kpi.value)}</p>
              <p className={`text-[10px] mt-0.5 ${kpi.subColor}`}>{kpi.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Novo Lançamento ── */}
      <div className="flex">
        <button
          onClick={openNew}
          className="flex items-center gap-2 h-9 px-5 rounded-full bg-primary/90 hover:bg-primary text-primary-foreground text-[13px] font-medium transition-all hover:shadow-md hover:shadow-primary/20 active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" />
          {naEmpresa ? 'Novo custo geral' : 'Novo Lançamento'}
        </button>
      </div>

      {/* ── O aviso: só quando há o que fazer ── */}
      {acao && (
        <button
          onClick={abrirAviso}
          className={cn(
            'w-full min-h-11 py-2.5 px-4 rounded-xl flex items-center gap-3 text-left transition-colors',
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

      {/* ── Filtros ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <DateRangeSelector
          value={filterPeriod}
          onChange={setFilterPeriod}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStart={setCustomStart}
          onCustomEnd={setCustomEnd}
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Todos status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="pago">Pago / Recebido</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Abas ── */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="flex items-center gap-1 p-1 bg-black/[0.02] dark:bg-foreground/[0.03] border border-black/[0.08] dark:border-foreground/[0.06] rounded-2xl h-auto w-max">
            {[
              { value: 'receitas', icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'Receitas' },
              { value: 'despesas', icon: <TrendingDown className="h-3.5 w-3.5" />, label: 'Despesas' },
              { value: 'fluxo', icon: <DollarSign className="h-3.5 w-3.5" />, label: 'Fluxo' },
              { value: 'dre', icon: <BarChart3 className="h-3.5 w-3.5" />, label: 'DRE' },
            ].map(t => (
              <TabsTrigger key={t.value} value={t.value} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all duration-200 whitespace-nowrap data-[state=active]:bg-white dark:data-[state=active]:bg-foreground/[0.10] data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-foreground/40 data-[state=inactive]:hover:text-foreground/70">
                {t.icon}{t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* RECEITAS */}
        <TabsContent value="receitas">
          <div className="space-y-4">
            <GroupChips tipo="receita" value={receitaGroupFilter} onChange={setReceitaGroupFilter} />

            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-sm font-semibold text-green-600 dark:text-green-400">
                  Receitas — {filteredReceber.filter(t => t.status !== 'pago').length} a receber
                </CardTitle>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">{fmt(somar(filteredReceber.filter(t => t.status !== 'pago')))}</span>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? <Spinner /> : (
                  <TransactionTable items={filteredReceber} onPay={markAsPaid} onEdit={openEdit} onDelete={handleDelete} naEmpresa={naEmpresa} emptyIcon={<TrendingUp className="h-10 w-10" />} emptyMsg="Nenhuma receita no período" />
                )}
              </CardContent>
            </Card>

            {receitasPorCategoria.length > 0 && <CategoryReport tipo="receita" items={receitasPorCategoria} />}
          </div>
        </TabsContent>

        {/* DESPESAS */}
        <TabsContent value="despesas">
          <div className="space-y-4">
            <GroupChips tipo="despesa" value={despesaGroupFilter} onChange={setDespesaGroupFilter} />

            {/* Recorrentes & Parcelamentos */}
            {(recurringItems.length > 0 || installmentItems.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recurringItems.length > 0 && (
                  <Card className="border-blue-500/20">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <Repeat className="h-3.5 w-3.5 text-blue-500" /> Despesas Recorrentes / Fixas
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-border">
                        {recurringItems.slice(0, 10).map(t => (
                          <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
                            <div>
                              <p className="text-sm font-medium">{t.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {t.recurrence}{t.total_installments ? ` · ${t.installment_number}/${t.total_installments}` : ''} · {t.category?.name || 'Sem cat.'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-red-500">{fmt(valor(t))}</p>
                              <StatusBadge status={statusDe(t)} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {installmentItems.length > 0 && (
                  <Card className="border-purple-500/20">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-purple-500" /> Parcelamentos
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-border">
                        {installmentItems.slice(0, 10).map(t => (
                          <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
                            <div>
                              <p className="text-sm font-medium">{t.description}</p>
                              <p className="text-xs text-muted-foreground">{t.installment_number}/{t.total_installments} · {fmtDate(t.due_date)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-red-500">{fmt(valor(t))}</p>
                              <StatusBadge status={statusDe(t)} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-sm font-semibold text-red-500">
                  Despesas — {filteredDespesas.filter(t => t.status !== 'pago').length} pendente(s)
                </CardTitle>
                <span className="text-sm font-bold text-red-500">{fmt(somar(filteredDespesas.filter(t => t.status !== 'pago')))}</span>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? <Spinner /> : (
                  <TransactionTable items={filteredDespesas} onPay={markAsPaid} onEdit={openEdit} onDelete={handleDelete} naEmpresa={naEmpresa} emptyIcon={<TrendingDown className="h-10 w-10" />} emptyMsg="Nenhuma despesa no período" />
                )}
              </CardContent>
            </Card>

            {despesasPorCategoria.length > 0 && <CategoryReport tipo="despesa" items={despesasPorCategoria} />}
          </div>
        </TabsContent>

        {/* FLUXO */}
        <TabsContent value="fluxo">
          <Card>
            <CardHeader><CardTitle className="text-base">Fluxo de Caixa — Todos os Lançamentos</CardTitle></CardHeader>
            <CardContent className="p-0">
              {isLoading ? <Spinner /> : (
                <TransactionTable items={fluxo} onPay={markAsPaid} onEdit={openEdit} onDelete={handleDelete} naEmpresa={naEmpresa} emptyIcon={<DollarSign className="h-10 w-10" />} emptyMsg="Nenhum lançamento encontrado" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DRE */}
        <TabsContent value="dre">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">
                DRE — Demonstrativo de Resultados ({regimeDre === 'caixa' ? 'Realizado' : 'Competência'})
              </CardTitle>
              {/* Caixa: quando o dinheiro andou. Competência: o mês a que o
                  resultado pertence. O admin sempre separou os dois. */}
              <div className="flex p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.05]">
                {([['caixa', 'Realizado'], ['competencia', 'Competência']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setRegimeDre(v)}
                    className={cn('h-7 px-3 rounded-md text-[12px] font-medium transition-colors',
                      regimeDre === v ? 'bg-background text-foreground shadow-sm' : 'text-foreground/40')}>
                    {l}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {dre.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <BarChart3 className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground text-sm">
                    {regimeDre === 'caixa' ? 'Nenhum lançamento pago para gerar DRE' : 'Nenhum lançamento para gerar DRE'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right text-green-600">Receitas</TableHead>
                    <TableHead className="text-right text-red-500">Despesas</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {dre.map(row => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium text-sm capitalize">{row.label}</TableCell>
                        <TableCell className="text-right text-sm text-green-600 dark:text-green-400 font-medium">{fmt(row.receita)}</TableCell>
                        <TableCell className="text-right text-sm text-red-500 font-medium">{fmt(row.despesa)}</TableCell>
                        <TableCell className={`text-right text-sm font-bold ${row.resultado >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{fmt(row.resultado)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{row.receita > 0 ? ((row.resultado / row.receita) * 100).toFixed(1) + '%' : '—'}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="text-sm">TOTAL</TableCell>
                      <TableCell className="text-right text-sm text-green-600 dark:text-green-400">{fmt(totalDre.receita)}</TableCell>
                      <TableCell className="text-right text-sm text-red-500">{fmt(totalDre.despesa)}</TableCell>
                      <TableCell className={`text-right text-sm font-bold ${totalDre.resultado >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                        {fmt(totalDre.resultado)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {totalDre.receita > 0 ? ((totalDre.resultado / totalDre.receita) * 100).toFixed(1) + '%' : '—'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>


      {/* Formulário */}
      {formOpen && (
        <LaunchWizard
          onClose={() => { setFormOpen(false); setEditing(null); }}
          initial={editing}
        />
      )}
    </main>
  );
}

