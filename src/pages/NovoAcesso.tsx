import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { CLIENTES_MOCK } from './Clientes';

const ROLES = [
  { id: 'admin',      label: 'Administrador',  desc: 'Acesso total ao sistema' },
  { id: 'vendedor',   label: 'Vendedor',        desc: 'CRM, clientes, vendas' },
  { id: 'financeiro', label: 'Financeiro',      desc: 'Módulo financeiro apenas' },
  { id: 'viewer',     label: 'Visualizador',    desc: 'Somente leitura' },
];

const MODULOS = ['CRM / Funil', 'Estoque', 'Financeiro', 'Relatórios', 'Gestão de Site', 'Ponto Eletrônico', 'Via Pesados Match'];

export default function NovoAcesso() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    clienteId: '', nome: '', email: '', role: 'vendedor',
    senha: '', enviarConvite: true,
  });
  const [showSenha, setShowSenha] = useState(false);
  const [modulosAtivos, setModulosAtivos] = useState(new Set(['CRM / Funil', 'Estoque', 'Financeiro']));

  function toggleModulo(mod: string) {
    setModulosAtivos(prev => {
      const next = new Set(prev);
      next.has(mod) ? next.delete(mod) : next.add(mod);
      return next;
    });
  }

  function handleSave() {
    const cliente = CLIENTES_MOCK.find(c => c.id === form.clienteId);
    alert(`Acesso criado!\n${form.nome} (${form.email})\nEmpresa: ${cliente?.nome}\nPerfil: ${form.role}`);
    navigate('/clientes');
  }

  const roleSel = ROLES.find(r => r.id === form.role);

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-black/[0.05] transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Novo Acesso</h1>
          <p className="text-[13px] text-foreground/50">Criar usuário para um cliente</p>
        </div>
      </div>

      {/* Empresa */}
      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardHeader><CardTitle className="text-[13px]">Empresa</CardTitle></CardHeader>
        <CardContent>
          <Label>Selecionar cliente *</Label>
          <Select value={form.clienteId} onValueChange={v => setForm(p => ({ ...p, clienteId: v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha a empresa..." /></SelectTrigger>
            <SelectContent>
              {CLIENTES_MOCK.filter(c => c.status === 'active').map(c => (
                <SelectItem key={c.id} value={c.id}>{c.nome} — {c.tipo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Usuário */}
      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardHeader><CardTitle className="text-[13px]">Dados do usuário</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div><Label>Nome completo *</Label><Input className="mt-1" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
          <div><Label>E-mail *</Label><Input className="mt-1" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          <div className="relative">
            <Label>Senha temporária</Label>
            <Input
              className="mt-1 pr-10"
              type={showSenha ? 'text' : 'password'}
              value={form.senha}
              onChange={e => setForm(p => ({ ...p, senha: e.target.value }))}
              placeholder="Deixe em branco para gerar automaticamente"
            />
            <button onClick={() => setShowSenha(v => !v)} className="absolute right-3 top-8 text-foreground/40 hover:text-foreground">
              {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-[13px] font-medium text-foreground">Enviar convite por e-mail</p>
              <p className="text-[11px] text-foreground/40">O usuário receberá um link para definir a senha</p>
            </div>
            <Switch checked={form.enviarConvite} onCheckedChange={v => setForm(p => ({ ...p, enviarConvite: v }))} />
          </div>
        </CardContent>
      </Card>

      {/* Perfil */}
      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardHeader><CardTitle className="text-[13px]">Perfil de acesso</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {ROLES.map(role => (
            <button
              key={role.id}
              onClick={() => setForm(p => ({ ...p, role: role.id }))}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${form.role === role.id ? 'border-primary/50 bg-primary/5' : 'border-input hover:border-primary/20'}`}
            >
              <div className={`h-4 w-4 rounded-full border-2 shrink-0 ${form.role === role.id ? 'border-primary bg-primary' : 'border-foreground/20'}`} />
              <div>
                <p className="text-[13px] font-medium text-foreground">{role.label}</p>
                <p className="text-[11px] text-foreground/40">{role.desc}</p>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Módulos */}
      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardHeader><CardTitle className="text-[13px]">Módulos permitidos</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {MODULOS.map(mod => (
            <div key={mod} className="flex items-center justify-between">
              <p className="text-[13px] text-foreground">{mod}</p>
              <Switch checked={modulosAtivos.has(mod)} onCheckedChange={() => toggleModulo(mod)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate(-1)} className="flex-1">Cancelar</Button>
        <Button className="flex-1" onClick={handleSave} disabled={!form.clienteId || !form.nome || !form.email}>
          Criar acesso
        </Button>
      </div>
    </div>
  );
}
