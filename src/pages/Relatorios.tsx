import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useProspects, useMeetings, useDemos, useClients, useTickets, usePayments,
  useFinTransactions, brl, brlFull,
} from '@/hooks/useAdmin';
import { SectionHeader, Panel } from '@/components/admin/ui';

/* ── Utilitários de tempo ───────────────────────────────────────── */
const ultimosMeses = (n: number) => {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

const mesLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};

/** Primeiro instante do mês seguinte — o corte de "fim do mês". */
const fimDoMes = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1);
const dias = (ms: number) => Math.round(ms / 86_400_000);

/* ── Métrica com explicação ─────────────────────────────────────
   Métrica de SaaS sem definição é número solto: cada uma carrega o
   que significa e como foi calculada. */
const Metrica = ({
  label, valor, sub, explica, accent, alerta,
}: {
  label: string;
  valor: React.ReactNode;
  sub?: string;
  explica: string;
  accent?: string;
  alerta?: boolean;
}) => (
  <Panel className={cn('p-4 group relative', alerta && 'border-red-500/25')}>
    <div className="flex items-start justify-between gap-2">
      <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30">{label}</p>
      <Info className="h-3 w-3 text-foreground/20 shrink-0 mt-0.5" />
    </div>
    <p className={cn('text-[22px] font-bold tracking-tight mt-1 tabular-nums', accent ?? 'text-foreground')}>{valor}</p>
    {sub && <p className="text-[11px] text-foreground/35 mt-0.5">{sub}</p>}
    <div className="pointer-events-none absolute inset-x-0 bottom-full mb-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity px-2">
      <p className="rounded-lg bg-foreground text-background text-[11px] leading-snug px-3 py-2 shadow-xl">{explica}</p>
    </div>
  </Panel>
);

const Bloco = ({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) => (
  <div>
    <SectionHeader title={titulo} right={<span className="text-[11px] text-foreground/35 hidden sm:block">{nota}</span>} />
    {children}
  </div>
);

/* ── Página ─────────────────────────────────────────────────────── */
export default function Relatorios() {
  const { data: prospects = [] } = useProspects();
  const { data: meetings = [] } = useMeetings();
  const { data: demos = [] } = useDemos();
  const { data: clients = [] } = useClients();
  const { data: tickets = [] } = useTickets();
  const { data: payments = [] } = usePayments();
  const { data: transacoes = [] } = useFinTransactions();

  const [janela, setJanela] = useState(12);
  const meses = useMemo(() => ultimosMeses(janela), [janela]);

  /* ══ Receita e movimento de MRR ══════════════════════════════════
     O coração de qualquer SaaS: não é o MRR de hoje, é como ele se
     move. Novo, expansão, contração e churn contam histórias
     diferentes sobre o mesmo saldo. */
  const receita = useMemo(() => {
    const vivo = (c: typeof clients[number], corte: Date) => {
      if (new Date(c.created_at) >= corte) return false;
      if (!c.canceled_at) return c.status !== 'cancelado';
      return new Date(c.canceled_at) >= corte;
    };

    const serie = meses.map((m) => {
      const corte = fimDoMes(m);
      const ativos = clients.filter((c) => vivo(c, corte));
      const mrr = ativos.reduce((s, c) => s + Number(c.mrr ?? 0), 0);
      const novos = clients.filter((c) => c.created_at.slice(0, 7) === m);
      const perdidos = clients.filter((c) => (c.canceled_at ?? '').slice(0, 7) === m);
      return {
        mes: m,
        ativos: ativos.length,
        mrr,
        novoMrr: novos.reduce((s, c) => s + Number(c.mrr ?? 0), 0),
        churnMrr: perdidos.reduce((s, c) => s + Number(c.mrr ?? 0), 0),
        novos: novos.length,
        perdidos: perdidos.length,
      };
    });

    const atual = serie[serie.length - 1];
    const anterior = serie[serie.length - 2];
    const mrr = atual?.mrr ?? 0;
    const arr = mrr * 12;
    const arpa = atual?.ativos ? mrr / atual.ativos : 0;

    // Churn do mês sobre a base do início do mês
    const baseInicio = anterior?.ativos ?? 0;
    const churnLogo = baseInicio ? ((atual?.perdidos ?? 0) / baseInicio) * 100 : 0;
    const churnReceita = (anterior?.mrr ?? 0) ? ((atual?.churnMrr ?? 0) / (anterior?.mrr ?? 1)) * 100 : 0;

    // NRR sem upsell registrado é GRR: assumimos base sem expansão
    const nrr = (anterior?.mrr ?? 0) ? (((anterior!.mrr - (atual?.churnMrr ?? 0)) / anterior!.mrr) * 100) : 100;

    const crescimentoMes = (anterior?.mrr ?? 0) ? ((mrr - anterior!.mrr) / anterior!.mrr) * 100 : 0;

    // Concentração: quanto do MRR depende do maior cliente
    const ativosHoje = clients.filter((c) => c.status === 'ativo' || c.status === 'onboarding');
    const maiores = [...ativosHoje].sort((a, b) => Number(b.mrr ?? 0) - Number(a.mrr ?? 0));
    const topShare = mrr ? (Number(maiores[0]?.mrr ?? 0) / mrr) * 100 : 0;
    const top3Share = mrr ? (maiores.slice(0, 3).reduce((s, c) => s + Number(c.mrr ?? 0), 0) / mrr) * 100 : 0;

    return { serie, atual, anterior, mrr, arr, arpa, churnLogo, churnReceita, nrr, crescimentoMes, topShare, top3Share, ativosHoje, maiores };
  }, [clients, meses]);

  /* ══ Aquisição: CAC, LTV, payback ════════════════════════════════ */
  const aquisicao = useMemo(() => {
    // O que a Via Pesados gastou para vender: marketing e comissões
    const CATS_AQUISICAO = ['Marketing e anúncios', 'Comissões'];
    const gastoAquisicao = transacoes
      .filter((t) => t.type === 'despesa' && t.status !== 'cancelado'
        && CATS_AQUISICAO.includes(t.category?.name ?? '')
        && t.competence_date.slice(0, 7) >= meses[0])
      .reduce((s, t) => s + Number(t.amount), 0);

    const ganhosNaJanela = clients.filter((c) => c.created_at.slice(0, 7) >= meses[0]);
    const cac = ganhosNaJanela.length ? gastoAquisicao / ganhosNaJanela.length : 0;

    // Vida média a partir do churn mensal; sem churn ainda, o horizonte
    // fica em 36 meses para não estourar o LTV com divisão por zero.
    const churnMensal = receita.churnLogo / 100;
    const vidaMeses = churnMensal > 0 ? 1 / churnMensal : 36;
    const ltv = receita.arpa * vidaMeses;
    const paybackMeses = receita.arpa > 0 ? cac / receita.arpa : 0;
    const razao = cac > 0 ? ltv / cac : 0;

    return { gastoAquisicao, cac, ltv, vidaMeses, paybackMeses, razao, ganhos: ganhosNaJanela.length };
  }, [transacoes, clients, meses, receita]);

  /* ══ Eficiência: Rule of 40, burn multiple, margem ════════════════ */
  const eficiencia = useMemo(() => {
    const naJanela = transacoes.filter((t) => t.status !== 'cancelado' && t.competence_date.slice(0, 7) >= meses[0]);
    const rec = naJanela.filter((t) => t.type === 'receita').reduce((s, t) => s + Number(t.amount), 0);
    const des = naJanela.filter((t) => t.type === 'despesa').reduce((s, t) => s + Number(t.amount), 0);
    const resultado = rec - des;
    const margem = rec ? (resultado / rec) * 100 : 0;

    // Rule of 40: crescimento anualizado + margem. Acima de 40 é saudável.
    const crescimentoAnual = receita.crescimentoMes * 12;
    const ruleOf40 = crescimentoAnual + margem;

    // Burn multiple: quanto queimou para cada real de MRR novo
    const mrrNovoJanela = receita.serie.reduce((s, m) => s + m.novoMrr, 0);
    const queima = resultado < 0 ? Math.abs(resultado) : 0;
    const burnMultiple = mrrNovoJanela > 0 ? queima / mrrNovoJanela : 0;

    // Custo de servir: infra e ferramentas contra a receita
    const CATS_COGS = ['Infraestrutura e nuvem', 'Ferramentas e licenças'];
    const cogs = naJanela
      .filter((t) => t.type === 'despesa' && CATS_COGS.includes(t.category?.name ?? ''))
      .reduce((s, t) => s + Number(t.amount), 0);
    const margemBruta = rec ? ((rec - cogs) / rec) * 100 : 0;

    return { rec, des, resultado, margem, ruleOf40, crescimentoAnual, burnMultiple, cogs, margemBruta };
  }, [transacoes, meses, receita]);

  /* ══ Funil comercial ═════════════════════════════════════════════ */
  const funil = useMemo(() => {
    const ETAPAS = [
      { key: 'novo', label: 'Novos' },
      { key: 'contato', label: 'Em contato' },
      { key: 'reuniao', label: 'Reunião' },
      { key: 'amostra', label: 'Amostra' },
      { key: 'proposta', label: 'Proposta' },
      { key: 'fechamento', label: 'Fechamento' },
    ];
    const porEtapa = ETAPAS.map(({ key, label }) => ({
      label,
      total: prospects.filter((p) => p.stage === key).length,
      valor: prospects.filter((p) => p.stage === key).reduce((s, p) => s + Number(p.proposal_value ?? 0), 0),
    }));

    const ganhos = prospects.filter((p) => p.stage === 'ganho');
    const perdidos = prospects.filter((p) => p.stage === 'perdido');
    const fechados = ganhos.length + perdidos.length;
    const winRate = fechados ? (ganhos.length / fechados) * 100 : 0;

    // Ciclo de venda: do cadastro do prospect à assinatura do contrato
    const ciclos = clients
      .filter((c) => c.contract_signed_at && c.created_at)
      .map((c) => dias(new Date(c.contract_signed_at!).getTime() - new Date(c.created_at).getTime()))
      .filter((d) => d >= 0);
    const cicloMedio = ciclos.length ? ciclos.reduce((a, b) => a + b, 0) / ciclos.length : 0;

    const pipeline = prospects
      .filter((p) => !['ganho', 'perdido'].includes(p.stage))
      .reduce((s, p) => s + Number(p.proposal_value ?? 0), 0);
    const cobertura = receita.mrr ? pipeline / receita.mrr : 0;

    const reunioesFeitas = meetings.filter((m) => m.status === 'realizada').length;
    const amostrasCriadas = demos.length;
    const amostrasConvertidas = demos.filter((d) => d.status === 'convertida').length;

    const motivos: Record<string, number> = {};
    perdidos.forEach((p) => {
      const r = p.lost_reason?.trim() || 'Sem motivo registrado';
      motivos[r] = (motivos[r] ?? 0) + 1;
    });

    return {
      porEtapa, maxEtapa: Math.max(1, ...porEtapa.map((e) => e.total)),
      ganhos: ganhos.length, perdidos: perdidos.length, winRate, cicloMedio, pipeline, cobertura,
      reunioesFeitas, amostrasCriadas, amostrasConvertidas,
      taxaAmostra: amostrasCriadas ? (amostrasConvertidas / amostrasCriadas) * 100 : 0,
      motivos: Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [prospects, clients, meetings, demos, receita]);

  /* ══ Suporte e saúde da carteira ═════════════════════════════════ */
  const suporte = useMemo(() => {
    const abertos = tickets.filter((t) => t.status !== 'resolvido');
    const resolvidos = tickets.filter((t) => t.resolved_at);
    const tempos = resolvidos.map((t) => dias(new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()));
    const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0;
    const base = receita.ativosHoje.length || 1;

    // Clientes sem ticket algum: ou estão bem, ou estão calados demais
    const comTicket = new Set(tickets.map((t) => t.client_id));
    const silenciosos = receita.ativosHoje.filter((c) => !comTicket.has(c.id)).length;

    return {
      abertos: abertos.length,
      total: tickets.length,
      tempoMedio,
      porCliente: tickets.length / base,
      criticos: abertos.filter((t) => t.priority === 'alta' || t.priority === 'urgente').length,
      silenciosos,
    };
  }, [tickets, receita]);

  /* ══ Cobrança ════════════════════════════════════════════════════ */
  const cobranca = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const emAberto = payments.filter((p) => p.status !== 'pago');
    const vencidas = emAberto.filter((p) => p.due_date < hoje);
    const totalEmitido = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const totalPago = payments.filter((p) => p.status === 'pago').reduce((s, p) => s + Number(p.amount ?? 0), 0);
    return {
      emAberto: emAberto.reduce((s, p) => s + Number(p.amount ?? 0), 0),
      vencido: vencidas.reduce((s, p) => s + Number(p.amount ?? 0), 0),
      clientesVencidos: new Set(vencidas.map((p) => p.client_id)).size,
      taxaRecebimento: totalEmitido ? (totalPago / totalEmitido) * 100 : 0,
    };
  }, [payments]);

  const maxMrr = Math.max(1, ...receita.serie.map((s) => s.mrr));
  const pct = (v: number) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(1)}%`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Relatórios</h1>
          <p className="text-[12px] text-foreground/40 mt-0.5">
            A operação da Via Pesados pelas métricas que definem uma empresa de software
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {[6, 12, 24].map((n) => (
            <button key={n} onClick={() => setJanela(n)}
              className={cn('h-7 px-3 rounded-lg text-[11.5px] font-medium transition-colors',
                janela === n ? 'bg-primary text-primary-foreground'
                  : 'text-foreground/40 hover:text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]')}>
              {n}m
            </button>
          ))}
        </div>
      </div>

      {/* ══ Receita recorrente ══ */}
      <Bloco titulo="Receita recorrente" nota="o saldo e como ele se move">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metrica label="MRR" valor={brl(receita.mrr)} accent="text-primary"
            sub={receita.crescimentoMes !== 0 ? `${pct(receita.crescimentoMes)} vs. mês anterior` : 'estável'}
            explica="Receita mensal recorrente: a soma das mensalidades dos clientes vivos no fim do mês. É o número que uma SaaS reporta antes de qualquer outro." />
          <Metrica label="ARR" valor={brl(receita.arr)}
            explica="MRR × 12. A receita anualizada que a base atual sustenta se nada mudar." />
          <Metrica label="ARPA" valor={brl(receita.arpa)} sub={`${receita.atual?.ativos ?? 0} clientes ativos`}
            explica="Receita média por conta: MRR dividido pelo número de clientes ativos. Subir ARPA sem subir preço significa vender planos melhores." />
          <Metrica label="NRR" valor={`${receita.nrr.toFixed(0)}%`}
            accent={receita.nrr >= 100 ? 'text-emerald-500' : receita.nrr >= 90 ? 'text-amber-500' : 'text-red-400'}
            sub={receita.nrr >= 100 ? 'a base cresce sozinha' : 'a base encolhe sem novas vendas'}
            explica="Net Revenue Retention: quanto da receita do mês anterior sobrevive, já descontado o churn. Acima de 100% a base cresce sem vender para ninguém novo. Sem upsell registrado, equivale ao GRR." />
        </div>

        <Panel className="p-4 mt-3">
          <div className="flex items-end gap-1.5 h-40">
            {receita.serie.map((s) => (
              <div key={s.mes} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group/bar">
                <span className="text-[9px] font-semibold text-foreground/50 tabular-nums opacity-0 group-hover/bar:opacity-100 transition-opacity">
                  {brl(s.mrr)}
                </span>
                <div className="w-full rounded-t-lg bg-primary/60 hover:bg-primary transition-colors min-h-[3px]"
                  style={{ height: `${(s.mrr / maxMrr) * 100}%` }}
                  title={`${s.ativos} clientes · ${brlFull(s.mrr)}`} />
                <span className="text-[9px] text-foreground/35 capitalize">{mesLabel(s.mes)}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Movimento do MRR */}
        <Panel className="mt-3 divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
          {[...receita.serie].reverse().slice(0, 6).map((s) => (
            <div key={s.mes} className="px-4 py-2.5 flex items-center gap-3 text-[12px]">
              <p className="text-foreground/60 capitalize w-20 shrink-0">{mesLabel(s.mes)}</p>
              <p className="text-emerald-500 tabular-nums w-28">{s.novos ? `+${s.novos} · ${brl(s.novoMrr)}` : '—'}</p>
              <p className="text-red-400 tabular-nums w-28">{s.perdidos ? `−${s.perdidos} · ${brl(s.churnMrr)}` : '—'}</p>
              <p className="text-foreground/45 flex-1 tabular-nums">{s.ativos} ativos</p>
              <p className="font-bold text-foreground tabular-nums shrink-0">{brl(s.mrr)}</p>
            </div>
          ))}
        </Panel>
      </Bloco>

      {/* ══ Retenção ══ */}
      <Bloco titulo="Retenção" nota="o que escapa pelo fundo do balde">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metrica label="Churn de clientes" valor={`${receita.churnLogo.toFixed(1)}%`}
            accent={receita.churnLogo > 3 ? 'text-red-400' : 'text-foreground'} alerta={receita.churnLogo > 5}
            sub="ao mês" explica="Logo churn: quantos clientes cancelaram no mês, sobre a base do início do mês. Acima de 3% ao mês, o crescimento vira uma esteira rolante." />
          <Metrica label="Churn de receita" valor={`${receita.churnReceita.toFixed(1)}%`}
            accent={receita.churnReceita > 3 ? 'text-red-400' : 'text-foreground'}
            sub="ao mês" explica="Revenue churn: quanto do MRR foi embora. Se for maior que o churn de clientes, quem está saindo são os contratos grandes." />
          <Metrica label="Vida média" valor={`${aquisicao.vidaMeses.toFixed(0)} meses`}
            sub={aquisicao.vidaMeses >= 36 ? 'sem churn registrado ainda' : 'estimada pelo churn'}
            explica="1 dividido pelo churn mensal. Quanto tempo um cliente fica, em média, antes de cancelar." />
          <Metrica label="Concentração" valor={`${receita.topShare.toFixed(0)}%`}
            accent={receita.topShare > 30 ? 'text-amber-500' : 'text-foreground'}
            sub={`top 3 = ${receita.top3Share.toFixed(0)}% do MRR`}
            explica="Quanto do MRR depende do maior cliente. Acima de 30%, perder um contrato vira um evento de sobrevivência, não um mau mês." />
        </div>
      </Bloco>

      {/* ══ Aquisição ══ */}
      <Bloco titulo="Aquisição" nota="quanto custa e em quanto tempo se paga">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metrica label="CAC" valor={brl(aquisicao.cac)} sub={`${aquisicao.ganhos} clientes na janela`}
            explica="Custo de aquisição: marketing e comissões lançados no Financeiro, divididos pelos clientes ganhos na janela. Sem despesas lançadas nessas categorias, fica zero." />
          <Metrica label="LTV" valor={brl(aquisicao.ltv)} sub="receita esperada por cliente"
            explica="Lifetime Value: ARPA × vida média. Quanto um cliente devolve ao longo do contrato inteiro." />
          <Metrica label="LTV / CAC" valor={aquisicao.razao ? `${aquisicao.razao.toFixed(1)}×` : '—'}
            accent={aquisicao.razao >= 3 ? 'text-emerald-500' : aquisicao.razao > 0 ? 'text-amber-500' : undefined}
            sub={aquisicao.razao >= 3 ? 'saudável' : aquisicao.razao > 0 ? 'abaixo de 3×' : 'sem custo lançado'}
            explica="A régua do mercado é 3×: cada real gasto para adquirir precisa voltar três. Abaixo disso, crescer destrói caixa." />
          <Metrica label="Payback" valor={aquisicao.paybackMeses ? `${aquisicao.paybackMeses.toFixed(1)} meses` : '—'}
            accent={aquisicao.paybackMeses > 12 ? 'text-red-400' : 'text-foreground'}
            explica="Quantos meses de mensalidade pagam o custo de trazer o cliente. Abaixo de 12 meses é o padrão de SaaS eficiente." />
        </div>
      </Bloco>

      {/* ══ Eficiência ══ */}
      <Bloco titulo="Eficiência" nota="crescer e sobrar dinheiro ao mesmo tempo">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metrica label="Rule of 40" valor={eficiencia.ruleOf40.toFixed(0)}
            accent={eficiencia.ruleOf40 >= 40 ? 'text-emerald-500' : 'text-amber-500'}
            sub={`${eficiencia.crescimentoAnual.toFixed(0)}% cresc. + ${eficiencia.margem.toFixed(0)}% margem`}
            explica="Crescimento anualizado somado à margem. A regra diz que a soma deve passar de 40: dá para crescer rápido queimando, ou crescer devagar lucrando — o que não dá é ficar devendo nos dois." />
          <Metrica label="Margem bruta" valor={`${eficiencia.margemBruta.toFixed(0)}%`}
            accent={eficiencia.margemBruta >= 70 ? 'text-emerald-500' : 'text-foreground'}
            sub={`${brl(eficiencia.cogs)} de custo de servir`}
            explica="Receita menos o custo de manter o serviço no ar (nuvem e ferramentas). SaaS madura fica entre 70% e 85%." />
          <Metrica label="Burn multiple" valor={eficiencia.burnMultiple ? `${eficiencia.burnMultiple.toFixed(1)}×` : '—'}
            accent={eficiencia.burnMultiple > 2 ? 'text-red-400' : 'text-foreground'}
            sub={eficiencia.burnMultiple ? 'queimado por real de MRR novo' : 'sem queima na janela'}
            explica="Quanto de caixa foi queimado para cada real de MRR novo. Abaixo de 1× é excepcional; acima de 2× o crescimento está caro demais." />
          <Metrica label="Resultado" valor={brl(eficiencia.resultado)}
            accent={eficiencia.resultado >= 0 ? 'text-emerald-500' : 'text-red-400'}
            sub={`${brl(eficiencia.rec)} − ${brl(eficiencia.des)}`}
            explica="Receita menos despesa por competência, na janela escolhida. Vem dos lançamentos do Financeiro." />
        </div>
      </Bloco>

      {/* ══ Funil ══ */}
      <Bloco titulo="Funil comercial" nota="do primeiro contato ao contrato">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <Metrica label="Win rate" valor={`${funil.winRate.toFixed(0)}%`} accent="text-primary"
            sub={`${funil.ganhos} ganhos · ${funil.perdidos} perdidos`}
            explica="Dos negócios que chegaram a uma conclusão, quantos foram ganhos. Ignora quem ainda está no funil." />
          <Metrica label="Ciclo de venda" valor={funil.cicloMedio ? `${funil.cicloMedio.toFixed(0)} dias` : '—'}
            explica="Do cadastro do prospect à assinatura do contrato. Ciclo longo demais trava a previsão de receita." />
          <Metrica label="Pipeline" valor={brl(funil.pipeline)}
            sub={funil.cobertura ? `${funil.cobertura.toFixed(1)}× o MRR` : 'sem MRR para comparar'}
            explica="Soma das propostas em aberto. A cobertura compara o pipeline ao MRR: abaixo de 3× costuma faltar oportunidade para bater a meta." />
          <Metrica label="Conversão de amostra" valor={`${funil.taxaAmostra.toFixed(0)}%`} accent="text-violet-400"
            sub={`${funil.amostrasConvertidas}/${funil.amostrasCriadas} amostras`}
            explica="Quantas amostras viraram cliente. É o melhor termômetro de quanto o produto vende sozinho quando o prospect vê a marca dele dentro." />
        </div>

        <Panel className="p-4 space-y-2.5">
          {funil.porEtapa.map((e) => (
            <div key={e.label} className="flex items-center gap-3">
              <p className="text-[12px] text-foreground/50 w-24 shrink-0">{e.label}</p>
              <div className="flex-1 h-6 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] overflow-hidden">
                <div className="h-full rounded-lg bg-primary/60 flex items-center px-2 transition-all"
                  style={{ width: `${Math.max(6, (e.total / funil.maxEtapa) * 100)}%` }}>
                  <span className="text-[11px] font-bold text-white tabular-nums">{e.total}</span>
                </div>
              </div>
              <p className="text-[11px] text-foreground/35 tabular-nums w-20 text-right shrink-0">
                {e.valor ? brl(e.valor) : '—'}
              </p>
            </div>
          ))}
        </Panel>

        {funil.motivos.length > 0 && (
          <Panel className="mt-3 divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
            <p className="px-4 py-2 text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30">
              Por que perdemos
            </p>
            {funil.motivos.map(([motivo, n]) => (
              <div key={motivo} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <p className="text-[12.5px] text-foreground/70 truncate">{motivo}</p>
                <p className="text-[12.5px] font-bold text-red-400/80 tabular-nums shrink-0">{n}</p>
              </div>
            ))}
          </Panel>
        )}
      </Bloco>

      {/* ══ Suporte e cobrança ══ */}
      <Bloco titulo="Suporte e cobrança" nota="o que segura a base depois da venda">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metrica label="Tickets abertos" valor={suporte.abertos}
            accent={suporte.criticos > 0 ? 'text-red-400' : 'text-foreground'} alerta={suporte.criticos > 0}
            sub={suporte.criticos ? `${suporte.criticos} de prioridade alta` : 'nada crítico'}
            explica="Chamados ainda não resolvidos. Fila que cresce é o primeiro sinal de churn antes do cancelamento chegar." />
          <Metrica label="Tempo de resolução" valor={suporte.tempoMedio ? `${suporte.tempoMedio.toFixed(1)} dias` : '—'}
            explica="Média entre abertura e resolução dos chamados fechados." />
          <Metrica label="Tickets por cliente" valor={suporte.porCliente.toFixed(1)}
            sub={`${suporte.silenciosos} clientes nunca abriram um`}
            explica="Volume de chamados dividido pela base ativa. Muito alto indica produto confuso; zerado demais pode indicar cliente que parou de usar." />
          <Metrica label="Taxa de recebimento" valor={`${cobranca.taxaRecebimento.toFixed(0)}%`}
            accent={cobranca.vencido > 0 ? 'text-amber-500' : 'text-emerald-500'}
            sub={cobranca.vencido ? `${brl(cobranca.vencido)} vencido · ${cobranca.clientesVencidos} clientes` : 'nada vencido'}
            explica="Quanto do que foi cobrado efetivamente entrou. Inadimplência alta transforma MRR contratado em número de vitrine." />
        </div>
      </Bloco>

      {/* ══ Maiores contas ══ */}
      {receita.maiores.length > 0 && (
        <Bloco titulo="Maiores contas" nota="onde a receita está concentrada">
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
            {receita.maiores.slice(0, 8).map((c) => {
              const share = receita.mrr ? (Number(c.mrr ?? 0) / receita.mrr) * 100 : 0;
              return (
                <div key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                  <p className="text-[12.5px] text-foreground/75 flex-1 truncate">{c.company_name}</p>
                  <p className="text-[11px] text-foreground/35 w-16 text-right tabular-nums">{share.toFixed(0)}%</p>
                  <div className="w-24 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.06] overflow-hidden shrink-0">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${share}%` }} />
                  </div>
                  <p className="text-[12.5px] font-bold tabular-nums w-20 text-right shrink-0">{brl(Number(c.mrr ?? 0))}</p>
                </div>
              );
            })}
          </Panel>
        </Bloco>
      )}

      <p className="text-[11px] text-foreground/30 leading-relaxed">
        CAC, margem bruta, burn multiple e Rule of 40 dependem das despesas lançadas no Financeiro —
        enquanto não houver lançamentos nas categorias de marketing, comissões, nuvem e ferramentas,
        essas quatro ficam zeradas. Churn e vida média precisam de pelo menos um cancelamento para
        deixarem de ser estimativa.
      </p>
    </div>
  );
}
