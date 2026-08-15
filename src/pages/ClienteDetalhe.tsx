import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, CreditCard, ShieldCheck, Ticket,
  Plus, Pencil, Trash2, CheckCircle2, Clock, AlertCircle,
  X, Key, Mail, Phone, MoreHorizontal, Ban, RefreshCw,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CLIENTES_MOCK } from './Clientes';
import { fmt, fmtDate, cn } from '@/lib/utils';

const USERS_MOCK: Record<string, any[]> = {
  '1': [
    { id: 'u1', nome: 'Carlos Silva',    email: 'carlos@itruck.com.br',   role: 'admin',    ativo: true,  ultimoAcesso: '2026-08-14' },
    { id: 'u2', nome: 'Ana Oliveira',    email: 'ana@itruck.com.br',      role: 'vendedor', ativo: true,  ultimoAcesso: '2026-08-13' },
    { id: 'u3', nome: 'Rafael Costa',   email: 'rafael@itruck.com.br',   role: 'vendedor', ativo: true,  ultimoAcesso: '2026-08-12' },
    { id: 'u4', nome: 'Mariana Lopes',  email: 'mariana@itruck.com.br',  role: 'financeiro',ativo: false, ultimoAcesso: '2026-07-30' },
  ],
};

const PAGAMENTOS_MOCK: Record<string, any[]> = {
  '1': [
    { id: 'p1', mes: 'Agosto/2026',    valor: 3200, status: 'pago',    data: '2026-08-01', metodo: 'Pix' },
    { id: 'p2', mes: 'Julho/2026',     valor: 3200, status: 'pago',    data: '2026-07-01', metodo: 'Boleto' },
    { id: 'p3', mes: 'Junho/2026',     valor: 3200, status: 'pago',    data: '2026-06-01', metodo: 'Boleto' },
    { id: 'p4', mes: 'Maio/2026',      valor: 2900, status: 'pago',    data: '2026-05-01', metodo: 'Pix' },
  ],
};

const TICKETS_MOCK: Record<string, any[]> = {
  '1': [
    { id: 'T-041', assunto: 'Erro ao subir anúncio no marketplace', prioridade: 'alta',  status: 'aberto',    criado: '2026-08-14', mensagens: 2 },
    { id: 'T-035', assunto: 'Dúvida sobre módulo financeiro',       prioridade: 'baixa', status: 'resolvido', criado: '2026-07-20', mensagens: 5 },
  ],
};

const PLANOS = ['Starter', 'Basic', 'Pro', 'Enterprise'];

const ROLE_LABEL: Record<string, string> = {
  admin:      'Admin',
  vendedor:   'Vendedor',
  financeiro: 'Financeiro',
  viewer:     'Visualizador',
};

const STATUS_PAG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pago:     { label: 'Pago',     color: 'bg-green-500/15 text-green-600 dark:text-green-400',   icon: <CheckCircle2 className="h-3 w-3" /> },
  pendente: { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',icon: <Clock className="h-3 w-3" /> },
  vencido:  { label: 'Vencido',  color: 'bg-red-500/15 text-red-500',                           icon: <AlertCircle className="h-3 w-3" /> },
};

const PRIO_COLOR: Record<string, string> = {
  alta:  'bg-red-500/15 text-red-500',
  media: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  baixa: 'bg-green-500/15 text-green-600 dark:text-green-400',
};

const STICKER_COLOR: Record<string, string> = {
  aberto:     'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  respondido: 'bg-blue-500/15 text-blue-500',
  resolvido:  'bg-muted text-muted-foreground',
};

export default function ClienteDetalhe() {
  const { id = '1' } = useParams();
  const navigate = useNavigate();
  const cliente = CLIENTES_MOCK.find(c => c.id === id) ?? CLIENTES_MOCK[0];
  const users = USERS_MOCK[id] ?? USERS_MOCK['1'];
  const pagamentos = PAGAMENTOS_MOCK[id] ?? PAGAMENTOS_MOCK['1'];
  const tickets = TICKETS_MOCK[id] ?? TICKETS_MOCK['1'];

  const [plano, setPlano] = useState(cliente.plano);
  const [acessoAtivo, setAcessoAtivo] = useState(cliente.status === 'active');
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [usersList, setUsersList] = useState(users);

  const [newUser, setNewUser] = useState({ nome: '', email: '', role: 'vendedor' });
  const [newTicket, setNewTicket] = useState({ assunto: '', descricao: '', prioridade: 'media' });

  const totalPago = pagamentos.filter(p => p.status === 'pago').reduce((s: number, p: any) => s + p.valor, 0);

  function handleAddUser() {
    setUsersList(prev => [...prev, { id: `u${Date.now()}`, ...newUser, ativo: true, ultimoAcesso: '—' }]);
    setNewUser({ nome: '', email: '', role: 'vendedor' });
    setAddUserOpen(false);
  }

  function toggleUserAtivo(userId: string) {
    setUsersList(prev => prev.map(u => u.id === userId ? { ...u, ativo: !u.ativo } : u));
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">

      {/* Back + header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/clientes')} className="mt-1 h-8 w-8 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-foreground">{cliente.nome}</h1>
            <Badge variant={cliente.tipo === 'lojista' ? 'default' : cliente.tipo === 'transportador' ? 'secondary' : 'outline'}>
              {cliente.tipo.charAt(0).toUpperCase() + cliente.tipo.slice(1)}
            </Badge>
            {cliente.inadimplente && <Badge variant="destructive">Inadimplente</Badge>}
          </div>
          <p className="text-[13px] text-foreground/50 mt-0.5">{cliente.cidade} — {cliente.uf} · {fmt(cliente.mrr)}/mês · plano {plano}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-foreground/50">{acessoAtivo ? 'Acesso ativo' : 'Acesso suspenso'}</span>
            <Switch checked={acessoAtivo} onCheckedChange={setAcessoAtivo} />
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Usuários',       value: usersList.length,                                    sub: `${usersList.filter(u => u.ativo).length} ativos`    },
          { label: 'Total Pago',     value: fmt(totalPago),                                      sub: `${pagamentos.length} cobranças`                      },
          { label: 'Tickets',        value: tickets.length,                                      sub: `${tickets.filter((t: any) => t.status === 'aberto').length} abertos` },
          { label: 'Vencimento',     value: cliente.vencimento,                                  sub: 'próxima renovação'                                   },
        ].map(({ label, value, sub }) => (
          <Card key={label} className="border-black/[0.07] dark:border-white/[0.07]">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">{label}</p>
              <p className="text-lg font-bold text-foreground mt-1">{value}</p>
              <p className="text-[10px] text-foreground/40 mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="usuarios">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="usuarios" className="gap-1.5"><Users className="h-3.5 w-3.5" />Usuários</TabsTrigger>
          <TabsTrigger value="pagamento" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" />Pagamento</TabsTrigger>
          <TabsTrigger value="acesso" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Acesso</TabsTrigger>
          <TabsTrigger value="tickets" className="gap-1.5"><Ticket className="h-3.5 w-3.5" />Tickets</TabsTrigger>
        </TabsList>

        {/* ── USUÁRIOS ─────────────────────────────────── */}
        <TabsContent value="usuarios">
          <Card className="border-black/[0.07] dark:border-white/[0.07]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[13px]">Usuários do cliente</CardTitle>
                <Button size="sm" onClick={() => setAddUserOpen(true)}>
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                {usersList.map(u => (
                  <div key={u.id} className="flex items-center gap-3 py-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-foreground/60 text-[11px] font-bold shrink-0">
                      {u.nome.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground">{u.nome}</p>
                      <p className="text-[11px] text-foreground/40">{u.email} · {ROLE_LABEL[u.role] ?? u.role} · último acesso: {u.ultimoAcesso}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Switch checked={u.ativo} onCheckedChange={() => toggleUserAtivo(u.id)} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-black/[0.05] transition-colors">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem><Key className="h-4 w-4" />Resetar senha</DropdownMenuItem>
                          <DropdownMenuItem><Pencil className="h-4 w-4" />Editar perfil</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive"><Trash2 className="h-4 w-4" />Remover usuário</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PAGAMENTO ───────────────────────────────── */}
        <TabsContent value="pagamento">
          <div className="flex flex-col gap-4">
            {/* Plano atual */}
            <Card className="border-black/[0.07] dark:border-white/[0.07]">
              <CardHeader className="pb-3"><CardTitle className="text-[13px]">Plano e Cobrança</CardTitle></CardHeader>
              <CardContent className="pt-0 flex flex-wrap gap-6 items-end">
                <div>
                  <Label className="text-[11px] text-foreground/50">Plano atual</Label>
                  <Select value={plano} onValueChange={setPlano}>
                    <SelectTrigger className="mt-1 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLANOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-foreground/50">Valor mensal</Label>
                  <p className="text-lg font-bold text-foreground mt-1">{fmt(cliente.mrr)}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-foreground/50">Próximo vencimento</Label>
                  <p className="text-[13px] font-medium text-foreground mt-1">{cliente.vencimento}</p>
                </div>
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" size="sm"><RefreshCw className="h-4 w-4" />Gerar cobrança</Button>
                  <Button size="sm">Salvar plano</Button>
                </div>
              </CardContent>
            </Card>

            {/* Histórico */}
            <Card className="border-black/[0.07] dark:border-white/[0.07]">
              <CardHeader className="pb-3"><CardTitle className="text-[13px]">Histórico de Pagamentos</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                  {pagamentos.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-4 py-3">
                      <div className="flex-1">
                        <p className="text-[13px] font-medium text-foreground">{p.mes}</p>
                        <p className="text-[11px] text-foreground/40">{fmtDate(p.data)} · {p.metodo}</p>
                      </div>
                      <p className="text-[13px] font-semibold text-foreground">{fmt(p.valor)}</p>
                      <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_PAG[p.status].color)}>
                        {STATUS_PAG[p.status].icon}
                        {STATUS_PAG[p.status].label}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── ACESSO ──────────────────────────────────── */}
        <TabsContent value="acesso">
          <Card className="border-black/[0.07] dark:border-white/[0.07]">
            <CardHeader className="pb-3"><CardTitle className="text-[13px]">Gerenciamento de Acesso</CardTitle></CardHeader>
            <CardContent className="pt-0 flex flex-col gap-5">

              {/* Master switch */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-black/[0.07] dark:border-white/[0.07]">
                <div>
                  <p className="text-[13px] font-medium text-foreground">Acesso ao sistema</p>
                  <p className="text-[11px] text-foreground/40 mt-0.5">Habilita ou bloqueia o login de todos os usuários desta empresa</p>
                </div>
                <Switch checked={acessoAtivo} onCheckedChange={setAcessoAtivo} />
              </div>

              {/* Modules */}
              {[
                { mod: 'CRM / Funil',       key: 'crm',       ativo: true  },
                { mod: 'Financeiro',         key: 'financeiro',ativo: true  },
                { mod: 'Gestão de Site',     key: 'site',      ativo: true  },
                { mod: 'Inteligência IA',    key: 'ia',        ativo: false },
                { mod: 'Ponto Eletrônico',   key: 'ponto',     ativo: true  },
                { mod: 'Via Pesados Match',  key: 'match',     ativo: true  },
              ].map(m => (
                <div key={m.key} className="flex items-center justify-between">
                  <p className="text-[13px] text-foreground">{m.mod}</p>
                  <Switch defaultChecked={m.ativo} />
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1">
                  <Ban className="h-4 w-4" />Suspender acesso
                </Button>
                <Button className="flex-1">
                  Salvar configurações
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TICKETS ─────────────────────────────────── */}
        <TabsContent value="tickets">
          <Card className="border-black/[0.07] dark:border-white/[0.07]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[13px]">Tickets de Suporte</CardTitle>
                <Button size="sm" onClick={() => setNewTicketOpen(true)}>
                  <Plus className="h-4 w-4" /> Novo Ticket
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {tickets.length === 0 ? (
                <div className="text-center py-10">
                  <Ticket className="h-8 w-8 mx-auto text-foreground/20 mb-2" />
                  <p className="text-[13px] text-foreground/40">Nenhum ticket</p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                  {tickets.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-4 py-3">
                      <span className="text-[11px] font-mono font-bold text-foreground/40 w-10 shrink-0">{t.id}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{t.assunto}</p>
                        <p className="text-[11px] text-foreground/40">{fmtDate(t.criado)} · {t.mensagens} mensagem{t.mensagens !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', PRIO_COLOR[t.prioridade])}>{t.prioridade}</span>
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', STICKER_COLOR[t.status])}>{t.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog — novo usuário */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Usuário</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4">
            <div><Label>Nome completo</Label><Input className="mt-1" value={newUser.nome} onChange={e => setNewUser(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>E-mail</Label><Input className="mt-1" type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} /></div>
            <div>
              <Label>Perfil</Label>
              <Select value={newUser.role} onValueChange={v => setNewUser(p => ({ ...p, role: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddUser}>Criar usuário</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — novo ticket */}
      <Dialog open={newTicketOpen} onOpenChange={setNewTicketOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Ticket</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4">
            <div><Label>Assunto</Label><Input className="mt-1" value={newTicket.assunto} onChange={e => setNewTicket(p => ({ ...p, assunto: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Textarea className="mt-1" rows={3} value={newTicket.descricao} onChange={e => setNewTicket(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div>
              <Label>Prioridade</Label>
              <Select value={newTicket.prioridade} onValueChange={v => setNewTicket(p => ({ ...p, prioridade: v }))}>
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
            <Button variant="outline" onClick={() => setNewTicketOpen(false)}>Cancelar</Button>
            <Button onClick={() => setNewTicketOpen(false)}>Abrir ticket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
