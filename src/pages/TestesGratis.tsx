import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hourglass, Check, CalendarPlus, MessageSquareText, AlertCircle, Phone, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useClients, useCompaniesHealth, useTeam, type Client, type SaudeDaEmpresa } from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import {
  useTestesGratis, useTarefas, useAtualizarTarefa, useAtualizarTeste, useProrrogarTeste,
  type TesteGratis, type Tarefa,
} from '@/hooks/useTesteGratis';
import { InitialAvatar } from '@/components/admin/ui';
import { COR_DO_TOM } from '@/components/admin/TesteDoCliente';
import { situacaoDoTeste, taxaDeConversao, diasAteAssinar, dataCurta } from '@/lib/testeGratis';
import { numeroParaWhatsapp } from '@/lib/inadimplencia';
import { tarefasDoTeste } from '../../supabase/functions/_shared/teste';
import { hojeBRT } from '../../supabase/functions/_shared/regua';

/* Teste grátis: 30 dias contados da implantação. A tela responde duas
   perguntas — como cada loja está usando o teste, e o que o vendedor faz
   hoje. Quem decide a conversão é a conversa; a tela põe o vendedor na
   hora certa com o número certo na mão. */

type Filtro = 'todos' | 'reta' | 'implantando' | 'encerrados' | 'assinaram';

const quandoBRT = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
};

function Sinais({ s, carregando }: { s: SaudeDaEmpresa | undefined; carregando: boolean }) {
  if (carregando) return <p className="text-[11.5px] text-foreground/35">Lendo o sistema da loja…</p>;
  if (!s) return <p className="text-[11.5px] text-foreground/35">Sistema ainda não lido</p>;
  const itens: [string, string, boolean][] = [
    ['Anunciando', `${s.veiculos_anunciados} de ${s.veiculos}`, s.veiculos_anunciados > 0],
    ['Canais', s.canais_caidos ? `${s.canais_ligados} · ${s.canais_caidos} caído${s.canais_caidos > 1 ? 's' : ''}` : String(s.canais_ligados), s.canais_ligados > 0 && !s.canais_caidos],
    ['Vendas', String(s.vendas_30d), s.vendas_30d > 0],
    ['Último acesso', s.ultimo_acesso_em ? dataCurta(s.ultimo_acesso_em) : 'nunca', !!s.ultimo_acesso_em],
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {itens.map(([rotulo, valor, ok]) => (
        <div key={rotulo} className="min-w-0">
          <p className="text-[10.5px] text-foreground/40 truncate">{rotulo}</p>
          <p className={cn('text-[13px] font-semibold tabular-nums truncate', ok ? 'text-foreground' : 'text-foreground/40')}>{valor}</p>
        </div>
      ))}
    </div>
  );
}

function Loja({
  teste, cliente, saude, lendo, vendedor, proxima,
}: {
  teste: TesteGratis;
  cliente: Client | undefined;
  saude: SaudeDaEmpresa | undefined;
  lendo: boolean;
  vendedor: string | null;
  proxima: Tarefa | undefined;
}) {
  const navigate = useNavigate();
  const prorrogar = useProrrogarTeste();
  const atualizar = useAtualizarTeste();
  const [motivo, setMotivo] = useState(teste.motivo ?? '');
  const [editandoMotivo, setEditandoMotivo] = useState(false);
  const s = situacaoDoTeste(teste);
  const cor = COR_DO_TOM[s.tom];
  const nome = cliente?.company_name ?? 'Loja';
  const zap = numeroParaWhatsapp(cliente?.whatsapp);
  const marcos = teste.inicio && teste.fim ? tarefasDoTeste(teste.inicio, teste.fim) : [];
  const total = marcos.length && teste.inicio && teste.fim
    ? (Date.parse(teste.fim) - Date.parse(teste.inicio)) / 86_400_000
    : 0;

  const darMaisDias = async () => {
    try {
      await prorrogar.mutateAsync({ teste, dias: 7 });
      toast.success(`${nome}: mais 7 dias de teste`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const salvarMotivo = async () => {
    try {
      await atualizar.mutateAsync({ id: teste.id, motivo: motivo.trim() || null });
      setEditandoMotivo(false);
      toast.success('Motivo registrado');
    } catch {
      toast.error('Não consegui salvar');
    }
  };

  return (
    <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] p-4 flex flex-col gap-3.5">
      <div className="flex items-start gap-3">
        <InitialAvatar name={nome} src={cliente?.logo_url} />
        <button onClick={() => cliente && navigate(`/clientes/${cliente.id}`)} className="min-w-0 flex-1 text-left">
          <p className="text-[14px] font-semibold text-foreground truncate hover:text-primary transition-colors">{nome}</p>
          <p className="text-[11.5px] text-foreground/45 truncate">{vendedor ? `Com ${vendedor}` : 'Sem vendedor'} · {s.linha}</p>
        </button>
        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0', cor.fundo, cor.texto)}>{s.rotulo}</span>
      </div>

      {/* A régua dos 30 dias, com os pontos em que o vendedor entra. */}
      <div className="relative h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
        <div className={cn('absolute inset-y-0 left-0 rounded-full', cor.barra)} style={{ width: `${Math.round(s.progresso * 100)}%` }} />
        {total > 0 && marcos.map((m) => {
          const pos = Math.min(100, Math.max(0, ((Date.parse(m.dia) - Date.parse(teste.inicio!)) / 86_400_000 / total) * 100));
          return <span key={m.marco} title={`${dataCurta(m.dia)} · ${m.titulo.replace('Teste grátis · ', '')}`} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-background border-2 border-foreground/30" style={{ left: `${pos}%` }} />;
        })}
      </div>

      {cliente?.lojista_company_id && teste.status !== 'aguardando_implantacao' && (
        <Sinais s={saude} carregando={lendo} />
      )}

      {proxima && (
        <div className="flex items-center gap-2 text-[12px] text-foreground/65">
          <CalendarPlus className="h-3.5 w-3.5 text-foreground/35 shrink-0" />
          <span className="truncate">
            {quandoBRT(proxima.quando) <= hojeBRT() ? 'Hoje' : dataCurta(proxima.quando.slice(0, 10))}: {proxima.titulo.replace('Teste grátis · ', '')}
          </span>
        </div>
      )}

      {(teste.status === 'encerrado' || teste.motivo) && (
        editandoMotivo ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por que não assinou? O que ouviu na ligação?"
              className="w-full h-20 px-3 py-2 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[12.5px] text-foreground resize-none focus:outline-none focus:border-primary/50"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditandoMotivo(false)} className="h-8 px-3 rounded-lg text-[12px] text-foreground/55 hover:text-foreground">Voltar</button>
              <button onClick={salvarMotivo} disabled={atualizar.isPending} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold disabled:opacity-50">Salvar</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditandoMotivo(true)} className="text-left text-[12px] text-foreground/60 hover:text-foreground flex items-start gap-1.5">
            <MessageSquareText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground/35" />
            {teste.motivo ? <span>Motivo: {teste.motivo}</span> : <span className="text-primary font-medium">Registrar o motivo de não assinar</span>}
          </button>
        )
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {zap && (
          <a href={`https://wa.me/${zap}`} target="_blank" rel="noopener noreferrer" className="h-8 px-3 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[12px] font-semibold flex items-center gap-1.5 hover:bg-emerald-500/20">
            <Phone className="h-3.5 w-3.5" /> WhatsApp
          </a>
        )}
        {teste.status === 'em_teste' && (
          <button onClick={darMaisDias} disabled={prorrogar.isPending} className="h-8 px-3 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-[12px] font-medium text-foreground/70 hover:text-foreground disabled:opacity-50">
            +7 dias
          </button>
        )}
        {teste.status === 'aguardando_implantacao' && (
          <button onClick={() => navigate('/implantacao?aba=teste')} className="h-8 px-3 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-[12px] font-medium text-foreground/70 hover:text-foreground flex items-center gap-1.5">
            Ver implantação <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function ParaFazerHoje({ tarefas, nomes }: { tarefas: Tarefa[]; nomes: Map<string, string> }) {
  const atualizar = useAtualizarTarefa();
  const { member } = useAuth();
  if (!tarefas.length) return null;
  const feito = async (t: Tarefa) => {
    try {
      await atualizar.mutateAsync({ id: t.id, feito_em: new Date().toISOString(), feito_por: member?.id ?? null });
      toast.success('Feito');
    } catch {
      toast.error('Não consegui marcar');
    }
  };
  return (
    <section className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold tracking-widest uppercase text-foreground/30">Para fazer hoje</p>
      <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {tarefas.map((t) => (
          <div key={t.id} className="px-4 py-3 flex items-start gap-3">
            <button onClick={() => feito(t)} aria-label="Marcar como feito" className="h-5 w-5 mt-0.5 rounded-md border-2 border-foreground/25 hover:border-primary hover:bg-primary/10 flex items-center justify-center shrink-0">
              <Check className="h-3 w-3 text-transparent hover:text-primary" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground truncate">
                {t.client?.company_name ?? '—'} <span className="font-normal text-foreground/50">· {t.titulo.replace('Teste grátis · ', '')}</span>
              </p>
              {t.detalhe && <p className="text-[12px] text-foreground/55 leading-snug mt-0.5">{t.detalhe}</p>}
            </div>
            <span className="text-[11px] text-foreground/40 shrink-0">
              {quandoBRT(t.quando) < hojeBRT() ? `desde ${dataCurta(t.quando.slice(0, 10))}` : 'hoje'}
              {t.owner_id && nomes.get(t.owner_id) ? ` · ${nomes.get(t.owner_id)}` : ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function TestesGratis() {
  const { data: testes = [], isLoading } = useTestesGratis();
  const { data: clientes = [] } = useClients();
  const { data: equipe = [] } = useTeam();
  const { data: tarefas = [] } = useTarefas();
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const porCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const nomes = useMemo(() => new Map(equipe.map((m) => [m.id, (m.full_name || m.email || '').split(' ')[0]])), [equipe]);

  /* Só as lojas que estão testando agora são lidas — cada leitura do
     sistema de uma loja é uma linha no registro da LGPD. */
  const ids = useMemo(
    () => testes.filter((t) => t.status === 'em_teste').map((t) => porCliente.get(t.client_id)?.lojista_company_id).filter((x): x is string => !!x),
    [testes, porCliente],
  );
  const saude = useCompaniesHealth(ids);
  const saudePorEmpresa = useMemo(() => new Map((saude.data ?? []).map((s) => [s.company_id, s])), [saude.data]);

  const hoje = hojeBRT();
  const pendentes = tarefas.filter((t) => t.origem === 'teste_gratis' && !t.feito_em);
  const deHoje = pendentes.filter((t) => quandoBRT(t.quando) <= hoje);
  const proximaDe = (clientId: string) => pendentes.find((t) => t.client_id === clientId);

  const situacoes = testes.map((t) => ({ t, s: situacaoDoTeste(t, hoje) }));
  const emTeste = situacoes.filter(({ t }) => t.status === 'em_teste');
  const reta = emTeste.filter(({ s }) => s.reta_final);
  const implantando = situacoes.filter(({ t }) => t.status === 'aguardando_implantacao');
  const encerrados = situacoes.filter(({ t }) => t.status === 'encerrado');
  const assinaram = situacoes.filter(({ t }) => t.status === 'convertido');
  const conv = taxaDeConversao(testes);
  const ateAssinar = diasAteAssinar(testes);

  const lista = (
    filtro === 'reta' ? reta
      : filtro === 'implantando' ? implantando
      : filtro === 'encerrados' ? encerrados
      : filtro === 'assinaram' ? assinaram
      : [...reta, ...emTeste.filter(({ s }) => !s.reta_final), ...implantando, ...encerrados]
  ).sort((a, b) => {
    if (filtro !== 'todos') return (a.t.fim ?? '9').localeCompare(b.t.fim ?? '9');
    return 0;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const n = emTeste.length;

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <header>
        <span className="block h-[3px] w-11 rounded-full bg-primary" />
        <h1 className="mt-5 text-[30px] sm:text-[34px] leading-[1.1] tracking-tight">
          <span className="font-extralight text-foreground/40">Teste grátis</span>{' '}
          <span className="font-bold text-foreground">
            {n === 0 ? 'sem loja testando' : `${n} ${n === 1 ? 'loja testando' : 'lojas testando'}`}
          </span>
        </h1>
        <p className="mt-3 text-[13px] font-light text-foreground/45">
          30 dias contados da implantação. No dia seguinte ao fim, sem assinatura, painel e site saem do ar — nada é apagado.
        </p>
      </header>

      {saude.isError && (
        <p className="text-[12px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 -mt-4">
          <AlertCircle className="h-3.5 w-3.5" /> Não consegui ler os sistemas das lojas agora — os sinais de uso ficam em branco.
        </p>
      )}

      <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-black/[0.06] dark:divide-white/[0.06]">
        {([
          ['reta', 'Terminam em até 5 dias', String(reta.length), reta.length ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'],
          ['implantando', 'Implantando', String(implantando.length), 'text-foreground'],
          ['assinaram', conv.taxa === null ? 'Assinaram' : `Assinaram · ${Math.round(conv.taxa * 100)}%`, String(assinaram.length), assinaram.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'],
          ['encerrados', 'Não assinaram', String(encerrados.length), encerrados.length ? 'text-red-500' : 'text-foreground'],
        ] as const).map(([chave, rotulo, valor, cor]) => {
          const ativo = filtro === chave;
          return (
            <button
              key={chave}
              type="button"
              onClick={() => setFiltro(ativo ? 'todos' : chave)}
              className="px-4 py-4 text-center relative hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
            >
              <p className={cn('text-[22px] font-bold tabular-nums leading-none', cor)}>{valor}</p>
              <p className="text-[11px] font-light text-foreground/45 mt-1.5">{rotulo}</p>
              {ativo && <span className="absolute inset-x-6 bottom-0 h-[3px] rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
      {ateAssinar !== null && (
        <p className="text-[12px] text-foreground/45 -mt-5">Quem assina leva, em média, {ateAssinar} {ateAssinar === 1 ? 'dia' : 'dias'} de teste para decidir.</p>
      )}

      <ParaFazerHoje tarefas={deHoje} nomes={nomes} />

      {testes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/[0.1] dark:border-white/[0.1] px-6 py-14 flex flex-col items-center text-center">
          <span className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Hourglass className="h-5 w-5" />
          </span>
          <p className="mt-5 text-[16px] font-semibold text-foreground">Nenhum teste grátis ainda</p>
          <p className="mt-1.5 text-[12.5px] font-light text-foreground/45 max-w-sm leading-relaxed">
            Arraste uma loja para "Teste grátis" no funil. Ela passa pela implantação de teste e os 30 dias começam no aviso de acesso.
          </p>
        </div>
      ) : lista.length === 0 ? (
        <p className="text-[12.5px] font-light text-foreground/45">Nenhuma loja neste filtro.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {lista.map(({ t }) => {
            const c = porCliente.get(t.client_id);
            return (
              <Loja
                key={t.id}
                teste={t}
                cliente={c}
                saude={c?.lojista_company_id ? saudePorEmpresa.get(c.lojista_company_id) : undefined}
                lendo={saude.isFetching && !saude.isSuccess}
                vendedor={t.owner_id ? nomes.get(t.owner_id) ?? null : null}
                proxima={proximaDe(t.client_id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
