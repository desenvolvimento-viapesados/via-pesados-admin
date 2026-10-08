import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, MessageCircle, ChevronRight, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useClients, usePayments, brlFull } from '@/hooks/useAdmin';
import { Kpi, Panel, SectionHeader, EmptyState } from '@/components/admin/ui';
import {
  inadimplentes, aVencer, numeroParaWhatsapp, AVISOS_DE_COBRANCA, ROTULO_DO_AVISO, type EnvioDeAviso,
} from '@/lib/inadimplencia';

/* Quem está devendo, quanto e há quanto tempo — e o que o sistema já mandou
   pelo WhatsApp. A cobrança automática (cobranca-lembrete e o webhook do
   Asaas) continua igual; esta tela é para a pessoa decidir quando entrar em
   contato e já ter o link da fatura na mão. */

const hojeISO = () => new Date().toISOString().slice(0, 10);
const data = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR');

function useAvisosDeCobranca() {
  return useQuery({
    queryKey: ['wa-envios', 'cobranca'],
    queryFn: async () => {
      const { data: linhas, error } = await supabase
        .from('wa_envios')
        .select('client_id, template, enviado_em')
        .in('template', AVISOS_DE_COBRANCA)
        .order('enviado_em', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (linhas ?? []) as EnvioDeAviso[];
    },
  });
}

export default function Inadimplencia() {
  const navigate = useNavigate();
  const { data: clientes = [], isLoading: c1 } = useClients();
  const { data: faturas = [], isLoading: c2 } = usePayments();
  const { data: avisos = [] } = useAvisosDeCobranca();
  const hoje = hojeISO();

  const linhas = useMemo(() => inadimplentes(faturas, clientes, avisos, hoje), [faturas, clientes, avisos, hoje]);
  const proximas = useMemo(() => aVencer(faturas, hoje), [faturas, hoje]);
  const total = linhas.reduce((s, l) => s + l.total, 0);
  const maisAntigo = linhas[0]?.diasDeAtraso ?? 0;

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Link copiado');
    } catch {
      toast.error('Não consegui copiar');
    }
  };

  if (c1 || c2) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Inadimplência</h1>
        <p className="text-[12px] text-foreground/40 mt-0.5">Quem está devendo, há quanto tempo e o que já foi avisado</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Em atraso" value={brlFull(total)} accent={total > 0 ? 'text-red-400' : 'text-emerald-500'} />
        <Kpi label="Clientes devendo" value={linhas.length} />
        <Kpi label="Atraso mais antigo" value={linhas.length ? `${maisAntigo} ${maisAntigo === 1 ? 'dia' : 'dias'}` : '—'} />
      </div>

      {linhas.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title="Ninguém em atraso" sub="Todas as faturas vencidas estão pagas" />
      ) : (
        <div className="flex flex-col gap-3">
          {linhas.map((l) => {
            const zap = numeroParaWhatsapp(l.cliente.whatsapp);
            const fatura = l.faturas.find((f) => f.invoice_url);
            const mensagem = `Olá${l.cliente.contact_name ? `, ${l.cliente.contact_name.split(' ')[0]}` : ''}! Aqui é da Via Pesados. `
              + `Consta em aberto ${l.faturas.length === 1 ? 'a fatura' : 'as faturas'} de ${brlFull(l.total)}`
              + `${fatura?.invoice_url ? `. O link para pagamento: ${fatura.invoice_url}` : ''}. Qualquer dúvida, estou por aqui.`;
            return (
              <Panel key={l.cliente.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="h-9 w-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => navigate(`/clientes/${l.cliente.id}`)}
                      className="text-[14px] font-semibold text-foreground hover:text-primary truncate text-left"
                    >
                      {l.cliente.company_name}
                    </button>
                    <p className="text-[11.5px] text-foreground/45">
                      {l.faturas.length} {l.faturas.length === 1 ? 'fatura' : 'faturas'} · {l.diasDeAtraso} {l.diasDeAtraso === 1 ? 'dia' : 'dias'} de atraso
                    </p>
                  </div>
                  <p className="text-[17px] font-bold tabular-nums text-red-400 shrink-0">{brlFull(l.total)}</p>
                </div>

                <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                  {l.faturas.map((f) => (
                    <div key={f.id} className="px-3 py-2 flex items-center gap-3 text-[12px]">
                      <span className="min-w-0 flex-1 truncate text-foreground/70">{f.description}</span>
                      <span className="text-foreground/40 shrink-0">venceu {data(f.due_date)}</span>
                      <span className="tabular-nums text-foreground/70 shrink-0">{brlFull(f.amount)}</span>
                      {f.invoice_url && (
                        <button onClick={() => copiar(f.invoice_url!)} title="Copiar link da fatura" className="text-foreground/30 hover:text-primary shrink-0">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] text-foreground/40 mr-auto">
                    {l.ultimoAviso
                      ? `Último aviso automático: ${ROTULO_DO_AVISO[l.ultimoAviso.template] ?? l.ultimoAviso.template}, em ${data(l.ultimoAviso.em)}`
                      : 'Nenhum aviso de cobrança enviado pelo WhatsApp ainda'}
                  </p>
                  {zap && (
                    <a
                      href={`https://wa.me/${zap}?text=${encodeURIComponent(mensagem)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 px-3 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-[12px] font-medium text-foreground/70 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05] flex items-center gap-1.5"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Conversar no WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() => navigate(`/clientes/${l.cliente.id}/cobranca`)}
                    className="h-8 px-3 rounded-lg bg-primary/10 text-primary text-[12px] font-semibold hover:bg-primary/15 flex items-center gap-1"
                  >
                    Ver cobrança <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <div>
        <SectionHeader title="Vencem nos próximos 7 dias" />
        {proximas.length === 0 ? (
          <p className="text-[12px] text-foreground/35">Nenhuma fatura vence nesta semana.</p>
        ) : (
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
            {proximas.map((f) => {
              const cliente = clientes.find((c) => c.id === f.client_id);
              return (
                <button
                  key={f.id}
                  onClick={() => cliente && navigate(`/clientes/${cliente.id}/cobranca`)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                >
                  <CalendarClock className="h-3.5 w-3.5 text-foreground/30 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/75">{cliente?.company_name ?? 'Cliente'} · {f.description}</span>
                  <span className="text-[11.5px] text-foreground/40 shrink-0">{data(f.due_date)}</span>
                  <span className="text-[12.5px] tabular-nums text-foreground/75 shrink-0">{brlFull(f.amount)}</span>
                </button>
              );
            })}
          </Panel>
        )}
      </div>
    </div>
  );
}
