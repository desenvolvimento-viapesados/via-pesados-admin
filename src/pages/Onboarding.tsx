import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Globe, Loader2, PartyPopper, RotateCcw,
  Boxes, GraduationCap, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useClient, useOnboardingTasks, useToggleTask, useUpdateClient,
  criarAcessoCliente, criarConviteAcesso, saveSystemCredential, genPassword,
  type Client, type OnboardingTask,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, FUNCTIONS_URL, LOJISTA_APP_URL } from '@/integrations/supabase/client';
import { CorpoDominio, ORDEM_ETAPAS } from '@/components/admin/EtapasCliente';
import { CampoMascarado } from '@/components/crm/CampoMascarado';
import { mascaraTelefone, soDigitos } from '@/lib/mascaras';

/** A marca do WhatsApp. Um balão genérico não é o WhatsApp — e o que sai
    daqui é uma mensagem no WhatsApp, não "uma mensagem". */
const LogoWhatsApp = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
  </svg>
);

/** Uma etapa do onboarding. `chave` casa com onboarding_tasks.task_key. */
type Etapa = {
  chave: string;
  titulo: string;
  resumo: string;
  /** Aceita ícone do lucide e o nosso SVG da marca do WhatsApp. */
  icone: React.ComponentType<{ className?: string }>;
  /** Conteúdo próprio; quando ausente, a etapa é só marcar como feita.
      `jaFeito` distingue fazer de refazer — o que já saiu uma vez precisa
      dizer à função que desta vez é reenvio. */
  corpo?: (ctx: { client: Client; concluir: () => void; jaFeito: boolean }) => React.ReactNode;
  /** Texto do botão quando a etapa não tem corpo próprio. */
  acao?: string;
};

/* ── Primeiro acesso ──────────────────────────────────────────── */

/** Situação de número que a Meta entrega de verdade. */
const NUMERO_OK = 'CONNECTED';

type DiagnosticoWa = {
  corpo?: string;
  botao?: { texto: string; url: string };
  numero?: { situacao?: string; telefone?: string; qualidade?: string };
  carregando: boolean;
  /** Por que não deu para perguntar. Silêncio aqui é o pior estado: a tela
      ficaria sem o aviso vermelho e pareceria mais saudável do que está. */
  falhou?: string;
};

/**
 * O que a Meta sabe: o modelo aprovado e a saúde do nosso número.
 *
 * Lido na hora, nunca copiado. O texto do template vive na Meta — uma cópia
 * aqui passaria a mentir no dia em que alguém editasse o modelo, e a prévia
 * existe justamente para mostrar o que sai.
 *
 * A saúde do número está aqui pelo motivo oposto: quando ele está banido, a
 * Graph aceita o envio e devolve protocolo, o painel registra sucesso e nada
 * chega. Sem isto, a tela mente com a melhor das intenções.
 */
function useDiagnosticoWa(): DiagnosticoWa {
  const [d, setD] = useState<DiagnosticoWa>({ carregando: true });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [t, n] = await Promise.all([
          fetch(`${FUNCTIONS_URL}/wa-diagnostico?template=acesso_equipe`).then((r) => r.json()),
          fetch(`${FUNCTIONS_URL}/wa-diagnostico`).then((r) => r.json()),
        ]);
        if (!vivo) return;
        type Comp = { type: string; text?: string; buttons?: { text: string; url: string }[] };
        const comps: Comp[] = t?.template?.components ?? [];
        const botao = comps.find((c) => c.type === 'BUTTONS')?.buttons?.[0];

        /* A Meta responde erro com corpo JSON, então "deu certo" não é ter
           resposta — é ter o número. Sem esta checagem, conta apagada vira
           uma tela sem aviso nenhum, que é o contrário do que aconteceu. */
        const motivo = n?.erro_meta?.message ?? n?.error ?? (n?.numero ? null : 'a Meta não devolveu o número');
        if (!n?.numero) { setD({ carregando: false, falhou: String(motivo) }); return; }

        setD({
          carregando: false,
          corpo: comps.find((c) => c.type === 'BODY')?.text,
          botao: botao && { texto: botao.text, url: botao.url },
          numero: n.numero,
        });
      } catch (e) {
        if (vivo) setD({ carregando: false, falhou: (e as Error).message || 'sem resposta' });
      }
    })();
    return () => { vivo = false; };
  }, []);

  return d;
}

/** Prévia da mensagem: o texto aprovado com as variáveis já preenchidas. */
function PreviaMensagem({ d, nome, empresa }: { d: DiagnosticoWa; nome: string; empresa: string }) {
  if (d.carregando) {
    return <div className="h-24 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] animate-pulse" />;
  }
  /* Falhar aqui não impede de enviar — a prévia é conferência, não requisito.
     Mas diz que falhou, em vez de sumir e deixar parecer que não há mensagem. */
  if (d.falhou || !d.corpo) {
    return (
      <p className="text-[11.5px] text-foreground/40 leading-snug px-1">
        Não consegui ler o modelo aprovado na Meta agora.
      </p>
    );
  }

  const texto = d.corpo.replace('{{1}}', nome || '—').replace('{{2}}', empresa || '—');

  return (
    <div className="rounded-xl bg-[#e7f7d4] dark:bg-[#1f2c23] border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
      <p className="px-4 pt-3.5 pb-3 text-[12.5px] text-[#111b21] dark:text-white/85 leading-relaxed whitespace-pre-line">
        {texto}
      </p>
      {d.botao && (
        <div className="border-t border-black/[0.07] dark:border-white/[0.08] px-4 py-2.5 text-center">
          <span className="text-[12.5px] font-medium text-[#0a84ff] dark:text-[#53bdeb]">{d.botao.texto}</span>
        </div>
      )}
    </div>
  );
}

function PrimeiroAcesso({ client, concluir, jaFeito }: { client: Client; concluir: () => void; jaFeito: boolean }) {
  const atualizar = useUpdateClient();
  const [email, setEmail] = useState(client.admin_email ?? client.email ?? '');
  const [zap, setZap] = useState(client.whatsapp ?? '');
  const [senha] = useState(genPassword());
  const [indo, setIndo] = useState(false);
  /* O link gerado fica na tela: a area de transferencia some no primeiro Ctrl+C
     seguinte, e quem esta entregando por telefone precisa ler em voz alta. */
  const [link, setLink] = useState<string | null>(null);
  const campoLink = useRef<HTMLInputElement>(null);
  const diag = useDiagnosticoWa();

  /** Copia o que já está na tela. Sem await antes: o gesto ainda vale. */
  const copiarAgora = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado');
    } catch {
      /* Navegador recusou a área de transferência. Deixa o texto selecionado
         e diz o que fazer, em vez de falhar calado. */
      campoLink.current?.select();
      toast.info('Selecionei o link — copie com Ctrl+C (ou Cmd+C)');
    }
  };

  const semSistema = !client.lojista_company_id;
  const numeroRuim = Boolean(diag.numero?.situacao && diag.numero.situacao !== NUMERO_OK);

  /** O e-mail digitado, validado. Null quando não serve. */
  const emailValido = () => {
    const alvo = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alvo)) { toast.error('Informe um e-mail válido'); return null; }
    return alvo;
  };

  /**
   * Garante que o acesso existe: o usuário no sistema do cliente, a
   * credencial guardada e o e-mail gravado na ficha.
   *
   * Separado do envio porque entregar o link é outra decisão. Quando o
   * WhatsApp está fora, isto continua valendo — muda só por onde o link vai.
   */
  const garantirAcesso = async (alvo: string) => {
    if (client.admin_email !== alvo) {
      await criarAcessoCliente({
        company_id: client.lojista_company_id!,
        admin_email: alvo,
        admin_password: senha,
        admin_full_name: client.contact_name ?? client.company_name,
      });
      await saveSystemCredential({ client_id: client.id, email: alvo, password: senha });
      await atualizar.mutateAsync({ id: client.id, admin_email: alvo });
    }
  };

  /** O link na mão do operador, para entregar por onde der. */
  const copiarLink = async () => {
    const alvo = emailValido();
    if (!alvo) return;
    setIndo(true);
    try {
      await garantirAcesso(alvo);
      const { token } = await criarConviteAcesso({
        company_id: client.lojista_company_id!,
        admin_email: alvo,
        admin_full_name: client.contact_name ?? client.company_name,
      });
      /* No domínio do cliente, não no nosso: quem recebe reconhece o próprio
         endereço, e os dois servem o mesmo sistema. */
      const base = client.domain ? `https://${client.domain}` : LOJISTA_APP_URL;
      const url = `${base}/entrar/${token}`;
      setLink(url);
      /* Sem tentar copiar aqui. A tentativa automática vinha depois de duas
         idas ao servidor, e o Chrome recusa a área de transferência com o
         gesto expirado — dizia "copiado" e a área de transferência continuava
         com o que estava antes. Quem copia é o botão do bloco abaixo. */
      toast.success('Link gerado abaixo. Vale 24 horas.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIndo(false);
    }
  };

  /* Uma ação só. Antes eram duas — criar o acesso e depois enviar — e a
     etapa se chama "Liberar o primeiro acesso", não "preparar para liberar".
     Quem está aqui quer que o lojista receba o link; que o usuário precise
     existir antes é problema nosso, não dele. */
  const liberar = async () => {
    const alvo = emailValido();
    if (!alvo) return;
    const digitos = soDigitos(zap);
    if (digitos.length < 10 || digitos.length > 11) {
      toast.error('Informe o WhatsApp com DDD.'); return;
    }
    setIndo(true);
    try {
      /* O número é o destino: grava antes de mandar, senão a função lê o
         antigo do banco e a correção feita aqui não vale nada. */
      if (soDigitos(client.whatsapp) !== digitos) {
        await atualizar.mutateAsync({ id: client.id, whatsapp: zap });
      }

      // 1. O usuário, se ainda não existir ou se o e-mail mudou.
      await garantirAcesso(alvo);

      // 2. O link, no WhatsApp dele.
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${FUNCTIONS_URL}/cliente-avisar-acesso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        /* Refazendo a etapa, o operador está dizendo que a primeira não
           chegou. Sem isto a trava de duplicado devolve "já enviado" e a
           segunda tentativa nunca sai. */
        body: JSON.stringify({ client_id: client.id, reenviar: jaFeito }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Não foi possível enviar.');
      if (d.ok) {
        toast.success(
          numeroRuim
            ? 'A Meta aceitou o envio — mas o número está irregular e ela pode não entregar.'
            : 'Link de primeiro acesso enviado no WhatsApp',
        );
        concluir();
      }
      else if (d.repetido) { toast.info('Esse link já tinha sido enviado.'); concluir(); }
      else toast.warning(`Acesso criado, mas o envio falhou: ${d.motivo}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIndo(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] p-4">
        <Campo rotulo="Sistema" valor={client.domain || LOJISTA_APP_URL.replace('https://', '')} />
      </div>

      {/* Os dois destinos, lado a lado e editáveis: o número recebe a
          mensagem, o e-mail vira o login. Errar um deles é entregar o
          sistema de um cliente na mão de outra pessoa. */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] text-foreground/40 px-1">WhatsApp que recebe a mensagem</label>
          <CampoMascarado
            valorInicial={client.whatsapp ?? ''}
            mascara={mascaraTelefone}
            aoSair={setZap}
            placeholder="(00) 00000-0000"
            className="w-full h-11 px-3.5 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.12] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] text-foreground/40 px-1">E-mail de quem recebe o acesso</label>
          <input
            className="w-full h-11 px-3.5 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.12] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50"
            type="email"
            autoComplete="off"
            placeholder="nome@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-foreground/40 px-1">A mensagem que ele recebe</label>
        <PreviaMensagem
          d={diag}
          nome={(client.contact_name ?? '').trim().split(/\s+/)[0]}
          empresa={client.company_name}
        />
      </div>

      <p className="text-[12px] text-foreground/45 leading-snug">
        O botão abre um link que vale 24 horas: ele define a própria senha e cai direto no
        sistema. Não existe senha para combinar por telefone.
      </p>

      {/* A Graph aceita o envio e devolve protocolo mesmo com o número
          irregular — e aí o painel registra sucesso e nada chega. Dizer
          antes do clique é a diferença entre esperar e ir resolver. */}
      {/* Não saber é diferente de estar tudo bem, e a tela tem de dizer qual
          dos dois é. Quando a conta foi apagada, o aviso vermelho sumiu e a
          tela passou a parecer mais saudável do que estava. */}
      {diag.falhou && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5 space-y-1.5">
          <p className="text-[12.5px] font-semibold text-amber-400">
            Não consegui falar com a Meta
          </p>
          <p className="text-[11.5px] text-foreground/55 leading-snug">
            {diag.falhou}
          </p>
          <p className="text-[11.5px] text-foreground/55 leading-snug">
            Sem isso não dá para saber se a mensagem seria entregue. Entregue o link à mão
            pelo botão abaixo.
          </p>
        </div>
      )}

      {numeroRuim && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3.5 space-y-1.5">
          <p className="text-[12.5px] font-semibold text-red-400">
            O nosso número está em {diag.numero?.situacao} na Meta
          </p>
          <p className="text-[11.5px] text-foreground/55 leading-snug">
            {diag.numero?.telefone ?? 'O número da Via Pesados'} envia, recebe protocolo e a
            mensagem não é entregue. Enquanto isso não for resolvido no Gerenciador do WhatsApp,
            reenviar não adianta — combine o acesso por outro caminho.
          </p>
        </div>
      )}

      <button
        onClick={liberar}
        disabled={indo || semSistema}
        className="w-full h-12 rounded-xl bg-emerald-500 text-white text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {indo ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogoWhatsApp className="h-4 w-4" />}
        {jaFeito ? 'Reenviar o primeiro acesso' : 'Enviar o primeiro acesso'}
      </button>

      {/* A saída quando o canal está fora. Não é o caminho principal — fica
          abaixo do botão, em tom menor — mas é o que impede um cliente
          pagante de ficar esperando a Meta para entrar no sistema dele. */}
      <button
        onClick={copiarLink}
        disabled={indo || semSistema}
        className="w-full h-11 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-[12.5px] font-medium text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
      >
        <Copy className="h-3.5 w-3.5" /> Copiar link para entregar à mão
      </button>

      {link && (
        <div className="rounded-xl border border-primary/35 bg-primary/[0.05] p-3.5 space-y-2.5">
          <p className="text-[12px] font-semibold text-primary">
            Link de primeiro acesso · vale 24 horas
          </p>
          {/* Input e não <p>: dá para selecionar, arrastar e copiar à mão
              quando a área de transferência do navegador estiver bloqueada. */}
          <input
            ref={campoLink}
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full h-10 px-3 rounded-lg bg-background border border-black/[0.1] dark:border-white/[0.12] text-[11.5px] text-foreground/85 font-mono"
          />
          <div className="flex gap-2">
            {/* Copiar aqui e não lá em cima: este clique é a própria ação, sem
                nenhuma ida ao servidor antes. O Chrome recusa a área de
                transferência quando o gesto do usuário já expirou — foi o que
                fez a primeira versão copiar nada e o operador colar o que já
                estava na área de transferência, achando que era o link. */}
            <button
              onClick={copiarAgora}
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar
            </button>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="flex-1 h-10 rounded-lg border border-black/[0.1] dark:border-white/[0.12] text-[12.5px] font-medium text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir
            </a>
          </div>
        </div>
      )}

      {semSistema && (
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
  /* Identidade não é etapa: o sistema vem da amostra, que o cliente aprovou
     com a marca dele já aplicada. A tela pedia o que já estava feito. Trocar
     logo continua possível, pelo painel do sistema na ficha. */
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
  /* Por último de propósito. O acesso é a porta: quando o lojista entra, ele
     tem de encontrar o domínio ligado, a marca dele aplicada e o estoque no
     ar. Abrir antes disso é convidá-lo a ver a obra pela metade. */
  {
    chave: 'acesso_liberado',
    titulo: 'Liberar o primeiro acesso',
    resumo: 'Com tudo pronto, manda no WhatsApp o link que abre o sistema pela primeira vez.',
    icone: LogoWhatsApp,
    corpo: ({ client, concluir, jaFeito }) => (
      <PrimeiroAcesso client={client} concluir={concluir} jaFeito={jaFeito} />
    ),
  },
];

/* A ordem aqui tem de ser a mesma da fonte única. Se alguém acrescentar ou
   reordenar etapa só de um lado, o botão "continuar" da ficha passa a abrir
   a tela errada — e nada quebra para avisar. */
if (import.meta.env.DEV) {
  const daqui = ETAPAS.map((e) => e.chave).join(',');
  const dela = ORDEM_ETAPAS.join(',');
  if (daqui !== dela) {
    console.error(`[onboarding] ETAPAS e ORDEM_ETAPAS divergem:\n  aqui: ${daqui}\n  lá:   ${dela}`);
  }
}

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
  /* A etapa vive na URL. Sem isso, sair da ficha e voltar sempre recomeçava
     do primeiro passo — e quem parou no domínio tinha de reencontrar o
     domínio. Também faz o botão da ficha abrir na tela exata. */
  const [params, setParams] = useSearchParams();
  const [i, setI] = useState(0);
  const [ativando, setAtivando] = useState(false);
  /* Qual etapa concluída está aberta de novo. Guarda a chave, não um
     booleano: assim trocar de passo não deixa a anterior aberta. */
  const [refazendo, setRefazendo] = useState<string | null>(null);

  const feito = useMemo(() => {
    const m: Record<string, OnboardingTask> = {};
    for (const t of tasks) m[t.task_key] = t;
    return m;
  }, [tasks]);

  /* Entrar direto numa etapa: ?etapa=dominio_conectado. Chave desconhecida
     cai no primeiro passo em vez de numa tela em branco. */
  useEffect(() => {
    const chave = params.get('etapa');
    if (!chave) return;
    if (chave === 'fim') { setI(ETAPAS.length); return; }
    const k = ETAPAS.findIndex((e) => e.chave === chave);
    if (k >= 0) setI(k);
  }, []);

  /** Muda de etapa e deixa registrado na URL. */
  const irPara = useCallback((k: number) => {
    setI(k);
    setRefazendo(null);
    const chave = k >= ETAPAS.length ? 'fim' : ETAPAS[k].chave;
    const p = new URLSearchParams(params);
    p.set('etapa', chave);
    setParams(p, { replace: true });
  }, [params, setParams]);

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
    irPara(i + 1);
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
              onClick={() => irPara(k)}
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
            onClick={() => irPara(total)}
            title="Colocar no ar"
            className={cn('h-1.5 w-8 rounded-full transition-colors',
              noFim ? 'bg-primary' : 'bg-black/[0.08] dark:bg-white/[0.1] hover:bg-foreground/20')}
          />
        </div>

        {/* Sem sistema, nenhuma etapa daqui funciona: o domínio publica
            página de erro, a identidade não tem onde ser aplicada e não há
            login para liberar. Trava antes de deixar o operador tentar. */}
        {!client.lojista_company_id && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-5 sm:p-6 mb-4 space-y-3">
            <p className="text-[13px] font-semibold text-amber-400">Este cliente ainda não tem sistema</p>
            <p className="text-[12px] text-foreground/55 leading-snug">
              Nenhuma etapa abaixo funciona sem ele: o domínio publicaria uma página de erro,
              e não existe login para liberar. Crie o sistema na ficha — se houver amostra
              apresentada, aproveite ela para o cliente já encontrar a marca dele montada.
            </p>
            <button
              onClick={() => navigate(`/clientes/${client.id}`)}
              className="h-10 px-4 rounded-xl bg-amber-500 text-black text-[12.5px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
            >
              Ir para a ficha e criar o sistema <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

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
          ) : feito[etapa.chave]?.done && refazendo !== etapa.chave ? (
            <div className="text-center py-3 space-y-3">
              <span className="h-11 w-11 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
                <Check className="h-5 w-5" strokeWidth={3} />
              </span>
              <p className="text-[13px] text-foreground/60">Esta etapa já está concluída.</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => irPara(i + 1)}
                  className="h-10 px-5 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-[12.5px] font-medium text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors inline-flex items-center gap-1.5"
                >
                  Próxima etapa <ArrowRight className="h-3.5 w-3.5" />
                </button>
                {/* Concluída não é irreversível: o link de acesso pode não ter
                    chegado, o domínio pode cair. Antes daqui a etapa feita era
                    uma porta fechada, e refazer exigia desmarcar a tarefa. */}
                {etapa.corpo && (
                  <button
                    onClick={() => setRefazendo(etapa.chave)}
                    className="h-10 px-5 rounded-xl text-[12.5px] font-medium text-foreground/45 hover:text-foreground transition-colors inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Refazer esta etapa
                  </button>
                )}
              </div>
            </div>
          ) : etapa.corpo ? (
            etapa.corpo({
              client,
              concluir: () => { setRefazendo(null); concluir(etapa.chave); },
              jaFeito: Boolean(feito[etapa.chave]?.done),
            })
          ) : (
            <button
              onClick={() => concluir(etapa.chave)}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <etapa.icone className="h-4 w-4" /> {etapa.acao}
            </button>
          )}
        </div>

        {/* Pular é explícito: etapa não concluída continua aparecendo em aberto.
            Refazendo, a saída é fechar de novo sem mexer em nada. */}
        {!noFim && refazendo === etapa.chave ? (
          <button
            onClick={() => setRefazendo(null)}
            className="w-full h-11 mt-3 rounded-xl text-[12.5px] font-medium text-foreground/40 hover:text-foreground transition-colors"
          >
            Deixar como está
          </button>
        ) : !noFim && !feito[etapa.chave]?.done ? (
          <button
            onClick={() => irPara(i + 1)}
            className="w-full h-11 mt-3 rounded-xl text-[12.5px] font-medium text-foreground/40 hover:text-foreground transition-colors"
          >
            Deixar para depois
          </button>
        ) : null}
      </div>
    </div>
  );
}
