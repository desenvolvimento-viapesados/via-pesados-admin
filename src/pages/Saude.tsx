import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, HelpCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FUNCTIONS_URL } from '@/integrations/supabase/client';
import { useInstancias } from '@/hooks/useWhatsApp';
import {
  avaliarAsaas, avaliarCanalOficial, avaliarNotaFiscal, avaliarNumerosDaEquipe, avaliarVercel, resumoDaSaude,
  type EstadoDeSaude, type Verificacao,
} from '@/lib/saude';

/* Saúde da plataforma: as peças que mantêm a Via Pesados no ar, num lugar
   só. Só leitura — nenhuma verificação daqui muda nada nas contas. Cada
   cartão leva para a tela onde o problema se resolve. */

const ler = async (caminho: string) => {
  try {
    const r = await fetch(`${FUNCTIONS_URL}/${caminho}`, { signal: AbortSignal.timeout(30_000) });
    return await r.json();
  } catch {
    return null;
  }
};

const ESTILO: Record<EstadoDeSaude, { icone: typeof CheckCircle2; cor: string; fundo: string; rotulo: string }> = {
  ok: { icone: CheckCircle2, cor: 'text-emerald-500', fundo: 'bg-emerald-500/10', rotulo: 'Funcionando' },
  atencao: { icone: AlertTriangle, cor: 'text-amber-500', fundo: 'bg-amber-500/10', rotulo: 'Atenção' },
  erro: { icone: XCircle, cor: 'text-red-400', fundo: 'bg-red-500/10', rotulo: 'Parado' },
  sem_resposta: { icone: HelpCircle, cor: 'text-foreground/40', fundo: 'bg-black/[0.05] dark:bg-white/[0.06]', rotulo: 'Sem resposta' },
};

function Cartao({ v, onAbrir }: { v: Verificacao; onAbrir?: () => void }) {
  const e = ESTILO[v.estado];
  const Icone = e.icone;
  const Corpo = onAbrir ? 'button' : 'div';
  return (
    <Corpo
      {...(onAbrir ? { onClick: onAbrir, type: 'button' as const } : {})}
      className={cn(
        'w-full text-left rounded-2xl border p-4 flex items-start gap-3',
        'bg-black/[0.03] dark:bg-white/[0.03] border-black/[0.07] dark:border-white/[0.08]',
        onAbrir && 'group hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors',
      )}
    >
      <span className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', e.fundo, e.cor)}>
        <Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[13.5px] font-semibold text-foreground">{v.titulo}</p>
          <span className={cn('text-[10.5px] font-semibold', e.cor)}>{e.rotulo}</span>
        </div>
        <p className="text-[12px] text-foreground/50 mt-1 leading-snug">{v.detalhe}</p>
      </div>
      {onAbrir && <ChevronRight className="h-4 w-4 mt-1 text-foreground/20 group-hover:text-primary shrink-0" />}
    </Corpo>
  );
}

export default function Saude() {
  const navigate = useNavigate();
  const diag = useQuery({
    queryKey: ['saude-plataforma'],
    staleTime: 60_000,
    queryFn: async () => {
      const [canal, asaas, fiscal, vercel] = await Promise.all([
        ler('wa-diagnostico'),
        ler('asaas-diagnostico?so=webhooks'),
        ler('asaas-fiscal'),
        ler('vercel-diagnostico'),
      ]);
      return { canal, asaas, fiscal, vercel, em: new Date() };
    },
  });
  const numeros = useInstancias();

  const lista: Verificacao[] = diag.data
    ? [
        avaliarCanalOficial(diag.data.canal),
        avaliarNumerosDaEquipe(numeros.data ?? null),
        avaliarAsaas(diag.data.asaas),
        avaliarNotaFiscal(diag.data.fiscal),
        avaliarVercel(diag.data.vercel),
      ]
    : [];
  const resumo = lista.length ? resumoDaSaude(lista) : null;
  const atualizando = diag.isFetching || numeros.isFetching;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Saúde da plataforma</h1>
          <p className="text-[12px] text-foreground/40 mt-0.5">O que mantém a Via Pesados no ar, conferido agora</p>
        </div>
        <button
          onClick={() => { diag.refetch(); numeros.refetch(); }}
          disabled={atualizando}
          className="h-9 px-3 rounded-xl border border-black/[0.08] dark:border-white/[0.1] text-[12px] font-medium text-foreground/60 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05] flex items-center gap-1.5 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', atualizando && 'animate-spin')} /> Conferir de novo
        </button>
      </div>

      {diag.isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : (
        <>
          {resumo && (
            <div className={cn('rounded-2xl px-4 py-3 flex items-center gap-2.5', ESTILO[resumo.estado].fundo)}>
              {(() => { const I = ESTILO[resumo.estado].icone; return <I className={cn('h-4 w-4', ESTILO[resumo.estado].cor)} />; })()}
              <p className={cn('text-[13px] font-semibold', ESTILO[resumo.estado].cor)}>{resumo.texto}</p>
              {diag.data && (
                <span className="ml-auto text-[11px] text-foreground/40">
                  conferido às {diag.data.em.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            {lista.map((v) => (
              <Cartao key={v.chave} v={v} onAbrir={v.rota ? () => navigate(v.rota!) : undefined} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
