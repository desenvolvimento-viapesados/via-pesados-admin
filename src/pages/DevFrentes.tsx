import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AuthContext } from '@/contexts/AuthContext';
import { FrenteProvider, useFrente } from '@/contexts/FrenteContext';
import type { Frente } from '@/lib/frente';
import type { FichaTransportadora } from '@/hooks/useTransportadoras';
import type { Client } from '@/hooks/useAdmin';
import Home from '@/pages/Home';
import {
  CriarSistemaDialog, LinkGerado, PessoasDaTransportadora, SistemaDaTransportadora,
} from '@/components/admin/SistemaDaTransportadora';
import { SectionHeader } from '@/components/admin/ui';

/**
 * A bancada das frentes. Só existe em desenvolvimento, pelo mesmo motivo da
 * /dev/ficha: as telas moram atrás do login do painel, e eu não entro na
 * conta de quem me pediu o trabalho. Os dados são inventados — dado real de
 * cliente não entra em arquivo versionado.
 *
 * /admin/dev/frentes          a Home na frente escolhida no seletor
 * /admin/dev/frentes?ficha    a ficha da transportadora (Sistema e Pessoas)
 */

/* Nada é calculado no topo do arquivo: com uma chamada solta aqui, o
   empacotador mantém o módulo inteiro no pacote de produção mesmo com a rota
   desligada. Tudo nasce dentro de funções. */
const mesAtual = () => new Date().toISOString().slice(0, 7);
const atras = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

const cliente = (p: Partial<Client>) => ({
  id: crypto.randomUUID(), status: 'ativo', mrr: 990, frente: 'lojista', lojista_company_id: null,
  transportes_empresa_id: null, created_at: atras(40), contact_name: 'Fulano', ...p,
}) as Client;

const lojistas = () => [
  cliente({ id: 'l1', company_name: 'Revenda Exemplo', mrr: 890, lojista_company_id: 'e1' }),
  cliente({ id: 'l2', company_name: 'Pátio Norte Caminhões', mrr: 1290, lojista_company_id: 'e2' }),
  cliente({ id: 'l3', company_name: 'Rodobens Filial Oeste', mrr: 1490, status: 'onboarding' }),
];
const transportadoras = () => [
  cliente({ id: 't1', frente: 'transportadora', company_name: 'Transportes Serra Azul', mrr: 1890, transportes_empresa_id: 'x1' }),
  cliente({ id: 't2', frente: 'transportadora', company_name: 'Rodolog Cargas', mrr: 1290, status: 'onboarding', transportes_empresa_id: 'x2' }),
];

const pag = (client_id: string, frente: string, status = 'pago', due_date = `${mesAtual()}-05`) =>
  ({ id: crypto.randomUUID(), client_id, frente, status, amount: 1000, due_date, description: 'Mensalidade' });

const lanc = (frente: Frente, type: 'receita' | 'despesa', amount: number, description: string) => ({
  id: crypto.randomUUID(), frente, type, amount, description, status: 'pago',
  due_date: `${mesAtual()}-10`, payment_date: `${mesAtual()}-10`, competence_date: `${mesAtual()}-10`,
});

function semear(qc: QueryClient, frente: Frente) {
  const lojista = frente === 'lojista';
  const clientes = frente === 'empresa' ? [...lojistas(), ...transportadoras()] : lojista ? lojistas() : transportadoras();
  const pagamentos = [
    ...(frente !== 'transportadora' ? [pag('l1', 'lojista'), pag('l2', 'lojista'), pag('l2', 'lojista', 'pendente', atras(9).slice(0, 10))] : []),
    ...(frente !== 'lojista' ? [pag('t1', 'transportadora')] : []),
  ];
  qc.setQueryData(['clients'], clientes);
  qc.setQueryData(['payments', 'all'], pagamentos);
  qc.setQueryData(['tickets'], lojista ? [{ id: 'k1', status: 'aberto' }] : []);
  qc.setQueryData(['testes-gratis'], []);
  qc.setQueryData(['tarefas'], []);
  qc.setQueryData(['onboarding', 'todas'], []);
  qc.setQueryData(['prospects'], (lojista ? ['contato', 'amostra', 'reuniao', 'oportunidade'] : ['contato', 'amostra']).map((stage, i) => ({
    id: `p${i}`, stage, proposal_value: 990, company_name: `Prospect ${i}`,
  })));
  qc.setQueryData(['meetings'], []);
  qc.setQueryData(['demos'], lojista ? [{ id: 'd1', status: 'provisionada' }] : [{ id: 'd2', status: 'provisionada' }]);
  qc.setQueryData(['fin-transactions'], frente === 'empresa' ? [
    lanc('lojista', 'receita', 3180, 'Mensalidades'), lanc('lojista', 'despesa', 420, 'Anúncios'),
    lanc('transportadora', 'receita', 1890, 'Mensalidades'), lanc('transportadora', 'despesa', 180, 'Emissor fiscal'),
    lanc('empresa', 'despesa', 640, 'Servidores'), lanc('empresa', 'despesa', 350, 'Contador'),
  ] : []);
}

const ficha = (): FichaTransportadora => ({
  nome: 'Transportes Serra Azul', ativo: true, bloqueada_em: null, criada_em: atras(20),
  certificado_ok: false, certificado_validade: null,
  pessoas: [
    { nome: 'Marcos Andrade', email: 'marcos@serraazul.test', papel: 'dono', ultimo_acesso: atras(0), definiu_senha_em: atras(18) },
    { nome: 'Juliana Prado', email: 'juliana@serraazul.test', papel: 'financeiro', ultimo_acesso: null, definiu_senha_em: null },
  ],
  ultimo_acesso: atras(0), primeiro_acesso: atras(18), veiculos: 14, caminhoes: 8, motoristas: 7, clientes: 12,
  viagens: 46, viagens_30d: 19, primeira_viagem_em: atras(15), ultima_viagem_em: atras(1), frete_30d: 182_400, documentos_30d: 38,
});

const auth = () => ({
  user: null, session: null, isAdmin: true, loading: false,
  member: { id: 'm1', full_name: 'Kauã Xavier', email: 'equipe@viapesados.test', role: 'admin' as const, avatar_url: null, is_active: true },
  signIn: async () => ({ error: null }), signOut: async () => {},
});

/* Semeia o cache antes da Home montar — e de novo a cada troca de frente,
   que apaga o cache inteiro (é o que ela faz de verdade). */
function Semeada() {
  const qc = useQueryClient();
  const { frente } = useFrente();
  return <SemearEMostrar key={frente} qc={qc} frente={frente} />;
}
function SemearEMostrar({ qc, frente }: { qc: QueryClient; frente: Frente }) {
  useState(() => { semear(qc, frente); return true; });
  return <Home />;
}

function Ficha() {
  const [criando, setCriando] = useState(false);
  const [lista] = useState(transportadoras);
  const [FICHA] = useState(ficha);
  const transportadora = lista[0];
  return (
    <main className="min-h-screen bg-background px-5 py-6 max-w-6xl mx-auto w-full flex flex-col gap-8">
      <SistemaDaTransportadora client={transportadora} ficha={FICHA} carregando={false} onLink={() => setCriando(true)} />
      <PessoasDaTransportadora ficha={FICHA} />
      <div>
        <SectionHeader title="Link gerado" />
        <LinkGerado link={{ token: 'x', url: 'https://transportes.viapesados.com.br/entrar/3f9a0c1e7b2d4a6f8e1c0b9a7d6e5f4a3b2c1d0e9f8a7b6c' }} />
      </div>
      <SistemaDaTransportadora client={{ ...transportadora, transportes_empresa_id: null }} ficha={null} carregando={false} onLink={() => {}} />
      {criando && <CriarSistemaDialog client={lista[1]} onDone={() => {}} onClose={() => setCriando(false)} />}
    </main>
  );
}

export default function DevFrentes() {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }));
  const [valorAuth] = useState(auth);
  const verFicha = new URLSearchParams(window.location.search).has('ficha');
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={valorAuth}>
        <FrenteProvider>
          {verFicha ? <Ficha /> : <Semeada />}
        </FrenteProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
