import { useMemo, useState } from 'react';
import { Plus, Loader2, Layers, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTodosPlanos, useSalvarPlano, useClients, brlFull, type Plan } from '@/hooks/useAdmin';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, Panel } from '@/components/admin/ui';

/* Os planos que a Via Pesados vende e quantos clientes estão em cada um.
   O valor do plano é a tabela; a mensalidade de cada cliente continua sendo
   a da ficha (pode ter desconto) — mudar um plano aqui não muda cobrança de
   ninguém. Plano não se apaga: desativado some da escolha e fica no histórico. */

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

function PlanoDialog({ plano, ordem, onClose }: { plano: Plan | null; ordem: number; onClose: () => void }) {
  const salvar = useSalvarPlano();
  const [form, setForm] = useState({
    name: plano?.name ?? '',
    monthly_value: plano ? String(plano.monthly_value) : '',
    description: plano?.description ?? '',
    is_active: plano?.is_active ?? true,
  });

  const enviar = async () => {
    const valor = Number(form.monthly_value.replace(',', '.'));
    if (!form.name.trim()) { toast.error('Dê um nome ao plano'); return; }
    if (!(valor > 0)) { toast.error('Informe o valor mensal'); return; }
    try {
      await salvar.mutateAsync({
        id: plano?.id,
        name: form.name.trim(),
        monthly_value: valor,
        description: form.description.trim() || null,
        is_active: form.is_active,
        ...(plano ? {} : { sort: ordem }),
      });
      toast.success(plano ? 'Plano atualizado' : 'Plano criado');
      onClose();
    } catch {
      toast.error('Não consegui salvar o plano');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{plano ? 'Editar plano' : 'Novo plano'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 pt-1">
          <input className={inputCls} placeholder="Nome (ex.: Completo)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className={inputCls} inputMode="decimal" placeholder="Valor mensal (R$)" value={form.monthly_value} onChange={(e) => setForm((f) => ({ ...f, monthly_value: e.target.value }))} />
          <textarea className={cn(inputCls, 'h-24 py-2 resize-none')} placeholder="O que o plano inclui" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <label className="flex items-center gap-2 text-[12.5px] text-foreground/70">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Disponível para venda
          </label>
          <button
            onClick={enviar}
            disabled={salvar.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Planos() {
  const { data: planos = [], isLoading } = useTodosPlanos();
  const { data: clientes = [] } = useClients();
  const [editando, setEditando] = useState<Plan | null | 'novo'>(null);

  const porPlano = useMemo(() => {
    const ativos = clientes.filter((c) => c.status !== 'cancelado');
    const m = new Map<string, { qtd: number; receita: number }>();
    for (const c of ativos) {
      if (!c.plan_id) continue;
      const atual = m.get(c.plan_id) ?? { qtd: 0, receita: 0 };
      atual.qtd += 1;
      atual.receita += Number(c.mrr) || 0;
      m.set(c.plan_id, atual);
    }
    const semPlano = ativos.filter((c) => !c.plan_id).length;
    return { m, semPlano };
  }, [clientes]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Planos e preços</h1>
          <p className="text-[12px] text-foreground/40 mt-0.5">O que a Via Pesados vende e quantos clientes estão em cada plano</p>
        </div>
        <button
          onClick={() => setEditando('novo')}
          className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Plano
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : planos.length === 0 ? (
        <EmptyState icon={<Layers />} title="Nenhum plano" sub="Crie o primeiro plano para escolher na ficha do cliente" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {planos.map((p) => {
            const uso = porPlano.m.get(p.id) ?? { qtd: 0, receita: 0 };
            return (
              <Panel key={p.id} className={cn('p-5 flex flex-col gap-3', !p.is_active && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-foreground">{p.name}</p>
                    <p className="text-[20px] font-bold tabular-nums text-foreground mt-1">
                      {brlFull(p.monthly_value)}<span className="text-[11px] font-normal text-foreground/40"> /mês</span>
                    </p>
                  </div>
                  {!p.is_active && <span className="text-[10.5px] rounded-full px-2 py-0.5 bg-black/[0.05] dark:bg-white/[0.07] text-foreground/50">Fora de venda</span>}
                  <button onClick={() => setEditando(p)} title="Editar" className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/35 hover:text-primary hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                {p.description && <p className="text-[12px] text-foreground/50 whitespace-pre-wrap leading-snug">{p.description}</p>}
                <p className="text-[11.5px] text-foreground/45 mt-auto pt-2 border-t border-black/[0.05] dark:border-white/[0.06]">
                  {uso.qtd} {uso.qtd === 1 ? 'cliente' : 'clientes'} · {brlFull(uso.receita)} por mês
                </p>
              </Panel>
            );
          })}
        </div>
      )}

      {porPlano.semPlano > 0 && (
        <p className="text-[12px] text-foreground/45">
          {porPlano.semPlano} {porPlano.semPlano === 1 ? 'cliente ainda não tem' : 'clientes ainda não têm'} plano marcado — escolha na aba Financeiro da ficha.
        </p>
      )}

      {editando && (
        <PlanoDialog
          plano={editando === 'novo' ? null : editando}
          ordem={planos.length + 1}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
