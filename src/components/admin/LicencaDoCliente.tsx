import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, FUNCTIONS_URL } from '@/integrations/supabase/client';
import { brlFull, type Client, type Payment } from '@/hooks/useAdmin';
import { Panel, SectionHeader } from '@/components/admin/ui';
import { licencaDoCliente, dataCurta } from '@/lib/licenca';
import { hojeBRT, DIAS_DE_TOLERANCIA } from '../../../supabase/functions/_shared/regua';

/**
 * A licença do cliente: de quando conta, até quando está paga, quando sai a
 * mensalidade e quando o painel trava. É a régua que as funções seguem
 * (regua.ts) escrita para gente ler — e os dois botões que a equipe pode
 * apertar: mudar a data de implantação e liberar o acesso na mão.
 */
async function chamar(corpo: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${FUNCTIONS_URL}/licenca-cliente`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(corpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error ?? 'Não consegui salvar');
  return d;
}

export function LicencaDoCliente({ client, payments }: { client: Client; payments: Payment[] }) {
  const qc = useQueryClient();
  const l = licencaDoCliente(client.implantado_em, payments);
  const [editando, setEditando] = useState(false);
  const [data, setData] = useState(client.implantado_em ?? hojeBRT());
  const [salvando, setSalvando] = useState(false);
  const liberadoNaMao = client.acesso_liberado_ate && client.acesso_liberado_ate >= hojeBRT();

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['payments'] });
    qc.invalidateQueries({ queryKey: ['activities'] });
  };

  const alinhar = async () => {
    setSalvando(true);
    try {
      const r = await chamar({ acao: 'alinhar', client_id: client.id, implantado_em: data });
      const movidas = (r.mudancas ?? []) as { de: string; para: string }[];
      toast.success(movidas.length
        ? `Implantação em ${dataCurta(data)}. Vencimentos: ${movidas.map((m) => `${dataCurta(m.de)} → ${dataCurta(m.para)}`).join(', ')}`
        : `Implantação em ${dataCurta(data)}`);
      setEditando(false);
      atualizar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const liberar = async () => {
    setSalvando(true);
    try {
      const r = await chamar({ acao: 'liberar', client_id: client.id });
      toast.success(`Acesso liberado até ${dataCurta(r.liberado_ate)}`);
      atualizar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Licença" />
      <Panel className="p-4 flex flex-col gap-3">
        {client.acesso_suspenso_em && (
          <div className="rounded-xl bg-red-500/10 px-3 py-2.5 flex items-center gap-2.5 flex-wrap">
            <Lock className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-[12.5px] font-semibold text-red-500 flex-1 min-w-0">
              Painel e site fora do ar desde {dataCurta(client.acesso_suspenso_em)} — nada foi apagado
            </p>
            <button
              onClick={liberar}
              disabled={salvando}
              className="h-8 px-3 rounded-lg bg-background border border-red-500/30 text-[12px] font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50"
            >
              Liberar por {DIAS_DE_TOLERANCIA} dias
            </button>
          </div>
        )}
        {!client.acesso_suspenso_em && liberadoNaMao && (
          <p className="text-[12px] text-amber-600 dark:text-amber-400">Liberado pela equipe até {dataCurta(client.acesso_liberado_ate)}: a rotina não corta antes disso.</p>
        )}

        <div className="flex items-start gap-3">
          <CalendarClock className="h-4 w-4 text-foreground/35 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            {l.implantadoEm ? (
              <p className="text-[13px] text-foreground">
                Implantado em <strong>{dataCurta(l.implantadoEm)}</strong> · vence todo dia <strong>{l.diaDoVencimento}</strong>
              </p>
            ) : (
              <p className="text-[13px] text-foreground/70">Data de implantação ainda não definida — o vencimento segue o dia do checkout.</p>
            )}
            {l.pagaAte && <p className="text-[12px] text-foreground/50 mt-0.5">Licença paga até {dataCurta(l.pagaAte)}</p>}
          </div>
          {!editando && (
            <button onClick={() => setEditando(true)} className="text-[11.5px] font-semibold text-primary hover:underline shrink-0">
              {l.implantadoEm ? 'Alterar' : 'Definir'}
            </button>
          )}
        </div>

        {editando && (
          <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] p-3 flex flex-col gap-2.5">
            <label className="text-[11.5px] text-foreground/55">Data de implantação (o dia em que o sistema foi entregue)</label>
            <input
              type="date"
              value={data}
              max={hojeBRT()}
              onChange={(e) => setData(e.target.value)}
              className="h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground"
            />
            <p className="text-[11px] text-foreground/45">As mensalidades em aberto passam a vencer no mesmo dia, mês a mês. Nada é cobrado agora.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEditando(false)} className="h-9 rounded-lg text-[12.5px] text-foreground/55 hover:text-foreground">Voltar</button>
              <button
                onClick={alinhar}
                disabled={salvando || !data}
                className="h-9 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        )}

        {l.proxima && (
          <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 text-[12px] text-foreground/65 leading-relaxed">
            Próxima mensalidade: <strong className="text-foreground">{brlFull(l.proxima.valor)}</strong>, vence em{' '}
            <strong className={l.proxima.atrasada ? 'text-red-500' : 'text-foreground'}>{dataCurta(l.proxima.vence)}</strong>.
            {' '}Vai no WhatsApp a partir de {dataCurta(l.mensagemEm)} (das 08h às 20h). Sem pagamento, painel e site saem do ar em {dataCurta(l.cortaEm)}.
          </div>
        )}
      </Panel>
    </div>
  );
}
