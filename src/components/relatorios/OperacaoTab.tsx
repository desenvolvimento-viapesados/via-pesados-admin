import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart as RePieChart, Pie, Legend,
} from 'recharts';
import {
  LifeBuoy, Clock, CheckCircle2, Flame, Rocket, Timer,
  Users, Gauge, ListChecks, Inbox,
} from 'lucide-react';
import type { Client, Ticket, TeamMemberRow, Prospect, Meeting } from '@/hooks/useAdmin';
import {
  GCard, SectionTitle, KpiGrid, Chart, CTip, Empty, RankRow, TintedBlock,
  ZebraTable, Tr, Td, SubTabs, brl, pct,
  TYPE_COLORS, EIXO, GRADE, CURSOR,
} from './primitives';
import { cn } from '@/lib/utils';

interface Props {
  clients: Client[];
  tickets: Ticket[];
  team: TeamMemberRow[];
  prospects: Prospect[];
  meetings: Meeting[];
  periodo: { start: string; end: string };
  label: string;
}

const dias = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
const desde = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));

const PRIO_COR: Record<string, string> = {
  urgente: 'hsl(0,80%,45%)',
  alta: 'hsl(0,70%,50%)',
  media: 'hsl(45,90%,50%)',
  baixa: 'hsl(220,10%,45%)',
};

export function OperacaoTab({ clients, tickets, team, prospects, meetings, periodo, label }: Props) {
  const navigate = useNavigate();
  const [sub, setSub] = useState('Entrega');

  const inP = (iso: string | null | undefined) =>
    !!iso && iso.slice(0, 10) >= periodo.start && iso.slice(0, 10) <= periodo.end;

  /* ── Entrega: do contrato ao sistema no ar ───────────────────── */
  const entrega = useMemo(() => {
    const emOnboarding = clients.filter((c) => c.status === 'onboarding');
    const ativados = clients.filter((c) => inP(c.activated_at));

    const temposAtivacao = clients
      .filter((c) => c.contract_signed_at && c.activated_at)
      .map((c) => dias(c.contract_signed_at!, c.activated_at!));
    const medio = temposAtivacao.length
      ? Math.round(temposAtivacao.reduce((a, b) => a + b, 0) / temposAtivacao.length)
      : null;

    const faixas = [
      { nome: 'Até 15 dias', cor: 'hsl(152,60%,45%)', min: 0, max: 15 },
      { nome: '16–30 dias', cor: 'hsl(45,90%,50%)', min: 16, max: 30 },
      { nome: '31–60 dias', cor: 'hsl(25,95%,53%)', min: 31, max: 60 },
      { nome: '+60 dias', cor: 'hsl(0,70%,50%)', min: 61, max: 99999 },
    ].map((f) => {
      const l = emOnboarding.filter((c) => {
        const d = desde(c.created_at);
        return d >= f.min && d <= f.max;
      });
      return { ...f, n: l.length, mrr: l.reduce((s, c) => s + Number(c.mrr ?? 0), 0) };
    });

    const comSistema = clients.filter((c) => c.lojista_company_id).length;
    const comDominio = clients.filter((c) => c.domain).length;

    return {
      emOnboarding: emOnboarding.length,
      mrrParado: emOnboarding.reduce((s, c) => s + Number(c.mrr ?? 0), 0),
      ativados: ativados.length,
      medio, nMedio: temposAtivacao.length,
      faixas,
      comSistema, comDominio,
      lista: [...emOnboarding].sort((a, b) => desde(b.created_at) - desde(a.created_at)),
    };
  }, [clients, periodo]);

  /* ── Suporte ─────────────────────────────────────────────────── */
  const suporte = useMemo(() => {
    const abertosNoP = tickets.filter((t) => inP(t.created_at));
    const resolvidosNoP = tickets.filter((t) => inP(t.resolved_at));
    const emAberto = tickets.filter((t) => t.status !== 'resolvido');

    const tempos = tickets
      .filter((t) => t.resolved_at)
      .map((t) => dias(t.created_at, t.resolved_at!));
    const medio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;

    const porPrioridade = new Map<string, number>();
    emAberto.forEach((t) => {
      const k = t.priority ?? 'media';
      porPrioridade.set(k, (porPrioridade.get(k) ?? 0) + 1);
    });

    /* Agrupa pelo próprio ticket, não cruzando com `clients`: essa lista
       já vem recortada pelo seletor de responsável, e o cruzamento jogava
       todo cliente de outro vendedor num balde gigante "Sem cliente". */
    const porCliente = new Map<string, { nome: string; n: number; abertos: number }>();
    let semCliente = 0;
    tickets.forEach((t) => {
      if (!t.client_id) { semCliente += 1; return; }
      const a = porCliente.get(t.client_id)
        ?? { nome: t.client?.company_name ?? 'Cliente removido', n: 0, abertos: 0 };
      a.n += 1;
      if (t.status !== 'resolvido') a.abertos += 1;
      porCliente.set(t.client_id, a);
    });

    const ativos = clients.filter((c) => c.status === 'ativo').length;

    return {
      abertosNoP: abertosNoP.length,
      resolvidosNoP: resolvidosNoP.length,
      emAberto: emAberto.length,
      criticos: emAberto.filter((t) => t.priority === 'alta' || t.priority === 'urgente').length,
      medio, nMedio: tempos.length,
      porPrioridade: (['urgente', 'alta', 'media', 'baixa'] as const)
        .map((p) => ({ nome: p, n: porPrioridade.get(p) ?? 0, cor: PRIO_COR[p] }))
        .filter((p) => p.n > 0),
      porCliente: [...porCliente.values()].sort((a, b) => b.n - a.n).slice(0, 8),
      nClientesComTicket: porCliente.size,
      semCliente,
      porBase: ativos > 0 ? tickets.length / ativos : null,
      ativos,
      maisVelho: emAberto.length
        ? emAberto.reduce((a, b) => (a.created_at < b.created_at ? a : b))
        : null,
    };
  }, [tickets, clients, periodo]);

  /* ── Time ────────────────────────────────────────────────────── */
  const porPessoa = useMemo(() => {
    const ativos = team.filter((m) => m.is_active);
    const linhas = ativos.map((m) => {
      const meusProspects = prospects.filter((p) => p.owner_id === m.id);
      const ganhos = meusProspects.filter((p) => p.stage === 'ganho' && inP(p.updated_at));
      const perdidos = meusProspects.filter((p) => p.stage === 'perdido' && inP(p.updated_at));
      const meusClientes = clients.filter((c) => c.owner_id === m.id && c.status === 'ativo');
      return {
        id: m.id,
        nome: m.full_name,
        papel: m.role,
        abertos: meusProspects.filter((p) => !['ganho', 'perdido'].includes(p.stage)).length,
        ganhos: ganhos.length,
        decididos: ganhos.length + perdidos.length,
        reunioes: meetings.filter((x) => x.owner_id === m.id && x.status === 'realizada' && inP(x.scheduled_at)).length,
        tickets: tickets.filter((t) => t.assigned_to === m.id && t.status !== 'resolvido').length,
        mrr: meusClientes.reduce((s, c) => s + Number(c.mrr ?? 0), 0),
        clientes: meusClientes.length,
      };
    });

    const semDono = {
      prospects: prospects.filter((p) => !p.owner_id).length,
      clientes: clients.filter((c) => !c.owner_id).length,
    };

    return { linhas: linhas.sort((a, b) => b.mrr - a.mrr || b.ganhos - a.ganhos), semDono };
  }, [team, prospects, clients, meetings, tickets, periodo]);

  return (
    <div className="space-y-6">
      <SubTabs opcoes={['Entrega', 'Suporte', 'Time']} valor={sub} onChange={setSub} cor="violet" />

      {sub === 'Entrega' && (
        <div className="space-y-6">
          <KpiGrid items={[
            {
              icon: <Rocket className="h-4 w-4" />, accent: true,
              label: 'Em onboarding · hoje',
              value: entrega.emOnboarding > 0 ? String(entrega.emOnboarding) : '—',
              sub: entrega.mrrParado > 0
                ? `${brl(entrega.mrrParado)} de MRR ainda não ativado`
                : 'Nenhum cliente em implantação.',
            },
            {
              icon: <Timer className="h-4 w-4" />,
              label: 'Tempo até ativar · hoje',
              value: entrega.medio !== null ? `${entrega.medio}d` : '—',
              sub: entrega.nMedio > 0
                ? `Média de ${entrega.nMedio} ativação${entrega.nMedio > 1 ? 'ões' : ''}, da assinatura ao ar`
                : 'Nenhum contrato assinado e ativado ainda.',
            },
            {
              icon: <CheckCircle2 className="h-4 w-4" />,
              label: `Ativados · ${label}`,
              value: entrega.ativados > 0 ? String(entrega.ativados) : '—',
              sub: entrega.ativados > 0 ? 'Sistemas que entraram no ar' : 'Nenhuma ativação no período.',
            },
            {
              icon: <ListChecks className="h-4 w-4" />,
              label: 'Sistemas provisionados · hoje',
              value: entrega.comSistema > 0 ? String(entrega.comSistema) : '—',
              sub: entrega.comSistema > 0
                ? `${entrega.comDominio} com domínio próprio conectado`
                : 'Nenhum sistema criado ainda.',
            },
          ]} />

          <GCard>
            <SectionTitle
              icon={<Clock className="h-4 w-4" />}
              title="Idade da implantação · hoje"
              sub="Há quanto tempo cada cliente está em onboarding — implantação que arrasta é MRR parado e risco de churn antes do primeiro uso"
            />
            {entrega.emOnboarding > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {entrega.faixas.map((f) => (
                  <TintedBlock
                    key={f.nome}
                    titulo={f.nome}
                    cor={f.cor}
                    valor={String(f.n)}
                    sub={f.mrr > 0 ? `${brl(f.mrr)} parado` : 'sem MRR informado'}
                  />
                ))}
              </div>
            ) : (
              <Empty h={140}>Nenhum cliente em implantação.</Empty>
            )}
          </GCard>

          <GCard>
            <SectionTitle
              icon={<Gauge className="h-4 w-4" />}
              title="Fila de implantação · hoje"
              sub="Do mais antigo para o mais novo"
            />
            {entrega.lista.length > 0 ? (
              <div className="space-y-2">
                {entrega.lista.slice(0, 8).map((c, i) => (
                  <RankRow
                    key={c.id}
                    pos={i + 1}
                    nome={c.company_name}
                    meta={`${desde(c.created_at)} dias · ${c.lojista_company_id ? 'sistema criado' : 'sistema pendente'}`}
                    valor={Number(c.mrr ?? 0) > 0 ? brl(Number(c.mrr)) : '—'}
                    cor={desde(c.created_at) > 30 ? 'hsl(0,70%,50%)' : TYPE_COLORS[i % 6]}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  />
                ))}
              </div>
            ) : (
              <Empty h={160}>Nenhum cliente em implantação.</Empty>
            )}
          </GCard>
        </div>
      )}

      {sub === 'Suporte' && (
        <div className="space-y-6">
          <KpiGrid items={[
            {
              icon: <Inbox className="h-4 w-4" />, accent: true,
              label: 'Tickets em aberto · hoje',
              value: suporte.emAberto > 0 ? String(suporte.emAberto) : '—',
              sub: suporte.criticos > 0
                ? `${suporte.criticos} de prioridade alta ou urgente`
                : suporte.emAberto > 0 ? 'Nenhum crítico' : 'Fila vazia.',
            },
            {
              icon: <Clock className="h-4 w-4" />,
              label: 'Tempo de resolução · hoje',
              value: suporte.medio !== null ? `${suporte.medio}d` : '—',
              sub: suporte.nMedio > 0
                ? `Média de ${suporte.nMedio} ticket${suporte.nMedio > 1 ? 's' : ''} resolvido${suporte.nMedio > 1 ? 's' : ''}`
                : 'Nenhum ticket resolvido ainda.',
            },
            {
              icon: <CheckCircle2 className="h-4 w-4" />,
              label: `Abertos e resolvidos · ${label}`,
              value: (suporte.abertosNoP + suporte.resolvidosNoP) > 0
                ? `${suporte.abertosNoP} / ${suporte.resolvidosNoP}`
                : '—',
              sub: 'Abertos / resolvidos no período',
            },
            {
              icon: <LifeBuoy className="h-4 w-4" />,
              label: 'Tickets por cliente · hoje',
              value: suporte.porBase !== null ? suporte.porBase.toFixed(1) : '—',
              sub: suporte.ativos > 0
                ? `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} ÷ ${suporte.ativos} cliente${suporte.ativos > 1 ? 's' : ''} ativo${suporte.ativos > 1 ? 's' : ''}`
                : 'Nenhum cliente ativo para comparar.',
            },
          ]} />

          <div className="grid gap-4 md:grid-cols-2">
            <GCard>
              <SectionTitle
                icon={<Flame className="h-4 w-4" />}
                title="Fila por prioridade · hoje"
                sub="Só tickets ainda não resolvidos"
              />
              {suporte.porPrioridade.length > 0 ? (
                <Chart h={250}>
                  <RePieChart>
                    <Pie
                      data={suporte.porPrioridade} dataKey="n" nameKey="nome"
                      cx="50%" cy="50%" innerRadius={46} outerRadius={80} paddingAngle={3}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                    >
                      {suporte.porPrioridade.map((p) => <Cell key={p.nome} fill={p.cor} />)}
                    </Pie>
                    <Tooltip content={<CTip fmt={(v) => `${v} ticket${v > 1 ? 's' : ''}`} />} />
                  </RePieChart>
                </Chart>
              ) : (
                <Empty h={250}>Nenhum ticket em aberto.</Empty>
              )}
            </GCard>

            <GCard>
              <SectionTitle
                icon={<Users className="h-4 w-4" />}
                title="Clientes que mais abrem chamado · hoje"
                sub="Histórico completo — cliente que some da lista pode ter parado de usar"
              />
              {suporte.porCliente.length > 0 ? (
                <div className="space-y-2">
                  {suporte.porCliente.map((c, i) => (
                    <RankRow
                      key={c.nome}
                      pos={i + 1}
                      nome={c.nome}
                      meta={c.abertos > 0 ? `${c.abertos} em aberto` : 'todos resolvidos'}
                      valor={String(c.n)}
                      cor={c.abertos > 0 ? 'hsl(0,70%,50%)' : TYPE_COLORS[i % 6]}
                    />
                  ))}
                  {suporte.semCliente > 0 && (
                    <p className="text-[11px] text-foreground/30 pt-1">
                      {suporte.semCliente} chamado{suporte.semCliente > 1 ? 's' : ''} sem cliente vinculado, fora do ranking.
                    </p>
                  )}
                </div>
              ) : (
                <Empty h={250}>
                  {suporte.semCliente > 0
                    ? `${suporte.semCliente} chamado${suporte.semCliente > 1 ? 's' : ''} registrado${suporte.semCliente > 1 ? 's' : ''}, nenhum com cliente vinculado.`
                    : 'Nenhum ticket registrado.'}
                </Empty>
              )}
            </GCard>
          </div>

          {suporte.maisVelho && (
            <GCard>
              <SectionTitle
                icon={<Clock className="h-4 w-4" />}
                title="Chamado mais antigo em aberto"
                sub="O que está esperando há mais tempo"
              />
              <div
                onClick={() => navigate('/tickets')}
                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.05] cursor-pointer hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors"
              >
                <span className={cn('h-2 w-2 rounded-full shrink-0')} style={{ background: PRIO_COR[suporte.maisVelho.priority ?? 'media'] }} />
                <p className="text-[13px] text-foreground/80 flex-1 truncate">{suporte.maisVelho.subject}</p>
                <p className="text-[12px] text-foreground/40 tabular-nums shrink-0">
                  {desde(suporte.maisVelho.created_at)} dias
                </p>
              </div>
            </GCard>
          )}
        </div>
      )}

      {sub === 'Time' && (
        <div className="space-y-6">
          <GCard>
            <SectionTitle
              icon={<Users className="h-4 w-4" />}
              title={`Time · ${label}`}
              sub="Carteira e atividade de cada membro ativo. Ganhos e reuniões respeitam o período; carteira e fila são de hoje"
            />
            {porPessoa.linhas.length > 0 ? (
              <ZebraTable head={['Membro', 'Em aberto', 'Ganhos', 'Win rate', 'Reuniões', 'Tickets', 'Clientes', 'MRR']} sticky>
                {porPessoa.linhas.map((p) => (
                  <Tr key={p.id}>
                    <Td sticky className="text-foreground/70">
                      {p.nome}
                      <span className="text-foreground/25 ml-1.5 text-[11px]">{p.papel}</span>
                    </Td>
                    <Td>{p.abertos || '—'}</Td>
                    <Td className={p.ganhos > 0 ? 'text-emerald-500' : 'text-foreground/25'}>{p.ganhos || '—'}</Td>
                    <Td>{pct(p.ganhos, p.decididos, 0)}</Td>
                    <Td>{p.reunioes || '—'}</Td>
                    <Td className={p.tickets > 0 ? 'text-amber-500' : 'text-foreground/25'}>{p.tickets || '—'}</Td>
                    <Td>{p.clientes || '—'}</Td>
                    <Td className="font-semibold text-foreground">{p.mrr > 0 ? brl(p.mrr) : '—'}</Td>
                  </Tr>
                ))}
              </ZebraTable>
            ) : (
              <Empty h={200}>Nenhum membro ativo na equipe.</Empty>
            )}
            {(porPessoa.semDono.prospects > 0 || porPessoa.semDono.clientes > 0) && (
              <p className="text-[11px] text-foreground/30 mt-3">
                Sem responsável: {porPessoa.semDono.prospects} prospect{porPessoa.semDono.prospects !== 1 ? 's' : ''} · {porPessoa.semDono.clientes} cliente{porPessoa.semDono.clientes !== 1 ? 's' : ''}.
              </p>
            )}
          </GCard>

          <GCard>
            <SectionTitle
              icon={<Gauge className="h-4 w-4" />}
              title={`Carteira por membro · ${label}`}
              sub="MRR sob responsabilidade de cada um"
            />
            {porPessoa.linhas.some((p) => p.mrr > 0) ? (
              <Chart h={260}>
                <BarChart data={porPessoa.linhas.filter((p) => p.mrr > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                  <XAxis dataKey="nome" {...EIXO} />
                  <YAxis tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} {...EIXO} />
                  <Tooltip cursor={CURSOR} content={<CTip fmt={brl} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="mrr" name="MRR" radius={[4, 4, 0, 0]}>
                    {porPessoa.linhas.filter((p) => p.mrr > 0).map((_, i) => (
                      <Cell key={i} fill={TYPE_COLORS[i % 6]} />
                    ))}
                  </Bar>
                </BarChart>
              </Chart>
            ) : (
              <Empty h={260}>Nenhum membro com carteira atribuída.</Empty>
            )}
          </GCard>
        </div>
      )}
    </div>
  );
}
