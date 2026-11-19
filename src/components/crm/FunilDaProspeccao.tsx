import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Kpi } from '@/components/admin/ui';
import { useFunilDaProspeccao } from '@/hooks/useFunilDaProspeccao';
import { chegaramAte, taxa } from '@/lib/funilDaProspeccao';

/**
 * Os números do envio automático: de quantas lojas abordadas, quantas responderam, marcaram
 * reunião e fecharam. O quadro e a ficha que moravam aqui saíram em 18/11/2026: a esteira
 * (EsteiraTab, lib/esteira) é o único lugar em que as lojas aparecem.
 */

/**
 * O resultado do envio em números: de quantas lojas abordadas, quantas responderam,
 * quantas marcaram reunião e quantas fecharam.
 */
export function NumerosDaProspeccao() {
  const { data, isLoading } = useFunilDaProspeccao();
  const n = useMemo(() => chegaramAte((data?.linhas ?? []).filter((l) => !l.teste).map((l) => l.posicao)), [data]);
  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></div>;
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      <Kpi label="Na fila" value={(data?.naFila ?? 0).toLocaleString('pt-BR')} sub="esperando a vez de receber" />
      <Kpi label="Já receberam" value={n.abordada.toLocaleString('pt-BR')} sub="a mensagem ou a ligação" />
      <Kpi label="Responderam" value={n.conversando.toLocaleString('pt-BR')} sub={taxa(n.conversando, n.abordada) ? `${taxa(n.conversando, n.abordada)} de quem recebeu` : undefined} />
      <Kpi label="Reuniões" value={n.reuniao.toLocaleString('pt-BR')} sub={taxa(n.reuniao, n.conversando) ? `${taxa(n.reuniao, n.conversando)} de quem respondeu` : undefined} accent="text-primary" />
      <Kpi label="Clientes" value={n.cliente.toLocaleString('pt-BR')} sub={taxa(n.cliente, n.reuniao) ? `${taxa(n.cliente, n.reuniao)} das reuniões` : undefined} />
    </div>
  );
}
