import { useEffect, useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Panel } from '@/components/admin/ui';
import { cn } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════
   Repasse diário do Asaas para o Santander (24/11/2026, pedido do dono).
   Todo dia às 18h, o que passar de R$ 100 no Asaas vai por Pix para a
   chave gravada aqui. Trocar a chave desliga (o banco garante). A
   validação no Asaas usa a URL e o token desta tela: só sai o que a
   rotina pediu.
   ══════════════════════════════════════════════════════════════════ */

type Config = { ligado: boolean; chave_pix: string | null; tipo_chave: string | null; reserva: number; token_validacao: string };
type Repasse = { id: string; dia: string; valor: number | null; saldo: number | null; status: string; erro: string | null };

const URL_VALIDAR = 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/asaas-saque-validar';
const TIPOS = [['CNPJ', 'CNPJ'], ['CPF', 'CPF'], ['EMAIL', 'E-mail'], ['PHONE', 'Telefone'], ['EVP', 'Aleatória']] as const;
const brl = (v: number | null) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const STATUS: Record<string, [string, string]> = {
  DONE: ['Enviado', 'text-emerald-500'],
  PENDING: ['Em andamento', 'text-foreground/50'],
  BANK_PROCESSING: ['No banco', 'text-foreground/50'],
  pedindo: ['Pedindo', 'text-foreground/50'],
  sem_saldo: ['Nada acima de R$ 100', 'text-foreground/30'],
  falhou: ['Falhou', 'text-red-400'],
  FAILED: ['Falhou', 'text-red-400'],
  CANCELLED: ['Cancelado', 'text-red-400'],
};

const inputCls = 'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50';

/** Chave como o Asaas quer: CPF/CNPJ/telefone só com números. */
const limpar = (tipo: string, v: string) => (['CNPJ', 'CPF', 'PHONE'].includes(tipo) ? v.replace(/\D/g, '') : v.trim());

export function RepasseAutomatico() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [lista, setLista] = useState<Repasse[]>([]);
  const [chave, setChave] = useState('');
  const [tipo, setTipo] = useState('CNPJ');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from('repasse_config').select('ligado, chave_pix, tipo_chave, reserva, token_validacao').eq('id', 1).maybeSingle(),
      supabase.from('repasses').select('id, dia, valor, saldo, status, erro').order('dia', { ascending: false }).limit(10),
    ]);
    if (c) { setCfg(c as Config); setChave(c.chave_pix ?? ''); setTipo(c.tipo_chave ?? 'CNPJ'); }
    setLista((r ?? []) as Repasse[]);
  };
  useEffect(() => { carregar(); }, []);

  if (!cfg) return null;

  const mudouChave = limpar(tipo, chave) !== (cfg.chave_pix ?? '') || tipo !== (cfg.tipo_chave ?? 'CNPJ');

  const gravar = async (patch: Partial<Config>) => {
    setSalvando(true);
    const { error } = await supabase.from('repasse_config').update(patch).eq('id', 1);
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    await carregar();
  };

  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success('Copiado'));

  return (
    <Panel className="p-5 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-semibold text-foreground">Repasse para o Santander</p>
          <p className="text-[12.5px] text-foreground/50 mt-0.5">Todo dia às 18h, o que passar de R$ 100 no Asaas vai por Pix para a sua conta.</p>
        </div>
        <button
          disabled={salvando || !cfg.chave_pix}
          onClick={() => gravar({ ligado: !cfg.ligado })}
          className={cn('h-9 px-4 rounded-xl text-[12.5px] font-semibold shrink-0 transition-all disabled:opacity-40',
            cfg.ligado ? 'bg-emerald-500/15 text-emerald-500' : 'bg-primary text-primary-foreground')}
        >
          {cfg.ligado ? 'Ligado · desligar' : 'Ligar'}
        </button>
      </div>

      <div className="grid sm:grid-cols-[140px_1fr_auto] gap-2.5">
        <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
        <input className={inputCls} placeholder="Chave Pix da conta Santander" value={chave} onChange={(e) => setChave(e.target.value)} />
        <button
          disabled={salvando || !chave.trim() || !mudouChave}
          onClick={() => gravar({ chave_pix: limpar(tipo, chave), tipo_chave: tipo })}
          className="h-10 px-4 rounded-xl bg-black/[0.05] dark:bg-white/[0.07] text-[12.5px] font-semibold disabled:opacity-40"
        >
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Gravar chave'}
        </button>
      </div>
      {cfg.chave_pix && mudouChave && <p className="text-[12px] text-foreground/45 -mt-3">Trocar a chave desliga o repasse até você ligar de novo.</p>}

      <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-4 space-y-2.5">
        <p className="text-[12.5px] text-foreground/70">
          No Asaas: <b>Integrações → Mecanismos de segurança → Validação de saque via webhook</b>. Cole a URL e o token abaixo. Assim o Asaas só libera o que esta rotina pedir.
        </p>
        {[['URL', URL_VALIDAR], ['Token', cfg.token_validacao]].map(([r, v]) => (
          <div key={r} className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-foreground/35 w-12 shrink-0">{r}</span>
            <code className="flex-1 min-w-0 truncate text-[12px] text-foreground/70">{v}</code>
            <button onClick={() => copiar(v)} title="Copiar" className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {lista.length > 0 && (
        <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
          {lista.map((r) => {
            const [rot, cor] = STATUS[r.status] ?? [r.status, 'text-foreground/50'];
            return (
              <div key={r.id} className="py-2 flex items-center gap-3 text-[12.5px]">
                <span className="text-foreground/45 w-16 shrink-0">{new Date(r.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                <span className="flex-1 tabular-nums text-foreground/80">{r.valor ? brl(r.valor) : '—'}</span>
                <span className={cn('text-right', cor)} title={r.erro ?? undefined}>{rot}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
