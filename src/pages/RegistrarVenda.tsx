import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Check, Copy, FileText, KeyRound, Link2, Loader2, Monitor, Sparkles, Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useProspects, useRegisterSale, usePlans, useCriarAssinaturaAsaas, useDemos, useUpdateDemo,
  useUpdateClient, useTeam, adotarAmostra, saveSystemCredential, setCompanyChannels,
  genPassword, slugify, brlFull,
} from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { CidadeUF } from '@/components/crm/CidadeUF';
import { mascaraTelefone, soDigitos, mascaraMoeda, valorDaMoeda, moedaDeNumero } from '@/lib/mascaras';

const campo =
  'w-full h-11 px-3.5 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const CANAIS_VENDA = [
  { id: 'mercadolivre', nome: 'Mercado Livre', sub: 'anúncios de veículo com preço sincronizado' },
  { id: 'facebook',     nome: 'Facebook, Instagram e WhatsApp', sub: 'um login libera Página, Instagram e catálogo' },
] as const;

/* ── Seção ───────────────────────────────────────────────────── */
function Secao({
  numero, titulo, descricao, children, destaque,
}: {
  numero: string;
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border p-5 sm:p-6',
        destaque
          ? 'border-primary/30 bg-primary/[0.035]'
          : 'border-black/[0.07] dark:border-white/[0.07] bg-black/[0.015] dark:bg-white/[0.02]',
      )}
    >
      <div className="flex items-baseline gap-3 mb-4">
        <span className={cn(
          'text-[11px] font-mono tabular-nums',
          destaque ? 'text-primary' : 'text-foreground/25',
        )}>{numero}</span>
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold text-foreground leading-tight">{titulo}</h2>
          {descricao && <p className="text-[11.5px] text-foreground/45 mt-1 leading-snug">{descricao}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/* ── Caixa de seleção em linha ───────────────────────────────── */
function Opcao({
  ligada, titulo, sub, onClick, disabled, tom = 'primary',
}: {
  ligada: boolean;
  titulo: React.ReactNode;
  sub?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /* 'neutro' marca a escolha sem recomendá-la: serve para a opção que é a
     ausência de decisão, que em laranja ganharia peso de sugestão. */
  tom?: 'primary' | 'emerald' | 'neutro';
}) {
  const cor = tom === 'emerald'
    ? { borda: 'border-emerald-400/40 bg-emerald-400/[0.06]', caixa: 'bg-emerald-500 border-emerald-500' }
    : tom === 'neutro'
    ? { borda: 'border-black/20 dark:border-white/20 bg-black/[0.03] dark:bg-white/[0.04]', caixa: 'bg-foreground/60 border-foreground/60' }
    : { borda: 'border-primary/50 bg-primary/[0.06]',         caixa: 'bg-primary border-primary' };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-start gap-3 text-left px-3.5 py-3 rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        ligada ? cor.borda : 'border-black/[0.1] dark:border-white/[0.1] hover:border-black/20 dark:hover:border-white/20',
      )}
    >
      <span className={cn(
        'mt-px h-4 w-4 shrink-0 rounded-[5px] border flex items-center justify-center',
        ligada ? cor.caixa : 'border-black/25 dark:border-white/25',
      )}>
        {ligada && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-foreground">{titulo}</span>
        {sub && <span className="block text-[11px] text-foreground/45 mt-0.5 leading-snug">{sub}</span>}
      </span>
    </button>
  );
}

const vazio = {
  company_name: '', legal_name: '', cnpj: '', address: '',
  legal_rep_name: '', legal_rep_cpf: '',
  contact_name: '', whatsapp: '', city: '', state: '',
  plan_id: '', plan: '', mrr: '', recurrence: 'mensal', canais: [] as string[],
  gerar_cobranca: true,
  acesso_nome: '', acesso_email: '',
  demo_id: '',
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
export default function RegistrarVenda() {
  const { id: prospectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { member } = useAuth();
  const { data: prospects = [] } = useProspects();
  const { data: planos = [] } = usePlans();
  const { data: demos = [] } = useDemos();
  const { data: equipe = [] } = useTeam();
  const register = useRegisterSale();
  const atualizarCliente = useUpdateClient();
  const atualizarDemo = useUpdateDemo();
  const gerarLink = useCriarAssinaturaAsaas();

  const prospect = useMemo(
    () => prospects.find((p) => p.id === prospectId) ?? null,
    [prospects, prospectId],
  );

  const [form, setForm] = useState(vazio);
  const [senha] = useState(genPassword());
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof vazio, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  /* Amostras adotáveis, as mais prováveis primeiro.
     Filtrar por prospect_id parecia óbvio e estava errado: na prática toda
     amostra é criada com prospect_id nulo, então o filtro não devolveria
     nenhuma e a venda criaria um sistema vazio sem dizer por quê. Aqui a
     lista mostra tudo que é adotável e ordena pelo que combina — quem
     escolhe é o operador, que sabe qual apresentou. */
  const normaliza = (v?: string | null) =>
    (v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const amostras = useMemo(() => {
    const adotaveis = demos.filter((d) => d.lojista_company_id
      && d.status !== 'descartada' && d.status !== 'convertida');
    const alvo = normaliza(prospect?.company_name);
    const peso = (d: typeof adotaveis[number]) =>
      d.prospect_id && d.prospect_id === prospectId ? 0
      : alvo && normaliza(d.company_name) === alvo ? 1
      : 2;
    return [...adotaveis].sort((a, b) => peso(a) - peso(b));
  }, [demos, prospectId, prospect?.company_name]);

  /** Só pré-seleciona quando não há dúvida de qual é. */
  const amostraObvia = useMemo(() => {
    const alvo = normaliza(prospect?.company_name);
    const doProspect = amostras.filter((d) => d.prospect_id && d.prospect_id === prospectId);
    if (doProspect.length === 1) return doProspect[0].id;
    const porNome = alvo ? amostras.filter((d) => normaliza(d.company_name) === alvo) : [];
    return porNome.length === 1 ? porNome[0].id : '';
  }, [amostras, prospectId, prospect?.company_name]);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      company_name: prospect?.company_name ?? '',
      contact_name: prospect?.contact_name ?? '',
      whatsapp: mascaraTelefone(prospect?.whatsapp),
      city: prospect?.city ?? '',
      state: prospect?.state ?? '',
      mrr: moedaDeNumero(prospect?.proposal_value),
      acesso_nome: prospect?.contact_name ?? '',
      owner_id: prospect?.owner_id ?? member?.id ?? '',
      demo_id: f.demo_id || amostraObvia,
    }));
  }, [prospect?.id, amostraObvia, member?.id]);

  // O campo é texto mascarado ("1.200,00"): Number() nele daria 1.2, e este
  // número vira a cobrança no Asaas.
  const mrrNum = valorDaMoeda(form.mrr) ?? 0;
  // O nome é editável: compara com o que está na tela, não só com o prospect.
  const nomeAlvo = normaliza(form.company_name || prospect?.company_name);
  const amostra = amostras.find((d) => d.id === form.demo_id) ?? null;

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
          plan: form.plan || null,
          plan_id: form.plan_id || null,
          mrr: mrrNum,
          recurrence: form.recurrence as 'mensal' | 'anual' | 'unico',
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

      if (form.gerar_cobranca && form.recurrence === 'mensal' && mrrNum > 0) {
        try {
          await gerarLink.mutateAsync({ client_id: client.id, valor: mrrNum });
          toast.success('Venda registrada e cobrança mensal criada');
        } catch (e) {
          toast.warning(`Venda registrada, mas a cobrança não foi gerada: ${(e as Error).message}`);
        }
      } else {
        toast.success('Venda registrada — contrato emitido em rascunho');
      }

      navigate(`/clientes/${client.id}`);
    } catch {
      toast.error('Erro ao registrar venda');
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12">

        <button
          onClick={() => navigate(prospectId ? `/crm/prospect/${prospectId}` : '/crm')}
          className="flex items-center gap-1.5 text-[12.5px] text-foreground/45 hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {prospect?.company_name ?? 'Funil'}
        </button>

        {/* Cabeçalho — padrão Via Pesados */}
        <header className="mb-10">
          <p className="text-[11px] font-light tracking-[0.22em] uppercase text-primary mb-3">
            Fechamento
          </p>
          <h1 className="text-[30px] sm:text-[38px] leading-[1.08] tracking-tight">
            <span className="block font-extralight text-foreground/50">Registrar a venda de</span>
            <span className="block font-bold text-foreground">{form.company_name || 'novo cliente'}</span>
          </h1>
          <div className="h-[3px] w-16 bg-primary rounded-full mt-5" />
        </header>

        <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
          <div className="space-y-4">

            <Secao numero="01" titulo="A empresa" descricao="O que o contrato exige e o que aparece no sistema e no site.">
              <div className="space-y-2.5">
                <input className={campo} placeholder="Nome da empresa *" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <input className={campo} placeholder="Razão social" value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} />
                  <input className={campo} placeholder="CNPJ" value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} />
                </div>
                <input className={campo} placeholder="Endereço completo" value={form.address} onChange={(e) => set('address', e.target.value)} />
                <CidadeUF
                  uf={form.state}
                  cidade={form.city}
                  onChange={({ uf, cidade }) => setForm((f) => ({ ...f, state: uf, city: cidade }))}
                />
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <input className={campo} placeholder="Representante legal" value={form.legal_rep_name} onChange={(e) => set('legal_rep_name', e.target.value)} />
                  <input className={campo} placeholder="CPF do representante" value={form.legal_rep_cpf} onChange={(e) => set('legal_rep_cpf', e.target.value)} />
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <input className={campo} placeholder="Contato" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
                  <input className={campo} placeholder="WhatsApp *" inputMode="numeric" value={form.whatsapp} onChange={(e) => set('whatsapp', mascaraTelefone(e.target.value))} />
                </div>
              </div>
            </Secao>

            <Secao
              numero="02"
              titulo="Primeiro acesso"
              descricao="Quem da empresa recebe o login. É esta pessoa que entra primeiro, conecta os canais e cadastra o resto da equipe."
              destaque
            >
              <div className="space-y-2.5">
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <input className={campo} placeholder="Nome de quem recebe" value={form.acesso_nome} onChange={(e) => set('acesso_nome', e.target.value)} />
                  <input className={campo} type="email" placeholder="E-mail do primeiro acesso *" value={form.acesso_email} onChange={(e) => set('acesso_email', e.target.value)} />
                </div>
                <div className="flex items-center gap-2.5 px-3.5 h-11 rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-background">
                  <KeyRound className="h-3.5 w-3.5 text-foreground/35 shrink-0" />
                  <span className="text-[12.5px] font-mono text-foreground/70 truncate flex-1">{senha}</span>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(senha); toast.success('Senha copiada'); }}
                    className="text-[11px] text-primary hover:opacity-70 flex items-center gap-1 shrink-0"
                  >
                    <Copy className="h-3 w-3" /> copiar
                  </button>
                </div>
                <p className="text-[11px] text-foreground/40 leading-snug px-1">
                  A senha é gerada agora e guardada em credenciais do sistema, que só o admin lê.
                  Ela vai junto com o aviso de liberação de acesso.
                </p>
              </div>
            </Secao>

            <Secao
              numero="03"
              titulo="Vincular projeto a"
              descricao="A amostra que ele viu já tem a identidade visual, o site, o domínio e os canais montados. Ela passa a ser o sistema real da empresa."
            >
              <div className="space-y-1.5">
                {amostras.map((d) => (
                  <Opcao
                    key={d.id}
                    ligada={form.demo_id === d.id}
                    onClick={() => set('demo_id', form.demo_id === d.id ? '' : d.id)}
                    titulo={
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary" /> {d.company_name}
                      </span>
                    }
                    sub={
                      <>
                        {d.admin_email ?? d.slug}
                        {!!nomeAlvo && normaliza(d.company_name) !== nomeAlvo && (
                          <span className="block text-amber-500/80">
                            Outro nome de empresa — confira se foi esta que você apresentou.
                          </span>
                        )}
                      </>
                    }
                  />
                ))}
                <Opcao
                  tom="neutro"
                  ligada={!form.demo_id}
                  onClick={() => set('demo_id', '')}
                  titulo={
                    <span className="flex items-center gap-1.5">
                      <Monitor className="h-3 w-3 text-foreground/40" /> Criar um sistema novo depois
                    </span>
                  }
                  sub="Nasce vazio, pela ficha do cliente. A amostra apresentada não é aproveitada."
                />
                {amostra && (
                  <p className="text-[11px] text-foreground/45 leading-snug px-1 pt-2">
                    Ao salvar, o conteúdo de demonstração dessa amostra é apagado — os veículos,
                    clientes, vendas e funcionários fictícios. Ficam a identidade visual, o site,
                    o domínio, os cargos, o plano de contas e as etiquetas. O login antigo da
                    amostra deixa de funcionar.
                  </p>
                )}
                {!amostras.length && (
                  <p className="text-[11px] text-foreground/40 leading-snug px-1 pt-2">
                    Não há nenhuma amostra provisionada disponível. O sistema será criado vazio.
                  </p>
                )}
              </div>
            </Secao>

            <Secao numero="04" titulo="Contrato e canais" descricao="O valor do contrato e o que ele contratou.">
              <div className="space-y-2.5">
                <div className="grid sm:grid-cols-3 gap-2.5">
                  <select
                    className={campo}
                    value={form.plan_id}
                    onChange={(e) => {
                      const p = planos.find((x) => x.id === e.target.value);
                      // O plano carrega o preço: digitar de novo abriria espaço
                      // para vender o mesmo plano por valores diferentes.
                      setForm((f) => ({
                        ...f,
                        plan_id: e.target.value,
                        plan: p?.name ?? '',
                        mrr: p && f.recurrence === 'mensal' ? moedaDeNumero(p.monthly_value) : f.mrr,
                      }));
                    }}
                  >
                    <option value="">Plano…</option>
                    {planos.map((p) => <option key={p.id} value={p.id}>{p.name} — {brlFull(p.monthly_value)}/mês</option>)}
                  </select>
                  <input className={campo} inputMode="numeric" placeholder="Valor do contrato (R$)" value={form.mrr} onChange={(e) => set('mrr', mascaraMoeda(e.target.value))} />
                  <select className={campo} value={form.recurrence} onChange={(e) => set('recurrence', e.target.value)}>
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                    <option value="unico">Único</option>
                  </select>
                </div>
                {form.mrr && form.recurrence !== 'mensal' && (
                  <p className="text-[11px] text-foreground/45 px-1">
                    {form.recurrence === 'anual'
                      ? `Contrato de ${brlFull(mrrNum)} por ano — entra como ${brlFull(Math.round(mrrNum / 12))} de MRR.`
                      : 'Pagamento único não gera receita recorrente — o MRR deste cliente fica zerado.'}
                  </p>
                )}
                <Opcao
                  tom="emerald"
                  ligada={form.gerar_cobranca && form.recurrence === 'mensal'}
                  disabled={form.recurrence !== 'mensal'}
                  onClick={() => set('gerar_cobranca', !form.gerar_cobranca)}
                  titulo={<span className="flex items-center gap-1.5"><Link2 className="h-3 w-3" /> Gerar cobrança mensal no Asaas</span>}
                  sub={
                    form.recurrence !== 'mensal' ? 'Disponível só para contrato mensal.'
                    : form.mrr ? `${brlFull(mrrNum)} por mês, todo mês, no Pix, boleto ou cartão.`
                    : 'Informe o valor acima para gerar.'
                  }
                />
                <div className="pt-2 space-y-1.5">
                  <p className="text-[11.5px] font-medium text-foreground/70 px-1">Canais contratados</p>
                  {CANAIS_VENDA.map((c) => (
                    <Opcao
                      key={c.id}
                      ligada={form.canais.includes(c.id)}
                      onClick={() => alternarCanal(c.id)}
                      titulo={c.nome}
                      sub={c.sub}
                    />
                  ))}
                </div>
              </div>
            </Secao>

            <Secao numero="05" titulo="Responsável" descricao="Quem da Via Pesados responde por esta conta.">
              <select className={campo} value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
                <option value="">Sem responsável</option>
                {equipe.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
            </Secao>
          </div>

          {/* Resumo fixo */}
          <aside className="lg:sticky lg:top-8 space-y-3">
            <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.07] bg-black/[0.015] dark:bg-white/[0.02] p-5">
              <p className="text-[10.5px] font-semibold tracking-widest uppercase text-foreground/30 mb-3">Resumo</p>
              <dl className="space-y-2.5 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-foreground/45">Contrato</dt>
                  <dd className="text-foreground font-medium tabular-nums">{form.mrr ? brlFull(mrrNum) : '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-foreground/45">Recorrência</dt>
                  <dd className="text-foreground capitalize">{form.recurrence}</dd>
                </div>
                <div className="flex justify-between gap-3 min-w-0">
                  <dt className="text-foreground/45 shrink-0">Primeiro acesso</dt>
                  <dd className="text-foreground truncate">{form.acesso_email || '—'}</dd>
                </div>
                <div className="flex justify-between gap-3 min-w-0">
                  <dt className="text-foreground/45 shrink-0">Sistema</dt>
                  <dd className="text-foreground truncate text-right">
                    {amostra ? `amostra de ${amostra.company_name}` : 'novo, vazio'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-foreground/45">Canais</dt>
                  <dd className="text-foreground">{form.canais.length || '—'}</dd>
                </div>
              </dl>
            </div>

            <button
              onClick={salvar}
              disabled={salvando}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
              {salvando ? 'Fechando…' : 'Registrar venda'}
            </button>
            <p className="text-[11px] text-foreground/35 leading-snug px-1 flex items-start gap-1.5">
              <FileText className="h-3 w-3 mt-0.5 shrink-0" />
              Cria o cliente, emite o contrato em rascunho e{amostra ? ' transforma a amostra no sistema dele' : ' deixa o sistema para criar depois'}.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
