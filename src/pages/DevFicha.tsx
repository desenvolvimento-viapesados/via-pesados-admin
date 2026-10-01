import { PainelDeUso } from '@/components/admin/UsoDoSistema';
import { TotaisDaCarteira, ListaDaCarteira } from '@/components/admin/Carteira';
import { montarCarteira, totaisDaCarteira, ordemDeAtencao } from '@/lib/carteira';
import type { Client, SaudeDaEmpresa } from '@/hooks/useAdmin';
import { etapasDoCliente, situacaoDoCliente, progresso, ROTULO_SITUACAO } from '@/lib/estadoDoCliente';
import { SectionHeader, Panel } from '@/components/admin/ui';
import { cn } from '@/lib/utils';
import type { ClientUsage, AccessLogEntry } from '@/hooks/useAdmin';

const atras = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

/* Quatro clientes inventados que cobrem os casos que importam: a conta
   saudável, a que sumiu, a que paga e não tem anúncio no ar, e a que
   ainda não tem sistema. */
const CLIENTES = [
  { id: '1', company_name: 'Revenda Exemplo', status: 'ativo', mrr: 890, lojista_company_id: 'e1', contact_name: 'Carlos Menezes', city: 'Governador Valadares', state: 'MG' },
  { id: '2', company_name: 'Pátio Norte Caminhões', status: 'ativo', mrr: 1290, lojista_company_id: 'e2', contact_name: 'Sandra Lopes', city: 'Belém', state: 'PA' },
  { id: '3', company_name: 'TransSul Seminovos', status: 'inadimplente', mrr: 690, lojista_company_id: 'e3', contact_name: 'Élio Kraemer', city: 'Caxias do Sul', state: 'RS' },
  { id: '4', company_name: 'Rodobens Filial Oeste', status: 'onboarding', mrr: 1490, lojista_company_id: null, contact_name: 'Marina Pires', city: 'Cuiabá', state: 'MT' },
] as unknown as Client[];

/* Duas contas pagando e uma esperando a primeira fatura: é o que faz o
   subtítulo do MRR mostrar as duas metades. */
const PAGAMENTOS = [
  { client_id: '1', status: 'pago' as const }, { client_id: '3', status: 'pago' as const },
  { client_id: '2', status: 'pendente' as const },
];

const SAUDE: SaudeDaEmpresa[] = [
  { company_id: 'e1', nome: 'Revenda Exemplo', slug: 'revenda', veiculos: 28, veiculos_parados_60d: 5,
    valor_estoque: 9_480_000, veiculos_anunciados: 24, canais_ligados: 1, canais_caidos: 1, usuarios: 5,
    usuarios_que_nunca_entraram: 1, ultimo_acesso_em: atras(0), vendas_30d: 4, faturamento_30d: 2_000_000,
    ultima_venda_em: atras(3).slice(0, 10), ultimo_veiculo_em: atras(2), pedidos_abertos: 6 },
  { company_id: 'e2', nome: 'Pátio Norte', slug: 'patio-norte', veiculos: 41, veiculos_parados_60d: 12,
    valor_estoque: 13_900_000, veiculos_anunciados: 0, canais_ligados: 0, canais_caidos: 0, usuarios: 7,
    usuarios_que_nunca_entraram: 4, ultimo_acesso_em: atras(12), vendas_30d: 0, faturamento_30d: 0,
    ultima_venda_em: atras(80).slice(0, 10), ultimo_veiculo_em: atras(70), pedidos_abertos: 0 },
  { company_id: 'e3', nome: 'TransSul', slug: 'transsul', veiculos: 9, veiculos_parados_60d: 1,
    valor_estoque: 2_100_000, veiculos_anunciados: 7, canais_ligados: 2, canais_caidos: 0, usuarios: 3,
    usuarios_que_nunca_entraram: 0, ultimo_acesso_em: atras(48), vendas_30d: 1, faturamento_30d: 310_000,
    ultima_venda_em: atras(20).slice(0, 10), ultimo_veiculo_em: atras(40), pedidos_abertos: 2 },
];

/**
 * A bancada da ficha do cliente. Só existe em desenvolvimento.
 *
 * A ficha mora atrás do login do painel, e eu não entro no painel de quem
 * me pediu o trabalho. No sistema do lojista isso já custou duas entregas
 * com erro que o usuário viu antes de mim — a bancada é a lição.
 *
 * Os dados são inventados de propósito: dado real de cliente não entra em
 * arquivo versionado. O que interessa aqui é a FORMA.
 */


const EXEMPLO: ClientUsage = {
  company_id: '00000000-0000-0000-0000-000000000000',
  gerado_em: new Date().toISOString(),
  estoque: { total: 34, disponiveis: 28, vendidos: 6, valor_tabela: 9_480_000, parados_60d: 5 },
  por_tipo: [
    { tipo: 'Cavalo 6x4', total: 12 }, { tipo: 'Truck 6x2', total: 8 },
    { tipo: 'Carreta 3 eixos', total: 7 }, { tipo: 'Toco 4x2', total: 5 }, { tipo: 'Não informado', total: 2 },
  ],
  por_marca: [
    { marca: 'Volvo', total: 11 }, { marca: 'Scania', total: 9 },
    { marca: 'Mercedes-Benz', total: 7 }, { marca: 'DAF', total: 4 }, { marca: 'Noma', total: 3 },
  ],
  por_carroceria: [
    { carroceria: 'Chassi', total: 18 }, { carroceria: 'Graneleira', total: 9 }, { carroceria: 'Baú Sider', total: 7 },
  ],
  site: { publicados: 26, total: 34 },
  vendas: { total: 19, faturamento: 8_640_000, lucro: 1_230_000, ticket_medio: 454_736, ultima_venda: atras(3).slice(0, 10) },
  vendas_por_mes: [
    { mes: '2026-04', total: 2, faturamento: 780_000, lucro: 96_000 },
    { mes: '2026-05', total: 3, faturamento: 1_310_000, lucro: 188_000 },
    { mes: '2026-06', total: 1, faturamento: 420_000, lucro: 41_000 },
    { mes: '2026-07', total: 4, faturamento: 1_880_000, lucro: 260_000 },
    { mes: '2026-08', total: 5, faturamento: 2_250_000, lucro: 345_000 },
    { mes: '2026-09', total: 4, faturamento: 2_000_000, lucro: 300_000 },
  ],
  vendas_por_tipo: [
    { tipo: 'Cavalo 6x4', total: 9, faturamento: 4_860_000 },
    { tipo: 'Truck 6x2', total: 6, faturamento: 2_340_000 },
    { tipo: 'Carreta 3 eixos', total: 4, faturamento: 1_440_000 },
  ],
  uso: { usuarios: 5, contatos: 214, leads: 63, conversas: 148, instancias_wa: 2, pedidos: 17, pedidos_abertos: 6 },
  atividade: { ultimo_produto_em: atras(2), ultima_venda_em: atras(3), ultima_conversa_em: atras(1) },
  acessos: [
    { nome: 'Carlos Menezes', email: 'carlos@exemplo.com.br', funcao: 'Administrador', administrador: true, ultimo_acesso: atras(0), criado_em: atras(210), nunca_entrou: false },
    { nome: 'Patrícia Alves', email: 'patricia@exemplo.com.br', funcao: 'Vendedor', administrador: false, ultimo_acesso: atras(1), criado_em: atras(180), nunca_entrou: false },
    { nome: 'Rodrigo Tavares', email: 'rodrigo@exemplo.com.br', funcao: 'Vendedor', administrador: false, ultimo_acesso: atras(23), criado_em: atras(150), nunca_entrou: false },
    { nome: 'Juliana Dias', email: 'juliana@exemplo.com.br', funcao: 'Financeiro', administrador: false, ultimo_acesso: atras(64), criado_em: atras(120), nunca_entrou: false },
    { nome: 'Marcos Vinícius', email: 'marcos@exemplo.com.br', funcao: 'Vendedor', administrador: false, ultimo_acesso: null, criado_em: atras(45), nunca_entrou: true },
  ],
  veiculos: [
    { id: '1', marca: 'Volvo', modelo: 'FH 540', ano: '2022/2023', tipo: 'Cavalo 6x4', preco: 620_000, situacao: 'disponivel', interno: 'ativo', criado_em: atras(2), mexido_em: atras(2), no_site: true, canais: ['mercadolivre', 'instagram', 'facebook', 'meta_catalogo'] },
    { id: '2', marca: 'Scania', modelo: 'R 450', ano: '2021/2021', tipo: 'Cavalo 6x2', preco: 540_000, situacao: 'disponivel', interno: 'ativo', criado_em: atras(9), mexido_em: atras(4), no_site: true, canais: ['mercadolivre'] },
    { id: '3', marca: 'Mercedes-Benz', modelo: 'Actros 2651', ano: '2020/2020', tipo: 'Cavalo 6x4', preco: 495_000, situacao: 'vendido', interno: 'vendido', criado_em: atras(70), mexido_em: atras(3), no_site: false, canais: [] },
    { id: '4', marca: 'Noma', modelo: '', ano: '2019/2019', tipo: 'Carreta 3 eixos', preco: 180_000, situacao: 'disponivel', interno: 'ativo', criado_em: atras(120), mexido_em: atras(96), no_site: true, canais: [] },
    { id: '5', marca: 'DAF', modelo: 'XF 530', ano: '2023/2023', tipo: 'Cavalo 6x4', preco: 710_000, situacao: 'disponivel', interno: 'preparando_oferta', criado_em: atras(5), mexido_em: atras(5), no_site: false, canais: [] },
  ],
  canais: {
    conexoes: [
      { canal: 'mercadolivre', ativo: true, conta: 'REVENDAEXEMPLO', expira: atras(-30) },
      { canal: 'facebook', ativo: false, conta: 'Carlos Menezes', expira: atras(-12) },
    ],
    anuncios: [
      { canal: 'mercadolivre', situacao: 'active', total: 22 },
      { canal: 'instagram', situacao: 'active', total: 14 },
      { canal: 'facebook', situacao: 'active', total: 14 },
      { canal: 'meta_catalogo', situacao: 'active', total: 26 },
      { canal: 'mercadolivre', situacao: 'sold', total: 6 },
    ],
  },
  pedidos_por_categoria: [{ categoria: 'caminhao', total: 11 }, { categoria: 'carreta', total: 6 }],
  marcos: {
    ja_acessou: true,
    nunca_entraram: 1,
    ultimo_acesso_em: atras(0),
    conta_criada_em: atras(210),
    primeiro_veiculo_em: atras(205),
    primeira_publicacao_em: atras(203),
    primeira_venda_em: atras(190),
    tem_canal_ligado: true,
    tem_anuncio_no_ar: true,
  },
};

const LOG: AccessLogEntry[] = [
  { id: 'a', client_id: null, client_name: 'Revenda Exemplo', member_email: 'voce@viapesados.com.br', purpose: 'ficha do cliente', scope: 'ficha', created_at: atras(0) },
  { id: 'b', client_id: null, client_name: 'Revenda Exemplo', member_email: 'suporte@viapesados.com.br', purpose: 'suporte', scope: 'ficha', created_at: atras(4) },
];

export default function DevFicha() {
  const etapas = etapasDoCliente(
    {
      lojista_company_id: 'abc', domain: 'revendaexemplo.com.br',
      contract_signed_at: null, pagou: true,
      tarefas: [{ task_key: 'treinamento_realizado', done: true }],
    },
    EXEMPLO,
  );
  const { feitas, total } = progresso(etapas);
  const situacao = situacaoDoCliente(etapas, EXEMPLO.marcos.ultimo_acesso_em);
  const r = ROTULO_SITUACAO[situacao];

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Bancada · ficha do cliente</h1>
          <p className="mt-1 text-sm text-foreground/50">
            Só em desenvolvimento, com dados inventados. São os mesmos componentes da ficha real.
          </p>
        </header>

        <div className="flex items-center gap-3 flex-wrap">
          <span className={cn(
            'inline-flex items-center gap-2 h-8 px-3 rounded-lg text-[12px] font-semibold border',
            r.tom === 'bom' && 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25',
            r.tom === 'atencao' && 'bg-amber-500/10 text-amber-500 border-amber-500/25',
            r.tom === 'ruim' && 'bg-red-500/10 text-red-400 border-red-500/25',
            r.tom === 'neutro' && 'bg-black/[0.04] dark:bg-white/[0.05] text-foreground/50 border-transparent',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full',
              r.tom === 'bom' ? 'bg-emerald-500' : r.tom === 'atencao' ? 'bg-amber-500'
                : r.tom === 'ruim' ? 'bg-red-400' : 'bg-foreground/30')} />
            {r.texto}
          </span>
        </div>

        <div>
          <SectionHeader title={`Conexão · ${feitas}/${total}`} />
          <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
            {etapas.map((e) => (
              <div key={e.chave} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cn('h-4 w-4 rounded-md border flex items-center justify-center shrink-0',
                  e.feito ? 'bg-emerald-500 border-emerald-500' : 'border-black/[0.15] dark:border-white/[0.2]')}>
                  {e.feito && <span className="text-white text-[9px] font-bold">✓</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[12.5px]', !e.feito && 'text-foreground/55')}>{e.titulo}</p>
                  <p className="text-[10.5px] text-foreground/35">{e.porque}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-foreground/25 shrink-0">
                  {e.origem === 'sistema' ? 'do sistema' : e.origem === 'painel' ? 'do painel' : 'à mão'}
                </span>
              </div>
            ))}
          </Panel>
        </div>

        <div className="pt-4">
          <h2 className="text-lg font-bold mb-3">A carteira</h2>
          <div className="space-y-4">
            <TotaisDaCarteira totais={totaisDaCarteira(montarCarteira(CLIENTES, SAUDE), PAGAMENTOS)} />
            <ListaDaCarteira
              linhas={[...montarCarteira(CLIENTES, SAUDE)].sort(ordemDeAtencao)}
              onAbrir={() => {}}
            />
          </div>
        </div>

        <div className="pt-4">
          <h2 className="text-lg font-bold mb-3">A ficha de um cliente</h2>
          <PainelDeUso uso={EXEMPLO} log={LOG} />
        </div>
      </div>
    </div>
  );
}
