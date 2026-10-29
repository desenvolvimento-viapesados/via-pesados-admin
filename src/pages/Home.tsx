import { useNavigate } from 'react-router-dom';
import {
  Users, DollarSign, CreditCard, MessageSquare, BarChart3, ChevronRight,
  UserCheck, Target,
  Layers, HeartPulse, Rocket, ArrowRight, Hourglass, Landmark,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCrmCounts, useTickets, useClients, usePayments, brl } from '@/hooks/useAdmin';
import { mrrDaCarteira } from '@/lib/mrr';
import { inadimplentes } from '@/lib/inadimplencia';
import { useImplantacao, naoSei } from '@/hooks/useImplantacao';
import { useTarefas, useTestesGratis } from '@/hooks/useTesteGratis';
import { situacaoDoTeste, DIAS_DE_TESTE } from '@/lib/testeGratis';
import { hojeBRT } from '../../supabase/functions/_shared/regua';
import { useMemo } from 'react';
import { LOJISTA_APP_URL, TRANSPORTES_APP_URL } from '@/integrations/supabase/client';
import { useFrente } from '@/contexts/FrenteContext';
import { SeletorDeFrente } from '@/components/SeletorDeFrente';
import { HomeEmpresa } from '@/components/home/HomeEmpresa';
import { ModuleTile, NavDaHome, Saudacao, RodapeDaHome, TituloDeSecao } from '@/components/home/partes';

/* ── Home ───────────────────────────────────────────────────── */
/**
 * A tela inicial da frente aberta. Lojistas e Transportadoras têm o mesmo
 * desenho, cada uma com os próprios números (é o banco que separa); a
 * Empresa é a Via Pesados inteira, as duas frentes juntas.
 */
export default function Home() {
  const { frente } = useFrente();
  return frente === 'empresa' ? <HomeEmpresa /> : <HomeDaFrente />;
}

function HomeDaFrente() {
  const navigate = useNavigate();
  const { frente, trocar } = useFrente();
  const transportadora = frente === 'transportadora';

  const { data: tickets = [] } = useTickets();
  const openTickets = tickets.filter((t) => t.status !== 'resolvido').length;
  /* Teste grátis: quem está testando, quem termina logo e a ligação de hoje. */
  const { data: testes = [] } = useTestesGratis();
  const { data: tarefas = [] } = useTarefas();
  const ligacoesDeHoje = tarefas
    .filter((t) => t.origem === 'teste_gratis' && !t.feito_em
      && new Date(new Date(t.quando).getTime() - 3 * 3600_000).toISOString().slice(0, 10) <= hojeBRT())
    .sort((a, b) => a.quando.localeCompare(b.quando));
  const testando = testes.filter((t) => t.status === 'em_teste');
  const retaFinal = testando.filter((t) => situacaoDoTeste(t).reta_final).length;

  const counts = useCrmCounts();

  /* Só o MRR fica na abertura. O panorama da base instalada mora em
     Clientes e em Relatórios, que é onde alguém vai atrás dele — repetido
     aqui virava um quadro a mais para conferir e discordar.
     Sem o panorama, a Home também deixa de consultar o sistema dos
     clientes a cada abertura: uma leitura de dado de cliente a menos,
     registrada à toa no log da LGPD. */
  const { data: clientes = [] } = useClients();
  const { data: pagamentos = [] } = usePayments();
  const dinheiro = useMemo(() => mrrDaCarteira(clientes, pagamentos), [clientes, pagamentos]);
  /* Quantos clientes estão com fatura vencida — o número no botão de
     Pagamentos, como o de chamados abertos no Suporte. */
  const devendo = useMemo(
    () => inadimplentes(pagamentos, clientes, [], new Date().toISOString().slice(0, 10)).length,
    [clientes, pagamentos],
  );

  /* Implantação sem ler o sistema dos clientes: a Home fica com o que o
     painel sabe sozinho (contrato, cobrança, sistema criado). O retrato
     completo — acesso, estoque, canal, anúncio — é na própria seção. */
  const implantacao = useImplantacao({ lerSistemas: false });
  const agora = implantacao.implantando.find((i) => i.passo && !naoSei(i.passo.porque));

  return (
    <div className="min-h-screen flex flex-col bg-background">

      <NavDaHome sistema={transportadora
        ? { url: TRANSPORTES_APP_URL, titulo: 'Sistema das transportadoras' }
        : { url: LOJISTA_APP_URL, titulo: 'Sistema Lojista' }} />

      {/* ── Página ───────────────────────────────────────────── */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-8 py-6 sm:py-10 flex flex-col gap-6 sm:gap-10">

        <SeletorDeFrente frente={frente} onTrocar={trocar} />

        {/* Saudação */}
        <Saudacao
          numero={brl(dinheiro.mrr)}
          rotulo="MRR"
          nota={dinheiro.aguardando > 0 ? `+${brl(dinheiro.aguardando)} assinado, aguardando a 1ª fatura` : null}
        />

        {/* ── Hero: Via CRM ──────────────────────────────────── */}
        <div>
          <button
            onClick={() => navigate('/crm')}
            className={cn(
              'group w-full rounded-2xl overflow-hidden border transition-all duration-200 text-left',
              'border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03]',
              'hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:border-black/[0.13] dark:hover:border-white/[0.14]',
              'hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30',
            )}
          >
            <div className="px-6 pt-6 pb-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[18px] sm:text-[20px] font-bold text-foreground tracking-tight leading-tight">Via CRM</p>
                <p className="text-[12px] text-foreground/45 mt-0.5 font-light">
                  WhatsApp, funil e agenda — do primeiro contato à venda
                </p>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <p className="text-[10px] text-foreground/35">Pipeline</p>
                <p className="text-[17px] font-bold text-primary tabular-nums leading-tight">
                  {brl(counts.pipeline)}<span className="text-[10px] font-normal text-foreground/35 ml-0.5">/mês</span>
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>

            {/* Resumo por etapa do CRM */}
            <div className="grid grid-cols-3 border-t border-black/[0.06] dark:border-white/[0.06] divide-x divide-black/[0.06] dark:divide-white/[0.06]">
              {[
                { label: 'Prospects', value: counts.funil },
                { label: 'Reuniões', value: counts.reunioes },
                { label: 'Amostras', value: counts.amostras },
              ].map(({ label, value }) => (
                <div key={label} className="px-3 py-2.5 text-center">
                  <p className="text-[17px] font-bold text-foreground tabular-nums leading-none">{value}</p>
                  <p className="text-[10px] text-foreground/35 mt-1 leading-none">{label}</p>
                </div>
              ))}
            </div>
          </button>

        </div>

        {/* ── Implantação e Teste grátis, lado a lado, logo abaixo do CRM ── */}
        <div className="grid gap-3 lg:grid-cols-2 -mt-3 sm:-mt-7">
          {/* Implantação: a venda até o primeiro anúncio no ar */}
          <button
            onClick={() => navigate('/implantacao')}
            className={cn(
              'group w-full rounded-2xl overflow-hidden border transition-all duration-200 text-left flex flex-col',
              'border-primary/25 bg-primary/[0.05] hover:bg-primary/[0.09] hover:border-primary/40',
              'hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30',
            )}
          >
            <div className="px-6 pt-5 pb-4 flex items-center gap-4 flex-1">
              <span className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Rocket className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[18px] sm:text-[20px] font-bold text-foreground tracking-tight leading-tight">Implantação</p>
                <p className="text-[12px] text-foreground/45 mt-0.5 font-light">
                  {transportadora ? 'Da venda fechada à primeira viagem no sistema' : 'Da venda fechada ao primeiro anúncio no ar'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
            <div className="grid grid-cols-3 border-t border-primary/15 divide-x divide-primary/15">
              {[
                { label: 'Implantando', value: implantacao.vendas.length, alerta: false },
                { label: 'No ar < 30 dias', value: implantacao.noArRecentes.length, alerta: false },
                { label: 'Passou de 2 sem.', value: implantacao.atrasadosVendas, alerta: true },
              ].map(({ label, value, alerta }) => (
                <div key={label} className="px-3 py-2.5 text-center">
                  <p className={cn('text-[17px] font-bold tabular-nums leading-none', alerta && value > 0 ? 'text-red-500' : 'text-foreground')}>{value}</p>
                  <p className="text-[10px] text-foreground/35 mt-1 leading-none">{label}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-2.5 border-t border-primary/15 flex items-center gap-2 text-[12px] min-h-[41px]">
              {agora?.passo ? (
                <>
                  <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-foreground/45 shrink-0">Agora:</span>
                  <span className="font-semibold text-foreground truncate">{agora.cliente.company_name}</span>
                  <span className="text-foreground/55 truncate">— {agora.passo.acao.charAt(0).toLowerCase() + agora.passo.acao.slice(1)}</span>
                </>
              ) : (
                <span className="text-foreground/35">Nada esperando agora</span>
              )}
            </div>
          </button>

          {/* Teste grátis: contado da implantação */}
          <button
            onClick={() => navigate('/testes')}
            className={cn(
              'group w-full rounded-2xl overflow-hidden border transition-all duration-200 text-left flex flex-col',
              'border-emerald-500/25 bg-emerald-500/[0.05] hover:bg-emerald-500/[0.09] hover:border-emerald-500/40',
              'hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30',
            )}
          >
            <div className="px-6 pt-5 pb-4 flex items-center gap-4 flex-1">
              <span className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Hourglass className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[18px] sm:text-[20px] font-bold text-foreground tracking-tight leading-tight">Teste grátis</p>
                <p className="text-[12px] text-foreground/45 mt-0.5 font-light">{DIAS_DE_TESTE} dias contados da implantação — e a conversa para assinar</p>
              </div>
              <ChevronRight className="h-5 w-5 text-foreground/20 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
            <div className="grid grid-cols-3 border-t border-emerald-500/15 divide-x divide-emerald-500/15">
              {[
                { label: 'Preparando', value: implantacao.testes.length, alerta: false },
                { label: 'Testando', value: testando.length, alerta: false },
                { label: 'Terminam em 5 dias', value: retaFinal, alerta: true },
              ].map(({ label, value, alerta }) => (
                <div key={label} className="px-3 py-2.5 text-center">
                  <p className={cn('text-[17px] font-bold tabular-nums leading-none', alerta && value > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>{value}</p>
                  <p className="text-[10px] text-foreground/35 mt-1 leading-none">{label}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-2.5 border-t border-emerald-500/15 flex items-center gap-2 text-[12px] min-h-[41px]">
              {ligacoesDeHoje[0] ? (
                <>
                  <ArrowRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-foreground/45 shrink-0">Hoje:</span>
                  <span className="font-semibold text-foreground truncate">{ligacoesDeHoje[0].client?.company_name ?? '—'}</span>
                  <span className="text-foreground/55 truncate">— {ligacoesDeHoje[0].titulo.replace('Teste grátis · ', '')}</span>
                  {ligacoesDeHoje.length > 1 && <span className="text-foreground/35 shrink-0">+{ligacoesDeHoje.length - 1}</span>}
                </>
              ) : (
                <span className="text-foreground/35">Nenhuma ligação para hoje</span>
              )}
            </div>
          </button>
        </div>

        {/* ── Módulos ────────────────────────────────────────── */}
        <div>
          <TituloDeSecao>Módulos</TituloDeSecao>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <ModuleTile label="Clientes"      description="Carteira e contas"              icon={<Users />}         onClick={() => navigate('/clientes')} />
            <ModuleTile label="Pagamentos"    description="Cobranças e inadimplência"      icon={<CreditCard />}    onClick={() => navigate('/pagamentos')} badge={devendo} />
            <ModuleTile label="Financeiro"    description="Entradas, saídas e vencimentos" icon={<DollarSign />}    onClick={() => navigate('/financeiro')} />
            <ModuleTile label="Planos"        description="Planos e preços"                icon={<Layers />}        onClick={() => navigate('/planos')} />
            <ModuleTile label="Suporte"       description="Chamados dos clientes"          icon={<MessageSquare />} onClick={() => navigate('/tickets')} badge={openTickets} />
            <ModuleTile label="Relatórios"    description="Recorrência, funil e caixa"     icon={<BarChart3 />}     onClick={() => navigate('/relatorios')} />
            <ModuleTile label="Metas"         description="Norte, OKR e horizonte"         icon={<Target />}        onClick={() => navigate('/metas')} />
            <ModuleTile label="Conselho"      description="A diretoria e as decisões"      icon={<Landmark />}      onClick={() => navigate('/conselho')} />
            <ModuleTile label="Equipe"        description="Membros e acessos"              icon={<UserCheck />}     onClick={() => navigate('/equipe')} />
            {/* A saúde mede a plataforma do lojista (site, canais, cobrança);
                a das transportadoras ainda não tem o que medir. */}
            {!transportadora && (
              <ModuleTile label="Saúde"         description="Se a plataforma está no ar"     icon={<HeartPulse />}    onClick={() => navigate('/saude')} />
            )}
          </div>
        </div>
      </main>

      <RodapeDaHome />
    </div>
  );
}
