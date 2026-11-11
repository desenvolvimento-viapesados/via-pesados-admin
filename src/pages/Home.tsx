import { useNavigate } from 'react-router-dom';
import {
  Users, DollarSign, CreditCard, BarChart3, ChevronRight,
  UserCheck, Target,
  Layers, HeartPulse,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCrmCounts, useClients, usePayments, brl } from '@/hooks/useAdmin';
import { mrrDaCarteira } from '@/lib/mrr';
import { inadimplentes } from '@/lib/inadimplencia';
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
  /* Quantos clientes estão com fatura vencida — o número no botão de Pagamentos. */
  const devendo = useMemo(
    () => inadimplentes(pagamentos, clientes, [], new Date().toISOString().slice(0, 10)).length,
    [clientes, pagamentos],
  );

  /* Implantação e Teste grátis saíram da Home (dono, 09/11): moram no CRM, em abas.
     Suporte e Conselho também saíram (dono, 11/11/2026: "por enquanto"): as telas
     /tickets e /conselho continuam no ar pelo endereço, só sem cartão aqui. */

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

        {/* ── Módulos ────────────────────────────────────────── */}
        <div>
          <TituloDeSecao>Módulos</TituloDeSecao>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <ModuleTile label="Clientes"      description="Carteira e contas"              icon={<Users />}         onClick={() => navigate('/clientes')} />
            <ModuleTile label="Pagamentos"    description="Cobranças e inadimplência"      icon={<CreditCard />}    onClick={() => navigate('/pagamentos')} badge={devendo} />
            <ModuleTile label="Financeiro"    description="Entradas, saídas e vencimentos" icon={<DollarSign />}    onClick={() => navigate('/financeiro')} />
            <ModuleTile label="Planos"        description="Planos e preços"                icon={<Layers />}        onClick={() => navigate('/planos')} />
            <ModuleTile label="Relatórios"    description="Recorrência, funil e caixa"     icon={<BarChart3 />}     onClick={() => navigate('/relatorios')} />
            <ModuleTile label="Metas"         description="Norte, OKR e horizonte"         icon={<Target />}        onClick={() => navigate('/metas')} />
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
