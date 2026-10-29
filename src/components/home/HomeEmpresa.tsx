import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, DollarSign, HeartPulse, Landmark, Target, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClients, useFinTransactions, usePayments, brl } from '@/hooks/useAdmin';
import { caixaPorFrente, resumoDaFrente, type CaixaDoMes, type ResumoDaFrente } from '@/lib/empresa';
import { useFrente } from '@/contexts/FrenteContext';
import { SeletorDeFrente } from '@/components/SeletorDeFrente';
import { ModuleTile, NavDaHome, Saudacao, RodapeDaHome, TituloDeSecao } from './partes';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * A Via Pesados inteira — a única tela em que as duas frentes aparecem
 * juntas (decisão do dono, 29/10/2026). Cada frente continua sendo aberta
 * pela própria Home; aqui se vê o todo e se lança o que é da empresa.
 */
export function HomeEmpresa() {
  const navigate = useNavigate();
  const { frente, trocar } = useFrente();
  const { data: clientes = [] } = useClients();
  const { data: pagamentos = [] } = usePayments();
  const { data: transacoes = [] } = useFinTransactions();

  const hoje = new Date().toISOString().slice(0, 10);
  const mes = hoje.slice(0, 7);
  const lojistas = useMemo(() => resumoDaFrente('lojista', clientes, pagamentos, hoje), [clientes, pagamentos, hoje]);
  const transportadoras = useMemo(() => resumoDaFrente('transportadora', clientes, pagamentos, hoje), [clientes, pagamentos, hoje]);
  const caixa = useMemo(() => caixaPorFrente(transacoes, mes), [transacoes, mes]);
  const total: CaixaDoMes = {
    entrou: caixa.lojista.entrou + caixa.transportadora.entrou + caixa.empresa.entrou,
    saiu: caixa.lojista.saiu + caixa.transportadora.saiu + caixa.empresa.saiu,
    saldo: caixa.lojista.saldo + caixa.transportadora.saldo + caixa.empresa.saldo,
  };
  const aguardando = lojistas.aguardando + transportadoras.aguardando;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavDaHome />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-8 py-6 sm:py-10 flex flex-col gap-6 sm:gap-10">
        <SeletorDeFrente frente={frente} onTrocar={trocar} />

        <Saudacao
          numero={brl(lojistas.mrr + transportadoras.mrr)}
          rotulo="MRR"
          nota={aguardando > 0 ? `+${brl(aguardando)} assinado, aguardando a 1ª fatura` : null}
        />

        {/* As duas frentes, lado a lado. Clicar abre a frente. */}
        <div className="grid gap-3 lg:grid-cols-2">
          <CartaoDaFrente titulo="Lojistas" resumo={lojistas} onAbrir={() => trocar('lojista')} />
          <CartaoDaFrente titulo="Transportadoras" resumo={transportadoras} onAbrir={() => trocar('transportadora')} />
        </div>

        {/* O caixa do mês: cada frente e os custos gerais, e o que sobra. */}
        <button
          onClick={() => navigate('/financeiro')}
          className={cn(
            'group w-full rounded-2xl overflow-hidden border transition-all duration-200 text-left',
            'border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03]',
            'hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:border-black/[0.13] dark:hover:border-white/[0.14]',
            'hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30',
          )}
        >
          <div className="px-6 pt-5 pb-4 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[18px] sm:text-[20px] font-bold text-foreground tracking-tight leading-tight">Caixa de {MESES[Number(mes.slice(5, 7)) - 1]}</p>
              <p className="text-[12px] text-foreground/45 mt-0.5 font-light">O que entrou e saiu de cada frente, e os custos da empresa</p>
            </div>
            <ChevronRight className="h-5 w-5 text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>
          <div className="border-t border-black/[0.06] dark:border-white/[0.06] px-6 py-3 overflow-x-auto">
            <table className="w-full text-[12.5px] tabular-nums">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-foreground/35">
                  <th className="text-left font-medium py-1.5" />
                  <th className="text-right font-medium py-1.5">Entrou</th>
                  <th className="text-right font-medium py-1.5">Saiu</th>
                  <th className="text-right font-medium py-1.5">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ['Lojistas', caixa.lojista],
                  ['Transportadoras', caixa.transportadora],
                  ['Custos gerais', caixa.empresa],
                ] as const).map(([rotulo, l]) => (
                  <tr key={rotulo} className="border-t border-black/[0.04] dark:border-white/[0.04]">
                    <td className="py-2 text-foreground/60 pr-3">{rotulo}</td>
                    <td className="py-2 text-right text-foreground/80">{brl(l.entrou)}</td>
                    <td className="py-2 text-right text-foreground/55">{brl(l.saiu)}</td>
                    <td className="py-2 text-right text-foreground/80">{brl(l.saldo)}</td>
                  </tr>
                ))}
                <tr className="border-t border-black/[0.08] dark:border-white/[0.08]">
                  <td className="py-2 font-semibold text-foreground pr-3">Via Pesados</td>
                  <td className="py-2 text-right font-semibold text-foreground">{brl(total.entrou)}</td>
                  <td className="py-2 text-right font-semibold text-foreground/70">{brl(total.saiu)}</td>
                  <td className={cn('py-2 text-right font-bold', total.saldo < 0 ? 'text-red-500' : 'text-foreground')}>{brl(total.saldo)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </button>

        <div>
          <TituloDeSecao>Da empresa</TituloDeSecao>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <ModuleTile label="Financeiro" description="As duas frentes e os custos gerais" icon={<DollarSign />} onClick={() => navigate('/financeiro')} />
            <ModuleTile label="Metas"      description="As metas da Via Pesados"            icon={<Target />}     onClick={() => navigate('/metas')} />
            <ModuleTile label="Conselho"   description="A diretoria e as decisões"          icon={<Landmark />}   onClick={() => navigate('/conselho')} />
            <ModuleTile label="Equipe"     description="Membros e acessos"                  icon={<UserCheck />}  onClick={() => navigate('/equipe')} />
            <ModuleTile label="Saúde"      description="Se a plataforma está no ar"         icon={<HeartPulse />} onClick={() => navigate('/saude')} />
          </div>
        </div>
      </main>

      <RodapeDaHome />
    </div>
  );
}

/* O cartão de uma frente — o desenho do cartão do Via CRM, com os três
   números embaixo. */
function CartaoDaFrente({ titulo, resumo, onAbrir }: { titulo: string; resumo: ResumoDaFrente; onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      className={cn(
        'group w-full rounded-2xl overflow-hidden border transition-all duration-200 text-left',
        'border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03]',
        'hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:border-black/[0.13] dark:hover:border-white/[0.14]',
        'hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30',
      )}
    >
      <div className="px-6 pt-6 pb-5 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[18px] sm:text-[20px] font-bold text-foreground tracking-tight leading-tight">{titulo}</p>
          <p className="text-[12px] text-foreground/45 mt-0.5 font-light">
            {resumo.pagando} {resumo.pagando === 1 ? 'cliente pagando' : 'clientes pagando'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-foreground/35">MRR</p>
          <p className="text-[17px] font-bold text-primary tabular-nums leading-tight">{brl(resumo.mrr)}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>
      <div className="grid grid-cols-3 border-t border-black/[0.06] dark:border-white/[0.06] divide-x divide-black/[0.06] dark:divide-white/[0.06]">
        {[
          { label: 'Pagando', value: resumo.pagando, alerta: false },
          { label: 'Implantando', value: resumo.implantando, alerta: false },
          { label: 'Devendo', value: resumo.devendo, alerta: true },
        ].map(({ label, value, alerta }) => (
          <div key={label} className="px-3 py-2.5 text-center">
            <p className={cn('text-[17px] font-bold tabular-nums leading-none', alerta && value > 0 ? 'text-red-500' : 'text-foreground')}>{value}</p>
            <p className="text-[10px] text-foreground/35 mt-1 leading-none">{label}</p>
          </div>
        ))}
      </div>
    </button>
  );
}
