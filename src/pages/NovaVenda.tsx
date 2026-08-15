import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { fmt, cn } from '@/lib/utils';

const PLANOS = [
  { id: 'starter', label: 'Starter',    valor: 490,  desc: '1 usuário, módulos básicos' },
  { id: 'basic',   label: 'Basic',      valor: 890,  desc: '3 usuários, CRM + Financeiro' },
  { id: 'pro',     label: 'Pro',        valor: 3200, desc: '10 usuários, todos os módulos' },
  { id: 'enterprise',label:'Enterprise',valor: 0,    desc: 'Personalizado — sob consulta' },
];

const TIPOS = ['lojista', 'transportador', 'corretor'];

export default function NovaVenda() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    empresa: '', tipo: 'lojista', contato: '', email: '', telefone: '',
    cidade: '', uf: '', plano: 'pro', notas: '',
    vencimento: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });

  const planoSel = PLANOS.find(p => p.id === form.plano)!;

  function handleFinal() {
    alert(`Venda criada!\n${form.empresa} — ${planoSel.label} — ${fmt(planoSel.valor)}/mês`);
    navigate('/clientes');
  }

  const steps = ['Empresa', 'Plano', 'Confirmar'];

  return (
    <div className="flex flex-col gap-6 max-w-xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => step > 0 ? setStep(s => s - 1) : navigate(-1)} className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-black/[0.05] transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Nova Venda</h1>
          <p className="text-[13px] text-foreground/50">Passo {step + 1} de {steps.length} — {steps[step]}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5">
        {steps.map((s, i) => (
          <div key={s} className={cn('h-1 flex-1 rounded-full transition-all', i <= step ? 'bg-primary' : 'bg-black/[0.08] dark:bg-white/[0.08]')} />
        ))}
      </div>

      {/* Step 0 — empresa */}
      {step === 0 && (
        <Card className="border-black/[0.07] dark:border-white/[0.07]">
          <CardHeader><CardTitle className="text-[13px]">Dados da empresa</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome da empresa *</Label><Input className="mt-1" value={form.empresa} onChange={e => setForm(p => ({ ...p, empresa: e.target.value }))} /></div>
            <div>
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>UF</Label><Input className="mt-1" maxLength={2} value={form.uf} onChange={e => setForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
            <div className="col-span-2"><Label>Cidade</Label><Input className="mt-1" value={form.cidade} onChange={e => setForm(p => ({ ...p, cidade: e.target.value }))} /></div>
            <div><Label>Nome do contato</Label><Input className="mt-1" value={form.contato} onChange={e => setForm(p => ({ ...p, contato: e.target.value }))} /></div>
            <div><Label>Telefone</Label><Input className="mt-1" value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} /></div>
            <div className="col-span-2"><Label>E-mail</Label><Input className="mt-1" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          </CardContent>
        </Card>
      )}

      {/* Step 1 — plano */}
      {step === 1 && (
        <div className="flex flex-col gap-3">
          {PLANOS.map(plano => (
            <button
              key={plano.id}
              onClick={() => setForm(p => ({ ...p, plano: plano.id }))}
              className={cn(
                'flex items-center gap-4 p-5 rounded-2xl border text-left transition-all',
                form.plano === plano.id
                  ? 'border-primary/50 bg-primary/5 shadow-elevated'
                  : 'border-black/[0.07] dark:border-white/[0.07] hover:border-black/[0.14] dark:hover:border-white/[0.14]',
              )}
            >
              <div className={cn('h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors', form.plano === plano.id ? 'border-primary bg-primary' : 'border-foreground/20')}>
                {form.plano === plano.id && <Check className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-foreground">{plano.label}</p>
                <p className="text-[12px] text-foreground/50 mt-0.5">{plano.desc}</p>
              </div>
              <p className="text-[15px] font-bold text-foreground shrink-0">
                {plano.valor > 0 ? `${fmt(plano.valor)}/mês` : 'Consultar'}
              </p>
            </button>
          ))}

          <div>
            <Label>Primeiro vencimento</Label>
            <Input className="mt-1" type="date" value={form.vencimento} onChange={e => setForm(p => ({ ...p, vencimento: e.target.value }))} />
          </div>
          <div>
            <Label>Observações internas</Label>
            <Textarea className="mt-1" rows={2} value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
          </div>
        </div>
      )}

      {/* Step 2 — confirmar */}
      {step === 2 && (
        <Card className="border-black/[0.07] dark:border-white/[0.07]">
          <CardHeader><CardTitle className="text-[13px]">Confirmar venda</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[
              { label: 'Empresa',    value: form.empresa },
              { label: 'Tipo',       value: form.tipo.charAt(0).toUpperCase() + form.tipo.slice(1) },
              { label: 'Local',      value: `${form.cidade} — ${form.uf}` },
              { label: 'Contato',    value: `${form.contato} · ${form.email} · ${form.telefone}` },
              { label: 'Plano',      value: planoSel.label },
              { label: 'Valor',      value: planoSel.valor > 0 ? `${fmt(planoSel.valor)}/mês` : 'Personalizado' },
              { label: 'Vencimento', value: form.vencimento },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4 py-1 border-b border-black/[0.05] dark:border-white/[0.05] last:border-0">
                <p className="text-[12px] text-foreground/50 shrink-0">{label}</p>
                <p className="text-[13px] font-medium text-foreground text-right">{value || '—'}</p>
              </div>
            ))}
            {form.notas && (
              <p className="text-[12px] text-foreground/50 bg-muted/50 rounded-lg p-3 mt-1">{form.notas}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {step < steps.length - 1 ? (
          <Button className="flex-1" onClick={() => setStep(s => s + 1)} disabled={step === 0 && !form.empresa}>
            Próximo
          </Button>
        ) : (
          <Button className="flex-1" onClick={handleFinal}>
            Confirmar venda
          </Button>
        )}
      </div>
    </div>
  );
}
