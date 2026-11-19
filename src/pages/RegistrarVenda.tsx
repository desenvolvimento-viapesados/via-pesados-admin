import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useProspects, useRegisterSale, useCriarAssinaturaAsaas, useDemos, useUpdateDemo,
  useUpdateClient, useTeam, adotarAmostra, saveSystemCredential, setCompanyChannels,
  genPassword, slugify, brlFull,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { useFrente } from '@/contexts/FrenteContext';
import { criarTesteGratis } from '@/hooks/useTesteGratis';
import { CidadeUF } from '@/components/crm/CidadeUF';
import { APOIO, CAMPO, Casca, Opcao } from '@/components/crm/esteira/Casca';
import { DemoDialog } from '@/components/crm/AmostrasTab';
import { mascaraTelefone, mascaraTelefoneDoBanco, soDigitos, mascaraMoeda, valorDaMoeda, moedaDeNumero } from '@/lib/mascaras';
import { DIAS_DE_TESTE } from '@/lib/testeGratis';

const CANAIS_VENDA = [
  { id: 'mercadolivre', nome: 'Mercado Livre', sub: 'Anúncios de veículo com o preço sincronizado.' },
  { id: 'facebook',     nome: 'Facebook, Instagram e WhatsApp', sub: 'Um login libera Página, Instagram e catálogo.' },
] as const;

/* ── As peças das telas ──────────────────────────────────────────
   A casca, o campo e o botão de apoio vêm da esteira (Casca.tsx). Aqui só o que esta
   página tem a mais: o rótulo em cima do campo, a escolha de marcar e a linha do resumo. */

const ROTULO = 'block text-[13px] font-semibold text-foreground mb-1.5';
const NOTA = 'text-[14px] text-foreground/55 leading-relaxed';

function Rotulado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={ROTULO}>{rotulo}</span>
      {children}
    </label>
  );
}

/** A `Opcao` da esteira com a caixinha de marcado: aqui a escolha liga e desliga, não leva a outra tela. */
function Marcar({ ligada, rotulo, sub, onClick, disabled }: {
  ligada: boolean; rotulo: string; sub?: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={ligada}
      className={cn(
        'w-full text-left px-5 sm:px-6 py-5 rounded-2xl border-2 transition-all disabled:opacity-50 flex items-center gap-4',
        ligada ? 'border-primary bg-primary/10' : 'border-black/[0.09] dark:border-white/[0.1] hover:border-primary/40 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]',
      )}>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[18px] font-semibold', ligada ? 'text-primary' : 'text-foreground')}>{rotulo}</span>
        {sub && <span className="block text-[14px] text-foreground/50 mt-0.5 font-normal">{sub}</span>}
      </span>
      <span className={cn('h-6 w-6 shrink-0 rounded-lg border-2 flex items-center justify-center',
        ligada ? 'bg-primary border-primary' : 'border-black/20 dark:border-white/25')}>
        {ligada && <Check className="h-4 w-4 text-primary-foreground" strokeWidth={3} />}
      </span>
    </button>
  );
}

/** Uma linha do resumo. Tocar nela leva à tela daquela resposta. */
function Linha({ rotulo, children, onClick, alerta, disabled }: {
  rotulo: string; children: ReactNode; onClick: () => void; alerta?: boolean; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-full flex items-baseline justify-between gap-4 py-3 text-left text-[15px] transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03] disabled:opacity-50">
      <span className="shrink-0 text-foreground/55">{rotulo}</span>
      <span className={cn('min-w-0 text-right font-medium [overflow-wrap:anywhere]', alerta ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>{children}</span>
    </button>
  );
}

/** As telas do passo a passo. A ordem e quais aparecem saem de quem está comprando (ver `ordem`). */
type Passo = 'mensalidade' | 'acesso' | 'email' | 'sistema' | 'empresa' | 'cnpj' | 'representante' | 'canais' | 'fim';

const vazio = {
  company_name: '', legal_name: '', cnpj: '', address: '',
  legal_rep_name: '', legal_rep_cpf: '',
  contact_name: '', whatsapp: '', city: '', state: '',
  mrr: '', canais: [] as string[],
  gerar_cobranca: true,
  acesso_nome: '', acesso_email: '',
  owner_id: '',
};

/**
 * Fecha a venda.
 *
 * Era um pop-up e virou página por uma razão concreta: aqui se decide quem
 * da empresa recebe o primeiro login e qual amostra vira o sistema dela.
 * Nenhuma das duas é reversível com um clique, e nenhuma cabe num diálogo
 * que o operador fecha sem querer clicando fora.
 */
/**
 * `teste`: a loja foi arrastada para "Teste grátis" no funil. O cadastro é o
 * mesmo — sistema, acesso, canais, a mensalidade que vale depois —, mas o
 * prospect fica em Teste grátis e a loja vai para a implantação de teste.
 */
export default function RegistrarVenda({ teste: modoTeste = false }: { teste?: boolean } = {}) {
  const { id: prospectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { member } = useAuth();
  const { data: prospects = [] } = useProspects();
  const { data: demos = [] } = useDemos();
  const { data: equipe = [] } = useTeam();
  const register = useRegisterSale();
  /* Transportadora: não há amostra para adotar nem canal para contratar — o
     sistema nasce na ficha, e a amostra dela é a de exemplo, pública. */
  const { frente } = useFrente();
  const transp = frente === 'transportadora';
  const atualizarCliente = useUpdateClient();
  const atualizarDemo = useUpdateDemo();
  const gerarLink = useCriarAssinaturaAsaas();

  const prospect = useMemo(
    () => prospects.find((p) => p.id === prospectId) ?? null,
    [prospects, prospectId],
  );

  const [form, setForm] = useState(vazio);
  /* Senha gerada e nunca mostrada: quem define a dele é o próprio cliente,
     pelo link de primeiro acesso. Esta fica guardada em credenciais do
     sistema só como caminho de recuperação para o suporte. */
  const [senha] = useState(genPassword());
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof vazio, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    setForm((f) => ({
      ...f,
      company_name: prospect?.company_name ?? '',
      contact_name: prospect?.contact_name ?? '',
      whatsapp: mascaraTelefoneDoBanco(prospect?.whatsapp),
      city: prospect?.city ?? '',
      state: prospect?.state ?? '',
      mrr: moedaDeNumero(prospect?.proposal_value),
      acesso_nome: prospect?.contact_name ?? '',
      owner_id: prospect?.owner_id ?? member?.id ?? '',
    }));
  }, [prospect?.id, member?.id]);

  // O campo é texto mascarado ("1.200,00"): Number() nele daria 1.2, e este
  // número vira a cobrança no Asaas.
  const mrrNum = valorDaMoeda(form.mrr) ?? 0;
  /* A amostra é sempre a do card (dono, 19/11/2026: "a amostra sempre estará vinculada ao card
     dele; se não está lá, precisa criar, e a criação deve ser ali"). Nada de escolher numa lista. */
  const amostraDoCard = prospectId
    ? demos.find((d) => d.prospect_id === prospectId && d.status !== 'descartada' && d.status !== 'convertida') ?? null
    : null;
  const [semAmostra, setSemAmostra] = useState(false);
  const [montando, setMontando] = useState(false);
  const amostra = !semAmostra && amostraDoCard?.lojista_company_id ? amostraDoCard : null;

  const alternarCanal = (cid: string) =>
    setForm((f) => ({
      ...f,
      canais: f.canais.includes(cid) ? f.canais.filter((x) => x !== cid) : [...f.canais, cid],
    }));

  const salvar = async () => {
    if (!form.company_name.trim()) { toast.error('Informe o nome da empresa'); return; }
    if (soDigitos(form.whatsapp).length < 10) {
      toast.error('Informe o WhatsApp — é por onde a confirmação e a nota são enviadas');
      return;
    }
    // Sem e-mail de primeiro acesso não existe login, e o cliente paga sem
    // conseguir entrar. É o único campo desta tela que trava o salvamento
    // por si só.
    const email = form.acesso_email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error('Informe o e-mail de quem recebe o primeiro acesso');
      return;
    }

    setSalvando(true);
    try {
      const client = await register.mutateAsync({
        etapa: modoTeste ? 'teste' : 'vendido',
        input: {
          company_name: form.company_name.trim(),
          legal_name: form.legal_name || null,
          cnpj: form.cnpj || null,
          address: form.address || null,
          legal_rep_name: form.legal_rep_name || null,
          legal_rep_cpf: form.legal_rep_cpf || null,
          contact_name: form.contact_name || null,
          whatsapp: form.whatsapp || null,
          email,
          city: form.city || null,
          state: form.state || null,
          mrr: mrrNum,
          // Só existe contrato mensal. O campo continua no banco porque
          // clientes antigos têm outros valores gravados.
          recurrence: 'mensal' as const,
          canais: form.canais,
          owner_id: form.owner_id || member?.id || null,
        },
        prospectId,
      });

      /* A partir daqui nada desfaz a venda. Cada etapa avisa e segue: o
         cliente e o contrato já existem, e refazer só a etapa que falhou é
         possível pela ficha. */
      if (amostra?.lojista_company_id) {
        try {
          const r = await adotarAmostra({
            company_id: amostra.lojista_company_id,
            company_name: form.company_name.trim(),
            company_slug: slugify(form.company_name),
            admin_email: email,
            admin_password: senha,
            admin_full_name: form.acesso_nome || form.contact_name || form.company_name,
            city: form.city || undefined,
            state: form.state || undefined,
            address: form.address || undefined,
          });
          await atualizarCliente.mutateAsync({
            id: client.id,
            lojista_company_id: r.company_id,
            admin_email: email,
          });
          await saveSystemCredential({ client_id: client.id, email, password: senha });
          await atualizarDemo.mutateAsync({ id: amostra.id, status: 'convertida' });
          if (form.canais.length) {
            try { await setCompanyChannels(r.company_id, form.canais); }
            catch { toast.warning('Sistema pronto, mas os canais não foram aplicados. Ajuste em "Canais liberados".'); }
          }
          toast.success('Sistema do cliente pronto a partir da amostra');
        } catch (e) {
          toast.warning(`Venda registrada, mas a amostra não virou o sistema: ${(e as Error).message}`);
        }
      }

      /* Teste grátis: os 60 dias começam na implantação (no aviso de
         acesso), não agora. A linha nasce esperando; a rotina diária e o
         aviso de acesso cuidam do resto. */
      if (modoTeste) {
        try {
          await criarTesteGratis(client.id, form.owner_id || member?.id || null, member?.id ?? null);
        } catch (e) {
          toast.warning(`Venda registrada, mas o teste grátis não foi criado: ${(e as Error).message}`);
        }
      }

      if (form.gerar_cobranca && mrrNum > 0) {
        try {
          await gerarLink.mutateAsync({ client_id: client.id, valor: mrrNum });
          toast.success(modoTeste
            ? 'Teste grátis registrado — a assinatura fica pronta para quando ele decidir'
            : 'Venda registrada e cobrança mensal criada');
        } catch (e) {
          toast.warning(`Venda registrada, mas a cobrança não foi gerada: ${(e as Error).message}`);
        }
      } else {
        toast.success(modoTeste ? 'Teste grátis registrado' : 'Venda registrada — contrato emitido em rascunho');
      }

      /* A cobrança é o próximo passo real: manda o link e espera. Cair na
         ficha obrigava a procurar o link no meio de um checklist. No teste,
         o próximo passo é implantar — o link de assinar vai nos avisos. */
      /* Veio da esteira: volta para ela, na tela seguinte da loja (o link de pagamento, ou a implantação). */
      const daEsteira = new URLSearchParams(window.location.search).get('de') === 'esteira';
      navigate(daEsteira ? `/crm/esteira/${encodeURIComponent(`cliente:${client.id}`)}`
        : modoTeste ? '/crm?tab=implantacao&aba=teste' : `/clientes/${client.id}/cobranca`);
    } catch {
      toast.error('Erro ao registrar venda');
      setSalvando(false);
    }
  };

  /* ── O passo a passo ─────────────────────────────────────────────
     Daqui para baixo é só COMO as perguntas aparecem: uma por tela, na casca da esteira
     (dono, 18/11/2026: quem fecha a venda ao vivo, na chamada, quer o mesmo jeito do
     "Nova compra"). O que se guarda e o que se grava continuam sendo o `form` e o `salvar`
     aqui de cima. */
  const [indice, setIndice] = useState(0);
  /* Veio do resumo para corrigir uma resposta: os botões da tela devolvem ao resumo. */
  const [revendo, setRevendo] = useState(false);

  /* Com o card do funil a empresa já vem preenchida, e a conversa começa pelo valor. Sem
     card (cliente novo, direto), o nome vem primeiro: é ele que diz de quem é a venda.
     Transportadora não tem amostra para adotar nem canal para contratar. */
  const ordem = ((prospectId
    ? ['mensalidade', 'acesso', 'email', 'sistema', 'empresa', 'cnpj', 'representante', 'canais', 'fim']
    : ['empresa', 'mensalidade', 'acesso', 'email', 'cnpj', 'representante', 'canais', 'fim']
  ) as Passo[]).filter((p) => !transp || (p !== 'sistema' && p !== 'canais'));
  const ultimo = ordem.length - 1;
  const posicao = Math.min(indice, ultimo);
  const passo = ordem[posicao];

  /* O que trava cada tela, com os mesmos avisos do `salvar`. */
  const falta = (p: Passo): string | null => {
    if (p === 'empresa' && !form.company_name.trim()) return 'Informe o nome da empresa';
    if (p === 'acesso' && soDigitos(form.whatsapp).length < 10) {
      return 'Informe o WhatsApp — é por onde a confirmação e a nota são enviadas';
    }
    if (p === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.acesso_email.trim().toLowerCase())) {
      return 'Informe o e-mail de quem recebe o primeiro acesso';
    }
    return null;
  };

  const ir = (i: number) => { setIndice(i); window.scrollTo(0, 0); };
  const avancar = () => {
    const aviso = falta(passo);
    if (aviso) { toast.error(aviso); return; }
    if (revendo) { setRevendo(false); ir(ultimo); return; }
    ir(Math.min(posicao + 1, ultimo));
  };
  const voltar = () => {
    if (salvando) return;
    if (revendo) { setRevendo(false); ir(ultimo); return; }
    if (posicao === 0) { navigate(prospectId ? `/crm/prospect/${prospectId}` : '/crm'); return; }
    ir(posicao - 1);
  };
  const corrigir = (p: Passo) => { setRevendo(true); ir(ordem.indexOf(p)); };
  /* Antes de gravar, confere as telas de novo: se faltar algo, abre a tela certa em vez de
     só avisar por cima do resumo. */
  const registrar = () => {
    const parada = ordem.find((p) => falta(p));
    if (parada) { toast.error(falta(parada)!); corrigir(parada); return; }
    salvar();
  };
  const aoEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.repeat || e.nativeEvent.isComposing) return;
    e.preventDefault();
    avancar();
  };

  const textos: Record<Passo, { rotulo: string; pergunta: string; dica: string }> = {
    mensalidade: {
      rotulo: 'Mensalidade',
      pergunta: modoTeste ? 'Qual é a mensalidade depois do teste?' : 'Qual é a mensalidade?',
      dica: modoTeste
        ? `São ${DIAS_DE_TESTE} dias de teste grátis, contados da implantação, sem cartão. ${transp
          ? 'Se não assinar, o acesso é bloqueado no fim do teste.'
          : 'Se não assinar, painel e site saem do ar no dia seguinte ao fim.'}`
        : 'O valor combinado com o cliente, por mês.',
    },
    acesso: {
      rotulo: 'Acesso',
      pergunta: 'Quem vai receber o acesso?',
      dica: transp
        ? 'É quem entra primeiro no sistema e cadastra a equipe.'
        : 'É quem entra primeiro no sistema, conecta os canais e cadastra a equipe.',
    },
    email: {
      rotulo: 'E-mail',
      pergunta: 'Qual é o e-mail do primeiro acesso?',
      dica: transp
        ? 'Não precisa combinar senha: a pessoa cria a dela pelo link que sai na ficha, quando o sistema for criado. O link vale 24 horas.'
        : 'Não precisa combinar senha: a pessoa cria a dela pelo link que chega no WhatsApp quando você liberar o acesso. O link vale 24 horas.',
    },
    sistema: {
      rotulo: 'Sistema',
      pergunta: amostraDoCard ? 'O sistema dele é a amostra' : `Monte a amostra da ${form.company_name.trim() || 'loja'}`,
      dica: amostraDoCard
        ? 'A amostra ligada a este card vira o sistema dele.'
        : 'Este card ainda não tem amostra. É dela que nasce o sistema do cliente, com a marca da loja.',
    },
    empresa: {
      rotulo: 'Empresa',
      pergunta: 'Qual é a empresa?',
      dica: transp ? 'O nome aparece no sistema e no contrato.' : 'O nome aparece no sistema, no site e no contrato.',
    },
    cnpj: {
      rotulo: 'Contrato',
      pergunta: 'Qual é o CNPJ da empresa?',
      dica: 'Entra no contrato. Se não tiver agora, pode pular: o cliente preenche no link, antes de aceitar o contrato.',
    },
    representante: {
      rotulo: 'Contrato',
      pergunta: 'Quem assina o contrato?',
      dica: 'O representante legal da empresa. Se não tiver agora, pode pular: o cliente preenche no link, antes de aceitar o contrato.',
    },
    canais: {
      rotulo: 'Canais',
      pergunta: 'Quais canais ele contratou?',
      dica: 'Toque para marcar. Pode ser os dois, ou nenhum.',
    },
    fim: {
      rotulo: 'Conferir',
      pergunta: modoTeste ? 'Confira e comece o teste' : 'Confira e registre',
      dica: 'Toque em uma linha para corrigir.',
    },
  };
  const texto = textos[passo];


  return (
    <Casca
      legenda={form.company_name.trim() || 'Novo cliente'}
      indice={posicao}
      total={ordem.length}
      etapa={`${modoTeste ? 'Teste grátis' : 'Venda'} · ${texto.rotulo}`}
      pergunta={texto.pergunta}
      dica={texto.dica}
      onVoltar={voltar}
      rotuloVoltar={revendo ? 'Resumo' : posicao === 0 ? 'Cancelar' : 'Voltar'}
      acao={passo === 'fim'
        ? { rotulo: modoTeste ? 'Começar o teste grátis' : 'Registrar a venda', ocupado: salvando, onClick: registrar }
        : { rotulo: revendo ? 'Pronto' : 'Continuar', onClick: avancar }}
    >
      {/* `key`: cada tela nasce do zero, e o cursor já cai no campo dela. */}
      <Fragment key={passo}>
        {passo === 'mensalidade' && (
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] font-semibold text-foreground/40">R$</span>
            {/* Um plano só, e a mensalidade é negociada por cliente: não há o que escolher
                aqui além do valor. */}
            <input
              className={cn(CAMPO, 'h-16 pl-14 text-[26px] font-bold tabular-nums')}
              inputMode="numeric"
              autoFocus
              aria-label="Mensalidade, em reais"
              placeholder="0,00"
              value={form.mrr}
              onChange={(e) => set('mrr', mascaraMoeda(e.target.value))}
              onKeyDown={aoEnter}
            />
          </div>
        )}

        {passo === 'acesso' && (
          <>
            <Rotulado rotulo="Nome">
              <input className={CAMPO} autoFocus={!form.acesso_nome.trim()} autoComplete="off" placeholder="Nome de quem recebe"
                value={form.acesso_nome} onChange={(e) => set('acesso_nome', e.target.value)} onKeyDown={aoEnter} />
            </Rotulado>
            <Rotulado rotulo="WhatsApp">
              <input className={CAMPO} autoFocus={!!form.acesso_nome.trim()} autoComplete="off" inputMode="numeric" placeholder="(00) 00000-0000"
                value={form.whatsapp} onChange={(e) => set('whatsapp', mascaraTelefone(e.target.value))} onKeyDown={aoEnter} />
            </Rotulado>
          </>
        )}

        {passo === 'email' && (
          <input className={CAMPO} type="email" inputMode="email" autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false}
            aria-label="E-mail do primeiro acesso" placeholder="nome@empresa.com.br"
            value={form.acesso_email} onChange={(e) => set('acesso_email', e.target.value)} onKeyDown={aoEnter} />
        )}

        {passo === 'sistema' && (
          <div className="space-y-3">
            {amostraDoCard ? (
              amostraDoCard.lojista_company_id ? (
                <>
                  <p className="flex items-start gap-2 text-[17px] font-semibold text-foreground">
                    <Check className="h-5 w-5 mt-[2px] shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
                    <span className="min-w-0">Amostra da {amostraDoCard.company_name}</span>
                  </p>
                  <Opcao rotulo="Mexer na amostra" sub="Logo, cor, textos e site. O que mudar já vale para o sistema dele."
                    onClick={() => setMontando(true)} />
                  <p className={NOTA}>
                    Ao registrar, o conteúdo de demonstração é apagado (veículos, clientes, vendas e funcionários
                    fictícios). Ficam a identidade visual, o site e o domínio. O login da amostra deixa de funcionar.
                  </p>
                </>
              ) : (
                <>
                  <p className={NOTA}>A amostra deste card foi cadastrada, mas o sistema dela ainda não subiu.</p>
                  <Opcao rotulo="Abrir a amostra" sub="Confira e salve de novo para ela subir." onClick={() => setMontando(true)} />
                </>
              )
            ) : (
              <>
                <Opcao rotulo="Montar a amostra agora" sub="Logo, cor e site da loja. Fica ligada a este card." destaque
                  onClick={() => { setSemAmostra(false); setMontando(true); }} />
                <button type="button" onClick={() => { setSemAmostra(true); avancar(); }}
                  className="block pt-2 text-[14px] font-medium text-foreground/50 hover:text-foreground">
                  Seguir sem amostra: o sistema começa do zero, pela ficha
                </button>
              </>
            )}
            {montando && prospectId && (
              <DemoDialog open manterEtapa defaultProspectId={prospectId} demo={amostraDoCard ?? undefined}
                onClose={() => setMontando(false)} />
            )}
          </div>
        )}

        {passo === 'empresa' && (
          <>
            <Rotulado rotulo="Nome da empresa">
              <input className={CAMPO} autoFocus autoComplete="off" placeholder="Como ela é conhecida"
                value={form.company_name} onChange={(e) => set('company_name', e.target.value)} onKeyDown={aoEnter} />
            </Rotulado>
            <div>
              <p className={ROTULO}>Cidade</p>
              {/* O CidadeUF traz o campo dele, menor; aqui os dois botões ficam do tamanho dos outros.
                  `min-w-0`: sem ele, "Escolha a UF primeiro" empurra a cidade para fora da tela no celular. */}
              <div className="[&>div>div]:min-w-0 [&>div>div>button]:h-12 [&>div>div>button]:px-4 [&>div>div>button]:text-[15px]">
                <CidadeUF
                  uf={form.state}
                  cidade={form.city}
                  onChange={({ uf, cidade }) => setForm((f) => ({ ...f, state: uf, city: cidade }))}
                />
              </div>
            </div>
            <Rotulado rotulo="Contato">
              <input className={CAMPO} autoComplete="off" placeholder="Com quem a gente fala"
                value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} onKeyDown={aoEnter} />
            </Rotulado>
          </>
        )}

        {passo === 'cnpj' && (
          <>
            <Rotulado rotulo="CNPJ">
              <input className={CAMPO} autoFocus autoComplete="off" placeholder="00.000.000/0000-00"
                value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} onKeyDown={aoEnter} />
            </Rotulado>
            <Rotulado rotulo="Razão social">
              <input className={CAMPO} autoComplete="off" placeholder="Como está no CNPJ"
                value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} onKeyDown={aoEnter} />
            </Rotulado>
            <Rotulado rotulo="Endereço completo">
              <input className={CAMPO} autoComplete="off" placeholder="Rua, número, bairro e CEP"
                value={form.address} onChange={(e) => set('address', e.target.value)} onKeyDown={aoEnter} />
            </Rotulado>
            <button type="button" className={APOIO} onClick={avancar}>Pular</button>
          </>
        )}

        {passo === 'representante' && (
          <>
            <Rotulado rotulo="Representante legal">
              <input className={CAMPO} autoFocus autoComplete="off" placeholder="Nome completo"
                value={form.legal_rep_name} onChange={(e) => set('legal_rep_name', e.target.value)} onKeyDown={aoEnter} />
            </Rotulado>
            <Rotulado rotulo="CPF do representante">
              <input className={CAMPO} autoComplete="off" placeholder="000.000.000-00"
                value={form.legal_rep_cpf} onChange={(e) => set('legal_rep_cpf', e.target.value)} onKeyDown={aoEnter} />
            </Rotulado>
            <button type="button" className={APOIO} onClick={avancar}>Pular</button>
          </>
        )}

        {passo === 'canais' && (
          <div className="grid gap-3">
            {CANAIS_VENDA.map((c) => (
              <Marcar key={c.id} ligada={form.canais.includes(c.id)} onClick={() => alternarCanal(c.id)} rotulo={c.nome} sub={c.sub} />
            ))}
          </div>
        )}

        {passo === 'fim' && (
          <>
            <div className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
              <Linha rotulo="Empresa" disabled={salvando} onClick={() => corrigir('empresa')}>{form.company_name.trim() || '—'}</Linha>
              <Linha rotulo="Quem recebe" disabled={salvando} onClick={() => corrigir('acesso')}>{form.acesso_nome.trim() || form.contact_name.trim() || '—'}</Linha>
              <Linha rotulo="WhatsApp" disabled={salvando} onClick={() => corrigir('acesso')}>{form.whatsapp || '—'}</Linha>
              <Linha rotulo="E-mail" disabled={salvando} onClick={() => corrigir('email')}>{form.acesso_email.trim().toLowerCase() || '—'}</Linha>
              <Linha rotulo="Mensalidade" disabled={salvando} onClick={() => corrigir('mensalidade')}>
                {mrrNum > 0 ? `${brlFull(mrrNum)} por mês` : '—'}
                {modoTeste && <span className="block font-normal text-foreground/55">depois de {DIAS_DE_TESTE} dias grátis</span>}
              </Linha>
              {!transp && (
                <Linha rotulo="Sistema" disabled={salvando} onClick={() => corrigir('sistema')}>
                  {amostra ? `Amostra de ${amostra.company_name}` : 'Sem amostra: começa do zero'}
                </Linha>
              )}
              {!transp && (
                <Linha rotulo="Canais" disabled={salvando} onClick={() => corrigir('canais')}>
                  {form.canais.length
                    ? CANAIS_VENDA.filter((c) => form.canais.includes(c.id)).map((c) => <span key={c.id} className="block">{c.nome}</span>)
                    : 'Nenhum'}
                </Linha>
              )}
            </div>

            <Marcar
              ligada={form.gerar_cobranca}
              disabled={salvando}
              onClick={() => set('gerar_cobranca', !form.gerar_cobranca)}
              rotulo="Gerar a cobrança mensal"
              sub={mrrNum > 0
                ? `${brlFull(mrrNum)} por mês, todo mês, no Pix, boleto ou cartão.`
                : 'Sem mensalidade informada, nenhuma cobrança é gerada.'}
            />

            <Rotulado rotulo="Responsável pela conta">
              <select className={CAMPO} disabled={salvando} value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
                <option value="">Sem responsável</option>
                {equipe.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
            </Rotulado>

            <p className="text-[13px] text-foreground/45 leading-relaxed">
              Ao confirmar, o cliente é criado, o contrato sai em rascunho
              e {amostra ? 'a amostra vira o sistema dele' : 'o sistema fica para criar depois'}.
            </p>
          </>
        )}
      </Fragment>
    </Casca>
  );
}
