import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowRight, Check, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brl } from '@/hooks/useAdmin';
import { useImplantacao, type ItemDaImplantacao } from '@/hooks/useImplantacao';
import { InitialAvatar } from '@/components/admin/ui';
import { ORDEM_DA_IMPLANTACAO, type Ritmo } from '@/lib/implantacao';
import { numeroParaWhatsapp } from '@/lib/inadimplencia';

/* Implantação: da venda fechada (contrato assinado e primeiro pagamento,
   que acontecem antes, no fechamento) ao primeiro anúncio no ar. Cada loja
   mostra onde está, com quem a bola está e o botão que resolve — a
   pergunta da tela é "o que eu faço agora?". */

const CURTO: Record<string, string> = {
  sistema_criado: 'Sistema',
  acesso_liberado: 'Acesso',
  dados_importados: 'Estoque',
  canal_conectado: 'Canal',
  go_live: 'Anúncio',
  treinamento_realizado: 'Treino',
  dominio_conectado: 'Domínio',
};

const RITMO: Record<Ritmo, string> = {
  em_dia: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  atencao: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  atrasado: 'text-red-500 bg-red-500/10',
};

const dias = (d: number) => (d === 0 ? 'hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`);
/* Data gravada como dia (implantado_em) ou como meia-noite UTC (activated_at
   vem do paymentDate do Asaas): lida pelo texto, sem fuso — senão o 14/09
   vira 13/09 em Brasília. */
const dataCurta = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/');

function linkDoLembrete(item: ItemDaImplantacao) {
  const zap = numeroParaWhatsapp(item.cliente.whatsapp);
  if (!zap || !item.passo?.lembrete) return null;
  const nome = item.cliente.contact_name?.split(' ')[0];
  const texto = `Olá${nome ? `, ${nome}` : ''}! Aqui é da Via Pesados — ${item.passo.lembrete}`;
  return `https://wa.me/${zap}?text=${encodeURIComponent(texto)}`;
}

/** As etapas como uma linha de pontos: feito, agora, depois. */
function Trilha({ item }: { item: ItemDaImplantacao }) {
  return (
    <ol className="flex items-start">
      {ORDEM_DA_IMPLANTACAO.map((k, i) => {
        const e = item.etapas.find((x) => x.chave === k);
        const feito = !!e?.feito;
        const agora = item.passo?.chave === k;
        const ultimo = i === ORDEM_DA_IMPLANTACAO.length - 1;
        return (
          <li key={k} title={e ? `${e.titulo}: ${e.porque}` : k} className="relative flex-1 flex flex-col items-center gap-2 min-w-0">
            {!ultimo && (
              <span className={cn('absolute top-[9px] left-1/2 w-full h-px', feito ? 'bg-emerald-500/50' : 'bg-black/[0.08] dark:bg-white/[0.1]')} aria-hidden />
            )}
            <span className={cn(
              'relative z-10 h-[19px] w-[19px] rounded-full flex items-center justify-center',
              feito ? 'bg-emerald-500 text-white'
                : agora ? 'bg-background ring-2 ring-primary'
                  : 'bg-background ring-1 ring-black/[0.12] dark:ring-white/[0.15]',
            )}>
              {feito && <Check className="h-3 w-3" strokeWidth={3} />}
              {agora && <span className="h-[7px] w-[7px] rounded-full bg-primary" />}
            </span>
            <span className={cn('text-[10.5px] leading-none truncate max-w-full',
              feito ? 'text-foreground/45' : agora ? 'text-primary font-semibold' : 'text-foreground/30')}>
              {CURTO[k]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Loja({ item }: { item: ItemDaImplantacao }) {
  const navigate = useNavigate();
  const { cliente, passo } = item;
  const rota = passo?.rota(cliente.id) ?? null;
  const lembrete = passo?.dono === 'cliente' ? linkDoLembrete(item) : null;

  return (
    <article className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] overflow-hidden">
      <div className="px-5 pt-5 pb-4 flex items-center gap-3.5">
        <InitialAvatar name={cliente.company_name} src={cliente.logo_url} />
        <button onClick={() => navigate(`/clientes/${cliente.id}`)} className="min-w-0 flex-1 text-left group">
          <p className="text-[15px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">{cliente.company_name}</p>
          <p className="text-[11.5px] font-light text-foreground/45 truncate mt-0.5">
            {[cliente.contact_name, [cliente.city, cliente.state].filter(Boolean).join('/')].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
            {cliente.mrr ? ` · ${brl(cliente.mrr)}/mês` : ''}
          </p>
        </button>
        <span title="Desde que a venda foi registrada. O combinado é uma semana."
          className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums', RITMO[item.ritmo])}>
          {dias(item.dias)}
        </span>
      </div>

      <div className="px-5 pb-5"><Trilha item={item} /></div>

      {passo ? (
        <div className="border-t border-black/[0.06] dark:border-white/[0.06] px-5 py-3.5 flex items-center gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-light text-foreground/45">
              Próximo passo · <span className={passo.dono === 'nos' ? 'text-primary font-medium' : 'text-foreground/70 font-medium'}>
                {passo.dono === 'nos' ? 'com a gente' : 'com o cliente'}
              </span>
            </p>
            <p className="text-[13.5px] font-semibold text-foreground mt-0.5">{passo.acao}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lembrete && (
              <a href={lembrete} target="_blank" rel="noopener noreferrer"
                className="h-9 px-3.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] text-[12.5px] font-medium text-foreground/70 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05] flex items-center transition-colors">
                Lembrar no WhatsApp
              </a>
            )}
            {rota && (
              <button onClick={() => navigate(rota)}
                className={cn('h-9 px-3.5 rounded-xl text-[12.5px] font-semibold flex items-center gap-1.5 transition-opacity',
                  passo.dono === 'nos' ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-primary/10 text-primary hover:bg-primary/15')}>
                {passo.dono === 'nos' ? 'Resolver' : 'Abrir'} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="border-t border-black/[0.06] dark:border-white/[0.06] px-5 py-3.5 flex items-center gap-2 text-[12.5px] font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Tudo ligado — pode marcar como ativo na ficha
        </div>
      )}
    </article>
  );
}

type Filtro = 'todos' | 'nos' | 'cliente';

export default function Implantacao() {
  const d = useImplantacao();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>('todos');

  if (d.carregando) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const n = d.implantando.length;
  const lista = d.implantando.filter((i) => filtro === 'todos' || i.passo?.dono === filtro);

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <header>
        <span className="block h-[3px] w-11 rounded-full bg-primary" />
        <h1 className="mt-5 text-[30px] sm:text-[34px] leading-[1.1] tracking-tight">
          <span className="font-extralight text-foreground/40">Implantação</span>{' '}
          <span className="font-bold text-foreground">
            {n === 0 ? 'em dia' : `${n} ${n === 1 ? 'loja entrando' : 'lojas entrando'} no ar`}
          </span>
        </h1>
        <p className="mt-3 text-[13px] font-light text-foreground/45">Do contrato assinado ao primeiro anúncio no ar — o que falta, e com quem.</p>
      </header>

      {d.ponteFalhou && (
        <p className="text-[12px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 -mt-4">
          <AlertCircle className="h-3.5 w-3.5" /> Não consegui ler os sistemas das lojas agora — acesso, estoque, canal e anúncio aparecem como "não sei".
        </p>
      )}

      {n > 0 && (
        <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] grid grid-cols-3 divide-x divide-black/[0.06] dark:divide-white/[0.06]">
          {([
            ['nos', 'Com a gente', d.comAGente, d.comAGente ? 'text-primary' : 'text-foreground'],
            ['cliente', 'Com o cliente', d.comOCliente, 'text-foreground'],
            [null, 'Passou de 2 semanas', d.atrasados, d.atrasados ? 'text-red-500' : 'text-foreground'],
          ] as const).map(([chave, rotulo, valor, cor]) => {
            const ativo = chave !== null && filtro === chave;
            const Tag = chave ? 'button' : 'div';
            return (
              <Tag
                key={rotulo}
                {...(chave ? { onClick: () => setFiltro(ativo ? 'todos' : chave), type: 'button' as const } : {})}
                className={cn('px-4 py-4 text-center relative', chave && 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors')}
              >
                <p className={cn('text-[22px] font-bold tabular-nums leading-none', cor)}>{valor}</p>
                <p className="text-[11px] font-light text-foreground/45 mt-1.5">{rotulo}</p>
                {ativo && <span className="absolute inset-x-6 bottom-0 h-[3px] rounded-full bg-primary" />}
              </Tag>
            );
          })}
        </div>
      )}

      {n === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/[0.1] dark:border-white/[0.1] px-6 py-14 flex flex-col items-center text-center">
          <span className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Rocket className="h-5 w-5" />
          </span>
          <p className="mt-5 text-[16px] font-semibold text-foreground">Nenhuma loja em implantação agora</p>
          <p className="mt-1.5 text-[12.5px] font-light text-foreground/45 max-w-sm leading-relaxed">
            Quando uma venda for fechada — contrato assinado e primeiro pagamento — a loja aparece aqui com o próximo passo.
          </p>
        </div>
      ) : lista.length === 0 ? (
        <p className="text-[12.5px] font-light text-foreground/45">Nenhuma loja neste filtro.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {lista.map((i) => <Loja key={i.cliente.id} item={i} />)}
        </div>
      )}

      {d.noArRecentes.length > 0 && (
        <section>
          <p className="text-[13px] font-semibold text-foreground/75">Entraram no ar nos últimos 30 dias</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {d.noArRecentes.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                className="h-10 pl-2 pr-3.5 rounded-full border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] hover:border-primary/40 flex items-center gap-2 transition-colors"
              >
                <InitialAvatar name={c.company_name} src={c.logo_url} size="sm" />
                <span className="text-[12.5px] font-medium text-foreground">{c.company_name}</span>
                <span className="text-[11px] font-light text-foreground/40">desde {dataCurta(c.implantado_em ?? c.activated_at!)}</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
