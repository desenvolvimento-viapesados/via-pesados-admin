import { useMemo, useState } from 'react';
import { Repeat, Target, Wallet, LifeBuoy, XCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useClients, useProspects, useMeetings, useDemos, useTickets,
  usePayments, useFinTransactions, useTeam,
} from '@/hooks/useAdmin';
import { getDateRangeForPeriod } from '@/utils/periodFilter';
import { DateRangeSelector } from '@/components/ui/date-range-selector';
import { RecorrenciaTab } from '@/components/relatorios/RecorrenciaTab';
import { AquisicaoTab } from '@/components/relatorios/AquisicaoTab';
import { CaixaTab } from '@/components/relatorios/CaixaTab';
import { OperacaoTab } from '@/components/relatorios/OperacaoTab';
import { PerdasView } from '@/components/relatorios/PerdasView';

/* ══════════════════════════════════════════════════════════════════
   Relatórios da Via Pesados.

   Três regras que sustentam a densidade sem virar bagunça:

   1. Todo bloco declara no título se é FILME ou FOTO. "· {período}"
      responde ao seletor; "· hoje" é um retrato e o ignora; "· 12 meses"
      é série fixa. Ninguém precisa adivinhar o que o filtro governa.

   2. Nada é estimado. Sem insumo, o bloco mostra a frase que NOMEIA o
      que falta — nunca um número chutado com o mesmo peso de um medido.

   3. Toda divisão imprime o denominador. "43% · 3 de 7" em vez de "43%".

   O QUE NÃO EXISTE AQUI, e por quê:
   · Expansão, contração e NRR — clients.mrr não tem histórico. As séries
     de MRR são RECONSTRUÍDAS de activated_at/canceled_at com o valor
     ATUAL do contrato; sem o valor de ontem não há delta.
   · Motivo de cancelamento — não há campo. Só motivo de negócio perdido.
   · Tempo até apresentar a amostra — demos não registra presented_at.

   Três campos destravariam o resto, nesta ordem de retorno:
   clients.churn_reason · mrr_history(client_id, mrr, changed_at) ·
   demos.presented_at.
   ══════════════════════════════════════════════════════════════════ */

type AbaId = 'recorrencia' | 'aquisicao' | 'caixa' | 'operacao' | 'perdas';

const ABAS: { id: AbaId; rotulo: string; icone: typeof Repeat }[] = [
  { id: 'recorrencia', rotulo: 'Recorrência', icone: Repeat },
  { id: 'aquisicao', rotulo: 'Aquisição', icone: Target },
  { id: 'caixa', rotulo: 'Caixa', icone: Wallet },
  { id: 'operacao', rotulo: 'Operação', icone: LifeBuoy },
  { id: 'perdas', rotulo: 'Perdas', icone: XCircle },
];

const PERIOD_LABELS: Record<string, string> = {
  semana: 'Semana', mes: 'Mês', mes_passado: 'Mês Passado',
  trimestre: 'Trimestre', ano: 'Ano', todo: 'Total',
};

const rotuloPeriodo = (p: string) =>
  p.startsWith('custom:') ? 'Período' : (PERIOD_LABELS[p] ?? 'Período');

export default function Relatorios() {
  const [aba, setAba] = useState<AbaId>('recorrencia');
  const [periodo, setPeriodo] = useState('mes');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [colaborador, setColaborador] = useState('todos');

  // Todos os hooks no shell: 60 blocos chamando hook cada um custa
  // re-render em cascata, mesmo com a dedup do react-query.
  const { data: clients = [] } = useClients();
  const { data: prospects = [] } = useProspects();
  const { data: meetings = [] } = useMeetings();
  const { data: demos = [] } = useDemos();
  const { data: tickets = [] } = useTickets();
  const { data: payments = [] } = usePayments();
  const { data: transacoes = [] } = useFinTransactions();
  const { data: team = [] } = useTeam();

  const efetivo = periodo === 'personalizado' && inicio && fim
    ? `custom:${inicio}:${fim}`
    : periodo;

  const range = useMemo(() => getDateRangeForPeriod(efetivo), [efetivo]);
  const label = rotuloPeriodo(efetivo);

  /* ── Recorte por responsável ──────────────────────────────────────
     Lançamentos e cobranças não têm dono: na aba Caixa o seletor fica
     desabilitado em vez de sumir, para o cabeçalho não mudar de forma. */
  const filtrado = useMemo(() => {
    if (colaborador === 'todos') return { clients, prospects, meetings, tickets, demos };
    const dono = colaborador === 'sem' ? null : colaborador;
    return {
      clients: clients.filter((c) => (c.owner_id ?? null) === dono),
      prospects: prospects.filter((p) => (p.owner_id ?? null) === dono),
      meetings: meetings.filter((m) => (m.owner_id ?? null) === dono),
      tickets: tickets.filter((t) => (t.assigned_to ?? null) === dono),
      demos: demos.filter((d) => (d.created_by ?? null) === dono),
    };
  }, [clients, prospects, meetings, tickets, demos, colaborador]);

  const membrosAtivos = team.filter((m) => m.is_active);
  const seletorDesabilitado = aba === 'caixa';

  return (
    <div className="space-y-6">
      {/* ── Filtros ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <div className={cn('relative', seletorDesabilitado && 'opacity-40 cursor-not-allowed')}>
          <Users className="h-3.5 w-3.5 text-foreground/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={colaborador}
            onChange={(e) => setColaborador(e.target.value)}
            disabled={seletorDesabilitado}
            title={seletorDesabilitado ? 'Lançamentos financeiros não têm responsável' : undefined}
            className={cn(
              'h-8 pl-9 pr-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]',
              'border border-black/[0.08] dark:border-white/[0.08]',
              'text-[13px] text-foreground/70 focus:outline-none appearance-none',
              seletorDesabilitado && 'pointer-events-none',
            )}
          >
            <option value="todos">Todos</option>
            <option value="sem">Sem responsável</option>
            {membrosAtivos.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </div>

        <DateRangeSelector
          value={periodo}
          onChange={setPeriodo}
          customStart={inicio}
          customEnd={fim}
          onCustomStart={setInicio}
          onCustomEnd={setFim}
        />
      </div>

      {/* ── Abas ────────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex items-center gap-1.5 p-1 bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl w-max">
          {ABAS.map(({ id, rotulo, icone: Icone }) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 rounded-xl text-[13px] font-medium whitespace-nowrap transition-all',
                aba === id
                  ? 'bg-black/[0.06] dark:bg-white/[0.10] text-foreground shadow-sm'
                  : 'text-foreground/40 hover:text-foreground/70',
              )}
            >
              <Icone className="h-4 w-4" />
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo ────────────────────────────────────────────── */}
      {aba === 'recorrencia' && (
        <RecorrenciaTab clients={filtrado.clients} periodo={range} label={label} />
      )}
      {aba === 'aquisicao' && (
        <AquisicaoTab
          prospects={filtrado.prospects} clients={filtrado.clients}
          meetings={filtrado.meetings} demos={filtrado.demos}
          periodo={range} label={label}
        />
      )}
      {aba === 'caixa' && (
        <CaixaTab transacoes={transacoes} payments={payments} periodo={range} label={label} />
      )}
      {aba === 'operacao' && (
        <OperacaoTab
          clients={filtrado.clients} tickets={filtrado.tickets} team={team}
          prospects={filtrado.prospects} meetings={filtrado.meetings}
          periodo={range} label={label}
        />
      )}
      {aba === 'perdas' && (
        <PerdasView
          clients={filtrado.clients} prospects={filtrado.prospects}
          periodo={range} label={label}
        />
      )}
    </div>
  );
}
