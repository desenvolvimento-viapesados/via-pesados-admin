import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowRight, Check, FileText, Plus, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brl } from '@/hooks/useAdmin';
import { useImplantacao, type ItemDaImplantacao } from '@/hooks/useImplantacao';
import { Kpi, Panel, SectionHeader, EmptyState, InitialAvatar } from '@/components/admin/ui';
import { ORDEM_DA_IMPLANTACAO, type Ritmo } from '@/lib/implantacao';
import { numeroParaWhatsapp } from '@/lib/inadimplencia';

/* Implantação: do contrato ao primeiro anúncio no ar. Cada cliente mostra
   onde está, com quem a bola está e o botão que resolve — a pergunta da
   tela é "o que eu faço agora?", não "como está o checklist?". */

const CURTO: Record<string, string> = {
  contrato_assinado: 'Contrato',
  pagamento_recebido: 'Pago',
  sistema_criado: 'Sistema',
  acesso_liberado: 'Acesso',
  dados_importados: 'Estoque',
  canal_conectado: 'Canal',
  go_live: 'Anúncio',
  treinamento_realizado: 'Treino',
  dominio_conectado: 'Domínio',
};

const RITMO: Record<Ritmo, { texto: (d: number) => string; cls: string }> = {
  em_dia:   { texto: (d) => (d === 0 ? 'vendido hoje' : `${d} ${d === 1 ? 'dia' : 'dias'}`), cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  atencao:  { texto: (d) => `${d} dias`, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  atrasado: { texto: (d) => `${d} dias`, cls: 'bg-red-500/10 text-red-500' },
};

function linkDoLembrete(item: ItemDaImplantacao) {
  const zap = numeroParaWhatsapp(item.cliente.whatsapp);
  if (!zap || !item.passo?.lembrete) return null;
  const nome = item.cliente.contact_name?.split(' ')[0];
  const texto = `Olá${nome ? `, ${nome}` : ''}! Aqui é da Via Pesados — ${item.passo.lembrete}`;
  return `https://wa.me/${zap}?text=${encodeURIComponent(texto)}`;
}

function Trilha({ item }: { item: ItemDaImplantacao }) {
  return (
    <div className="grid grid-cols-9 gap-1">
      {ORDEM_DA_IMPLANTACAO.map((k) => {
        const e = item.etapas.find((x) => x.chave === k);
        const feito = e?.feito;
        const atual = item.passo?.chave === k;
        return (
          <div key={k} title={e ? `${e.titulo}: ${e.porque}` : k} className="flex flex-col gap-1 min-w-0">
            <div className={cn(
              'h-1.5 rounded-full',
              feito ? 'bg-emerald-500' : atual ? 'bg-primary' : 'bg-black/[0.08] dark:bg-white/[0.1]',
            )} />
            <span className={cn(
              'text-[10px] leading-none truncate',
              feito ? 'text-foreground/45' : atual ? 'text-primary font-semibold' : 'text-foreground/30',
            )}>
              {CURTO[k]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CartaoDoCliente({ item }: { item: ItemDaImplantacao }) {
  const navigate = useNavigate();
  const { cliente, passo } = item;
  const rota = passo?.rota(cliente.id) ?? null;
  const lembrete = passo?.dono === 'cliente' ? linkDoLembrete(item) : null;
  const ritmo = RITMO[item.ritmo];

  return (
    <Panel className="p-4 flex flex-col gap-3.5">
      <div className="flex items-start gap-3">
        <InitialAvatar name={cliente.company_name} src={cliente.logo_url} />
        <button onClick={() => navigate(`/clientes/${cliente.id}`)} className="min-w-0 flex-1 text-left group">
          <p className="text-[14px] font-semibold text-foreground truncate group-hover:text-primary">{cliente.company_name}</p>
          <p className="text-[11.5px] text-foreground/40 truncate">
            {[cliente.contact_name, [cliente.city, cliente.state].filter(Boolean).join('/')].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
          </p>
        </button>
        <div className="text-right shrink-0">
          <p className="text-[14px] font-bold tabular-nums text-foreground">{brl(cliente.mrr)}<span className="text-[10px] font-normal text-foreground/35">/mês</span></p>
          <span
            title="Desde que a venda foi registrada. O combinado é uma semana."
            className={cn('inline-flex items-center gap-1 mt-0.5 px-1.5 py-px rounded-full text-[10.5px] font-semibold', ritmo.cls)}
          >
            <Clock className="h-2.5 w-2.5" /> {ritmo.texto(item.dias)}
          </span>
        </div>
      </div>

      <Trilha item={item} />

      {passo ? (
        <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-foreground/35">
              Próximo passo · {passo.dono === 'nos' ? 'com a gente' : 'com o cliente'}
            </p>
            <p className="text-[13px] font-semibold text-foreground mt-0.5">{passo.acao}</p>
            <p className="text-[11px] text-foreground/40 first-letter:uppercase">{passo.porque}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lembrete && (
              <a
                href={lembrete}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-[12px] font-medium text-foreground/70 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05] flex items-center"
              >
                Lembrar no WhatsApp
              </a>
            )}
            {rota && (
              <button
                onClick={() => navigate(rota)}
                className={cn(
                  'h-8 px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-colors',
                  passo.dono === 'nos' ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-primary/10 text-primary hover:bg-primary/15',
                )}
              >
                {passo.dono === 'nos' ? 'Resolver' : 'Ver'} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-emerald-500/10 px-3 py-2.5 flex items-center gap-2 text-[12.5px] font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4" strokeWidth={3} /> Tudo ligado — pode marcar como ativo na ficha
        </div>
      )}
    </Panel>
  );
}

type Filtro = 'todos' | 'nos' | 'cliente';

export default function Implantacao() {
  const navigate = useNavigate();
  const d = useImplantacao();
  const [filtro, setFiltro] = useState<Filtro>('todos');

  if (d.carregando) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const lista = d.implantando.filter((i) => filtro === 'todos' || i.passo?.dono === filtro);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Implantação</h1>
          <p className="text-[12px] text-foreground/40 mt-0.5">Do contrato ao primeiro anúncio no ar — o que falta, e com quem</p>
        </div>
        <button
          onClick={() => navigate('/crm/venda')}
          className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Registrar venda
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Implantando" value={d.implantando.length} />
        <Kpi label="Com a gente" value={d.comAGente} sub="próximo passo é nosso" accent={d.comAGente ? 'text-primary' : undefined} />
        <Kpi label="Com o cliente" value={d.comOCliente} sub="cabe lembrar" />
        <Kpi label="Passou de 2 semanas" value={d.atrasados} accent={d.atrasados ? 'text-red-500' : undefined} />
      </div>

      {d.ponteFalhou && (
        <p className="text-[12px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" /> Não consegui ler os sistemas dos clientes agora — acesso, estoque, canal e anúncio aparecem como "não sei".
        </p>
      )}

      {d.vendasParaRegistrar.length > 0 && (
        <div>
          <SectionHeader title={`Vendas para registrar · ${d.vendasParaRegistrar.length}`} />
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
            {d.vendasParaRegistrar.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <InitialAvatar name={p.company_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate">{p.company_name}</p>
                  <p className="text-[11px] text-foreground/40 truncate">
                    {p.proposal_value ? `${brl(p.proposal_value)}/mês · ` : ''}fechou no funil — falta registrar a venda para começar
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/crm/venda/${p.id}`)}
                  className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 flex items-center gap-1.5 shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" /> Registrar
                </button>
              </div>
            ))}
          </Panel>
        </div>
      )}

      <div>
        <SectionHeader
          title="Em implantação"
          right={d.implantando.length > 0 ? (
            <div className="flex rounded-lg border border-black/[0.08] dark:border-white/[0.1] p-0.5">
              {([['todos', 'Todos'], ['nos', 'Com a gente'], ['cliente', 'Com o cliente']] as const).map(([v, r]) => (
                <button
                  key={v}
                  onClick={() => setFiltro(v)}
                  className={cn('h-7 px-2.5 rounded-md text-[11.5px] font-medium',
                    filtro === v ? 'bg-primary/15 text-primary font-semibold' : 'text-foreground/45 hover:text-foreground')}
                >
                  {r}
                </button>
              ))}
            </div>
          ) : undefined}
        />
        {d.lendoSistemas && d.implantando.length === 0 ? (
          <p className="text-[12px] text-foreground/40">Lendo os sistemas dos clientes…</p>
        ) : d.implantando.length === 0 ? (
          <EmptyState icon={<Rocket />} title="Ninguém em implantação" sub="Quando uma venda for registrada, o cliente aparece aqui com o próximo passo" />
        ) : lista.length === 0 ? (
          <p className="text-[12px] text-foreground/40">Nenhum cliente neste filtro.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {lista.map((i) => <CartaoDoCliente key={i.cliente.id} item={i} />)}
          </div>
        )}
      </div>

      {d.noArComPendencia.length > 0 && (
        <div>
          <SectionHeader title="No ar, com pendência" />
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
            {d.noArComPendencia.map((i) => {
              const rota = i.passo?.rota(i.cliente.id);
              return (
                <div key={i.cliente.id} className="flex items-center gap-3 px-4 py-3">
                  <InitialAvatar name={i.cliente.company_name} src={i.cliente.logo_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground truncate">{i.cliente.company_name}</p>
                    <p className="text-[11px] text-foreground/40 truncate">Anunciando · falta: {i.passo?.titulo.toLowerCase()} ({i.passo?.porque})</p>
                  </div>
                  {rota && (
                    <button
                      onClick={() => navigate(rota)}
                      className="h-8 px-3 rounded-lg bg-primary/10 text-primary text-[12px] font-semibold hover:bg-primary/15 flex items-center gap-1.5 shrink-0"
                    >
                      {i.passo?.acao} <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </Panel>
        </div>
      )}

      {d.noArRecentes.length > 0 && (
        <div>
          <SectionHeader title="Entraram no ar nos últimos 30 dias" />
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
            {d.noArRecentes.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] text-left"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{c.company_name}</span>
                <span className="text-[11px] text-foreground/40 shrink-0">desde {new Date(c.activated_at!).toLocaleDateString('pt-BR')}</span>
              </button>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}
