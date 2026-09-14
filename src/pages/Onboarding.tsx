import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, Globe, Loader2, MessageCircle, PartyPopper,
  Upload, Boxes, GraduationCap,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useClient, useOnboardingTasks, useToggleTask, useUpdateClient,
  type Client, type OnboardingTask,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, FUNCTIONS_URL, LOJISTA_APP_URL } from '@/integrations/supabase/client';
import { CorpoDominio, CorpoIdentidade } from '@/components/admin/EtapasCliente';

/** Uma etapa do onboarding. `chave` casa com onboarding_tasks.task_key. */
type Etapa = {
  chave: string;
  titulo: string;
  resumo: string;
  icone: typeof Globe;
  /** Conteúdo próprio; quando ausente, a etapa é só marcar como feita. */
  corpo?: (ctx: { client: Client; concluir: () => void }) => React.ReactNode;
  /** Texto do botão quando a etapa não tem corpo próprio. */
  acao?: string;
};

/* ── Primeiro acesso ──────────────────────────────────────────── */
function PrimeiroAcesso({ client, concluir }: { client: Client; concluir: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const pronto = !!client.lojista_company_id && !!client.admin_email;

  const avisar = async () => {
    setEnviando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${FUNCTIONS_URL}/cliente-avisar-acesso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ client_id: client.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Não foi possível avisar.');
      if (d.ok) { toast.success('Link de primeiro acesso enviado no WhatsApp'); concluir(); }
      else if (d.repetido) { toast.info('Esse aviso já tinha sido enviado.'); concluir(); }
      else toast.warning(`Não enviado: ${d.motivo}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] p-4 space-y-2">
        <Campo rotulo="Vai para" valor={client.whatsapp || '— sem WhatsApp cadastrado'} />
        <Campo rotulo="Login" valor={client.admin_email || '— sistema ainda não criado'} />
        <Campo rotulo="Sistema" valor={client.domain || LOJISTA_APP_URL.replace('https://', '')} />
      </div>

      <p className="text-[12px] text-foreground/45 leading-snug">
        Ele recebe um link que vale 24 horas e define a própria senha. Não existe senha
        para combinar por telefone.
      </p>

      <button
        onClick={avisar}
        disabled={enviando || !pronto}
        className="w-full h-12 rounded-xl bg-emerald-500 text-white text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        Enviar o primeiro acesso
      </button>
      {!pronto && (
        <p className="text-[11.5px] text-amber-500/90 leading-snug">
          O sistema deste cliente ainda não existe. Crie o sistema na ficha antes de liberar o acesso.
        </p>
      )}
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline gap-3 min-w-0">
      <span className="text-[11px] text-foreground/35 w-16 shrink-0">{rotulo}</span>
      <span className="text-[12.5px] text-foreground/85 truncate">{valor}</span>
    </div>
  );
}

/* ── As etapas ────────────────────────────────────────────────── */
const ETAPAS: Etapa[] = [
  {
    chave: 'acesso_liberado',
    titulo: 'Liberar o primeiro acesso',
    resumo: 'Manda no WhatsApp o link que abre o sistema pela primeira vez.',
    icone: MessageCircle,
    corpo: ({ client, concluir }) => <PrimeiroAcesso client={client} concluir={concluir} />,
  },
  {
    chave: 'logo_aplicada',
    titulo: 'Identidade visual',
    resumo: 'Logo, ícone e banner, aplicados direto no sistema e no site dele.',
    icone: Upload,
    corpo: ({ client, concluir }) => <CorpoIdentidade client={client} onDone={concluir} />,
  },
  {
    chave: 'dominio_conectado',
    titulo: 'Domínio',
    resumo: 'O site do cliente no endereço dele, não no nosso.',
    icone: Globe,
    corpo: ({ client, concluir }) => <CorpoDominio client={client} onDone={concluir} />,
  },
  {
    chave: 'dados_importados',
    titulo: 'Estoque no ar',
    resumo: 'Os veículos dele cadastrados e publicados nos canais contratados.',
    icone: Boxes,
    acao: 'Estoque importado',
  },
  {
    chave: 'treinamento_realizado',
    titulo: 'Treinamento',
    resumo: 'A equipe dele sabe operar o sistema sem precisar ligar para nós.',
    icone: GraduationCap,
    acao: 'Treinamento concluído',
  },
];

/**
 * Onboarding do cliente, uma etapa por tela.
 *
 * Era uma lista de nove caixinhas onde se alternava o estado de cada uma.
 * Caixinha não diz o que fazer — diz só que falta. Aqui cada etapa ocupa a
 * tela inteira, com o que ela pede à mão, e o avanço é a conclusão do que
 * está na frente. O que o sistema já sabe (contrato, pagamento, sistema
 * criado) não vira etapa: aparece fechado antes de começar.
 */
export default function Onboarding() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { member } = useAuth();
  const { data: client, isLoading } = useClient(id);
  const { data: tasks = [] } = useOnboardingTasks(id);
  const toggle = useToggleTask();
  const update = useUpdateClient();
  const [i, setI] = useState(0);
  const [ativando, setAtivando] = useState(false);

  const feito = useMemo(() => {
    const m: Record<string, OnboardingTask> = {};
    for (const t of tasks) m[t.task_key] = t;
    return m;
  }, [tasks]);

  if (isLoading || !client) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </div>
    );
  }

  const total = ETAPAS.length;
  const etapa = ETAPAS[Math.min(i, total - 1)];
  const noFim = i >= total;
  const tudoFeito = ETAPAS.every((e) => feito[e.chave]?.done);

  const concluir = async (chave: string) => {
    const t = feito[chave];
    if (t && !t.done && member) {
      await toggle.mutateAsync({ id: t.id, done: true, userId: member.id });
    }
    setI((v) => v + 1);
  };

  const ativar = async () => {
    setAtivando(true);
    try {
      await update.mutateAsync({ id: client.id, status: 'ativo', activated_at: new Date().toISOString() });
      const t = feito['go_live'];
      if (t && !t.done && member) await toggle.mutateAsync({ id: t.id, done: true, userId: member.id });
      toast.success(`${client.company_name} está no ar! 🎉`);
      navigate(`/clientes/${client.id}`);
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao ativar');
      setAtivando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8 sm:py-12">

        <button
          onClick={() => navigate(`/clientes/${client.id}`)}
          className="flex items-center gap-1.5 text-[12.5px] text-foreground/45 hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {client.company_name}
        </button>

        <header className="mb-7">
          <p className="text-[11px] font-light tracking-[0.22em] uppercase text-primary mb-3">
            {noFim ? 'Última etapa' : `Passo ${i + 1} de ${total}`}
          </p>
          <h1 className="text-[28px] sm:text-[34px] font-bold text-foreground leading-[1.1] tracking-tight">
            {noFim ? 'Colocar no ar' : etapa.titulo}
          </h1>
          <p className="text-[13px] text-foreground/45 mt-2 leading-snug">
            {noFim
              ? 'O cliente passa a operar sozinho e entra na contagem de clientes ativos.'
              : etapa.resumo}
          </p>
          <div className="h-[3px] w-14 bg-primary rounded-full mt-5" />
        </header>

        {/* Trilha — onde estou e o que já ficou para trás */}
        <div className="flex items-center gap-1.5 mb-7">
          {ETAPAS.map((e, k) => (
            <button
              key={e.chave}
              onClick={() => setI(k)}
              title={e.titulo}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                feito[e.chave]?.done ? 'bg-emerald-500'
                  : k === i ? 'bg-primary'
                  : 'bg-black/[0.08] dark:bg-white/[0.1] hover:bg-foreground/20',
              )}
            />
          ))}
          <button
            onClick={() => setI(total)}
            title="Colocar no ar"
            className={cn('h-1.5 w-8 rounded-full transition-colors',
              noFim ? 'bg-primary' : 'bg-black/[0.08] dark:bg-white/[0.1] hover:bg-foreground/20')}
          />
        </div>

        <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] p-5 sm:p-6">
          {noFim ? (
            <div className="space-y-4">
              {!tudoFeito && (
                <p className="text-[12px] text-amber-500/90 leading-snug">
                  Ainda há etapa em aberto. Dá para colocar no ar assim mesmo — mas confira
                  o que ficou para trás na trilha acima.
                </p>
              )}
              <button
                onClick={ativar}
                disabled={ativando || client.status === 'ativo'}
                className="w-full h-12 rounded-xl bg-emerald-500 text-white text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {ativando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PartyPopper className="h-4 w-4" />}
                {client.status === 'ativo' ? 'Cliente já está ativo' : 'Colocar no ar'}
              </button>
            </div>
          ) : feito[etapa.chave]?.done ? (
            <div className="text-center py-3 space-y-3">
              <span className="h-11 w-11 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
                <Check className="h-5 w-5" strokeWidth={3} />
              </span>
              <p className="text-[13px] text-foreground/60">Esta etapa já está concluída.</p>
              <button
                onClick={() => setI((v) => v + 1)}
                className="h-10 px-5 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-[12.5px] font-medium text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors inline-flex items-center gap-1.5"
              >
                Próxima etapa <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : etapa.corpo ? (
            etapa.corpo({ client, concluir: () => concluir(etapa.chave) })
          ) : (
            <button
              onClick={() => concluir(etapa.chave)}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <etapa.icone className="h-4 w-4" /> {etapa.acao}
            </button>
          )}
        </div>

        {/* Pular é explícito: etapa não concluída continua aparecendo em aberto. */}
        {!noFim && !feito[etapa.chave]?.done && (
          <button
            onClick={() => setI((v) => v + 1)}
            className="w-full h-11 mt-3 rounded-xl text-[12.5px] font-medium text-foreground/40 hover:text-foreground transition-colors"
          >
            Deixar para depois
          </button>
        )}
      </div>
    </div>
  );
}
