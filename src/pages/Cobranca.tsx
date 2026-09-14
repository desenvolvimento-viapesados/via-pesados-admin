import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Loader2, MessageCircle, QrCode, Repeat,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LOJISTA_APP_URL } from '@/integrations/supabase/client';
import {
  useClient, usePayments, useEscutarPagamentos, useCriarAssinaturaAsaas,
  brlFull, type Payment,
} from '@/hooks/useAdmin';

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const METODO: Record<string, string> = {
  pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão', transferencia: 'Transferência', outro: 'Outro',
};

/* ── Linha de pagamento ───────────────────────────────────────── */
function LinhaPagamento({ p }: { p: Payment }) {
  const pago = p.status === 'pago';
  return (
    <div className="flex items-center gap-3 py-3 border-b border-black/[0.05] dark:border-white/[0.05] last:border-0">
      <span className={cn(
        'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
        pago ? 'bg-emerald-500/15 text-emerald-400'
             : p.status === 'atrasado' ? 'bg-red-500/15 text-red-400'
             : 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground/35',
      )}>
        {pago ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Repeat className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-foreground truncate">{p.description}</p>
        <p className="text-[11px] text-foreground/40">
          {pago ? `pago em ${data(p.paid_at)}` : `vence ${p.due_date ?? '—'}`}
          {p.method ? ` · ${METODO[p.method] ?? p.method}` : ''}
        </p>
      </div>
      <p className="text-[12.5px] font-medium text-foreground tabular-nums shrink-0">{brlFull(p.amount)}</p>
    </div>
  );
}

/**
 * A cobrança do cliente, ao vivo.
 *
 * É a primeira tela depois de fechar a venda porque é o que se faz em
 * seguida: mandar o link e esperar. Antes disso, o link ficava numa faixa
 * no meio da ficha do cliente, embaixo de um checklist de nove etapas —
 * e saber se já tinha entrado exigia recarregar a página.
 */
export default function Cobranca() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading } = useClient(id);
  const { data: pagamentos = [] } = usePayments(id);
  const gerar = useCriarAssinaturaAsaas();
  const [gerando, setGerando] = useState(false);

  // É isto que faz "instantâneo" ser verdade.
  useEscutarPagamentos(id);

  const pago = useMemo(() => pagamentos.find((p) => p.status === 'pago') ?? null, [pagamentos]);

  /* O link que o lojista recebe é o do checkout da Via Pesados — a página
     com as duas logos, o nome dele e a escolha entre Pix e cartão. O link
     cru do Asaas continua existindo e é o que cobra todo mês, mas mandar
     asaas.com/c/xxxx para quem acabou de comprar joga fora a única página
     da venda que tem a cara do produto. */
  const link = client?.checkout_token
    ? `${LOJISTA_APP_URL}/bemvindo/${client.checkout_token}`
    : null;
  /* Sem token não há checkout; aí sobra o link do Asaas, que ao menos cobra. */
  const linkAlternativo = !link ? (client?.asaas_payment_link_url ?? null) : null;
  const linkFinal = link ?? linkAlternativo;

  if (isLoading || !client) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </div>
    );
  }

  const criarCobranca = async () => {
    setGerando(true);
    try {
      const r = await gerar.mutateAsync({ client_id: client.id, valor: client.mrr ?? 0 });
      await navigator.clipboard.writeText(r.url).catch(() => {});
      toast.success('Cobrança criada — link copiado');
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível criar a cobrança');
    } finally {
      setGerando(false);
    }
  };

  const zap = client.whatsapp && linkFinal
    ? `https://wa.me/55${client.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Olá! Segue o link para ativar o sistema da ${client.company_name}: ${linkFinal}`,
      )}`
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8 sm:py-12">

        <button
          onClick={() => navigate(`/clientes/${client.id}`)}
          className="flex items-center gap-1.5 text-[12.5px] text-foreground/45 hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {client.company_name}
        </button>

        <header className="mb-9">
          <p className="text-[11px] font-light tracking-[0.22em] uppercase text-primary mb-3">Cobrança</p>
          <h1 className="text-[30px] sm:text-[38px] leading-[1.08] tracking-tight">
            <span className="block font-extralight text-foreground/50">Mensalidade de</span>
            <span className="block font-bold text-foreground">{client.company_name}</span>
          </h1>
          <div className="h-[3px] w-16 bg-primary rounded-full mt-5" />
        </header>

        {/* Estado, grande. É a pergunta que se faz ao abrir esta tela. */}
        <div className={cn(
          'rounded-2xl border p-6 sm:p-7 mb-4 transition-colors',
          pago ? 'border-emerald-400/35 bg-emerald-400/[0.05]'
               : 'border-black/[0.08] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02]',
        )}>
          <div className="flex items-center gap-3.5">
            <span className={cn(
              'h-11 w-11 rounded-full flex items-center justify-center shrink-0',
              pago ? 'bg-emerald-500 text-white' : 'bg-black/[0.05] dark:bg-white/[0.07]',
            )}>
              {pago
                ? <Check className="h-5 w-5" strokeWidth={3} />
                : <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 animate-ping" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                  </span>}
            </span>
            <div className="min-w-0">
              <p className={cn('text-[17px] font-semibold leading-tight', pago ? 'text-emerald-400' : 'text-foreground')}>
                {pago ? 'Pago' : linkFinal ? 'Aguardando pagamento' : 'Sem cobrança criada'}
              </p>
              <p className="text-[12px] text-foreground/45 mt-1">
                {pago
                  ? `${brlFull(pago.amount)} · ${data(pago.paid_at)}${pago.method ? ` · ${METODO[pago.method] ?? pago.method}` : ''}`
                  : linkFinal
                    ? `${brlFull(client.mrr ?? 0)} por mês — esta tela avisa sozinha quando entrar.`
                    : 'A venda foi registrada sem gerar a cobrança.'}
              </p>
            </div>
          </div>
        </div>

        {/* O link */}
        {linkFinal ? (
          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] p-5 sm:p-6 space-y-4">
            <p className="text-[10.5px] font-semibold tracking-[0.18em] uppercase text-foreground/30">
              {link ? 'Página de ativação' : 'Link de pagamento'}
            </p>
            <div className="flex items-center gap-2.5 px-3.5 h-12 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1]">
              <QrCode className="h-4 w-4 text-foreground/30 shrink-0" />
              <span className="text-[12.5px] font-mono text-foreground/80 truncate flex-1" title={linkFinal}>
                {linkFinal.replace(/^https?:\/\//, '')}
              </span>
            </div>

            <div className={cn('grid gap-2', zap ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
              <button
                onClick={() => { navigator.clipboard.writeText(linkFinal); toast.success('Link copiado'); }}
                className="h-11 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-[12.5px] font-medium text-foreground/75 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar
              </button>
              <a
                href={linkFinal} target="_blank" rel="noopener noreferrer"
                className="h-11 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-[12.5px] font-medium text-foreground/75 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </a>
              {zap && (
                /* Abre a conversa com o texto pronto; quem aperta enviar é
                   quem está na frente da tela. */
                <a
                  href={zap} target="_blank" rel="noopener noreferrer"
                  className="h-11 rounded-xl bg-emerald-500 text-white text-[12.5px] font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Mandar no WhatsApp
                </a>
              )}
            </div>

            <p className="text-[11px] text-foreground/35 leading-snug">
              {link
                ? 'Abre com a marca dele ao lado da nossa, o valor combinado e a escolha entre Pix e cartão. Depois da primeira vez, o Asaas cobra sozinho todo mês.'
                : 'Este cliente ainda não tem página de ativação — o link abaixo é o do Asaas, sem a marca dele.'}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] p-6 text-center space-y-3">
            <p className="text-[12.5px] text-foreground/50">
              {client.mrr ? `Mensalidade de ${brlFull(client.mrr)} definida na venda.` : 'Este cliente não tem mensalidade definida.'}
            </p>
            <button
              onClick={criarCobranca}
              disabled={gerando || !client.mrr}
              className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all disabled:opacity-50 inline-flex items-center gap-2"
            >
              {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
              Criar cobrança mensal
            </button>
          </div>
        )}

        {/* Histórico — só quando há algo que não seja o primeiro pagamento */}
        {pagamentos.length > 0 && (
          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] p-5 sm:p-6 mt-4">
            <p className="text-[10.5px] font-semibold tracking-[0.18em] uppercase text-foreground/30 mb-1">
              Pagamentos
            </p>
            {pagamentos.map((p) => <LinhaPagamento key={p.id} p={p} />)}
          </div>
        )}

        {/* Pago é o fim desta tela e o começo da próxima: o que o cliente
            espera agora é o acesso. */}
        {pago ? (
          <button
            onClick={() => navigate(`/clientes/${client.id}/onboarding`)}
            className="w-full h-12 mt-4 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            Continuar — liberar o acesso <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
        <button
          onClick={() => navigate(`/clientes/${client.id}`)}
          className="w-full h-11 mt-2 rounded-xl text-[12.5px] font-medium text-foreground/45 hover:text-foreground transition-colors"
        >
          Ir para a ficha do cliente
        </button>
      </div>
    </div>
  );
}
