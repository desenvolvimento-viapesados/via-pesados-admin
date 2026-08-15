import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

export default function NovoCliente() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    empresa: '', tipo: 'lojista', cnpj: '', cidade: '', uf: '',
    contato: '', email: '', telefone: '',
    plano: 'pro', observacoes: '',
  });

  function handleSave() {
    alert(`Cliente ${form.empresa} criado com sucesso!`);
    navigate('/clientes');
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-black/[0.05] transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Novo Cliente</h1>
          <p className="text-[13px] text-foreground/50">Cadastrar empresa na plataforma</p>
        </div>
      </div>

      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardHeader><CardTitle className="text-[13px]">Dados da empresa</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Nome *</Label><Input className="mt-1" value={form.empresa} onChange={e => setForm(p => ({ ...p, empresa: e.target.value }))} /></div>
          <div>
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lojista">Lojista</SelectItem>
                <SelectItem value="transportador">Transportador</SelectItem>
                <SelectItem value="corretor">Corretor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>CNPJ</Label><Input className="mt-1" value={form.cnpj} onChange={e => setForm(p => ({ ...p, cnpj: e.target.value }))} /></div>
          <div><Label>Cidade</Label><Input className="mt-1" value={form.cidade} onChange={e => setForm(p => ({ ...p, cidade: e.target.value }))} /></div>
          <div><Label>UF</Label><Input className="mt-1" maxLength={2} value={form.uf} onChange={e => setForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
        </CardContent>
      </Card>

      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardHeader><CardTitle className="text-[13px]">Contato principal</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Nome do contato</Label><Input className="mt-1" value={form.contato} onChange={e => setForm(p => ({ ...p, contato: e.target.value }))} /></div>
          <div><Label>E-mail *</Label><Input className="mt-1" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          <div><Label>Telefone</Label><Input className="mt-1" value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} /></div>
        </CardContent>
      </Card>

      <Card className="border-black/[0.07] dark:border-white/[0.07]">
        <CardHeader><CardTitle className="text-[13px]">Plano e acesso</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Label>Plano inicial</Label>
            <Select value={form.plano} onValueChange={v => setForm(p => ({ ...p, plano: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter — R$ 490/mês</SelectItem>
                <SelectItem value="basic">Basic — R$ 890/mês</SelectItem>
                <SelectItem value="pro">Pro — R$ 3.200/mês</SelectItem>
                <SelectItem value="enterprise">Enterprise — personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Observações internas</Label><Textarea className="mt-1" rows={3} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} /></div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate(-1)} className="flex-1">Cancelar</Button>
        <Button className="flex-1" onClick={handleSave} disabled={!form.empresa || !form.email}>Criar cliente</Button>
      </div>
    </div>
  );
}
