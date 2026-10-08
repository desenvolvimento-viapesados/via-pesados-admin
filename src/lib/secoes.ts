import type { LucideIcon } from 'lucide-react';
import {
  Briefcase, Users, Wallet, LifeBuoy, Server, Compass,
  MessageCircle, Kanban, CalendarDays, MonitorPlay, Rocket, FilePlus2,
  AlertTriangle, CreditCard, Landmark, Ticket, Radio, ExternalLink,
  Target, BarChart3, UserCheck,
} from 'lucide-react';

/* O mapa do painel: seis seções, cada uma com as suas subseções.
   A Home mostra as seções; clicar numa abre a tela dela (pages/Secao.tsx)
   com as subseções em cartões. Uma tela nova entra AQUI — numa seção —
   e passa a aparecer no lugar certo, com o "voltar" certo.

   `indicador` é a chave do número que o cartão mostra
   (hooks/useIndicadores.ts). Subseção sem indicador mostra só o texto. */

export type ChaveDaSecao = 'comercial' | 'clientes' | 'financeiro' | 'suporte' | 'operacao' | 'gestao';

export interface Subsecao {
  chave: string;
  titulo: string;
  descricao: string;
  rota: string;
  icone: LucideIcon;
  indicador?: string;
  /** Abre fora do painel (outra aba). */
  externa?: boolean;
}

export interface Secao {
  chave: ChaveDaSecao;
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  /** Rotas do painel que moram nesta seção (para o "voltar" e o título). */
  rotas: string[];
  subsecoes: Subsecao[];
}

export const SECOES: Secao[] = [
  {
    chave: 'comercial',
    titulo: 'Comercial',
    descricao: 'Do primeiro contato à venda',
    icone: Briefcase,
    rotas: ['/crm'],
    subsecoes: [
      { chave: 'whatsapp', titulo: 'WhatsApp da equipe', descricao: 'As conversas de cada número, num lugar só', rota: '/crm?tab=whatsapp', icone: MessageCircle, indicador: 'numeros' },
      { chave: 'funil', titulo: 'Funil', descricao: 'Cada prospect na sua etapa, com o valor somado', rota: '/crm?tab=funil', icone: Kanban, indicador: 'funil' },
      { chave: 'reunioes', titulo: 'Reuniões', descricao: 'A agenda de demonstrações', rota: '/crm?tab=reunioes', icone: CalendarDays, indicador: 'reunioes' },
      { chave: 'amostras', titulo: 'Amostras', descricao: 'As lojas de demonstração de cada prospect', rota: '/crm?tab=amostras', icone: MonitorPlay, indicador: 'amostras' },
      { chave: 'venda', titulo: 'Registrar venda', descricao: 'Fechou: cliente, cobrança e sistema de uma vez', rota: '/crm/venda', icone: FilePlus2 },
    ],
  },
  {
    chave: 'clientes',
    titulo: 'Clientes',
    descricao: 'A carteira, a implantação e quem precisa de atenção',
    icone: Users,
    rotas: ['/clientes'],
    subsecoes: [
      { chave: 'carteira', titulo: 'Carteira', descricao: 'Todos os clientes, com o uso e a fatura de cada um', rota: '/clientes', icone: Users, indicador: 'clientes' },
      { chave: 'atencao', titulo: 'Precisa de atenção', descricao: 'Quem está parado, inadimplente ou com canal caído', rota: '/clientes?f=atencao', icone: AlertTriangle },
      { chave: 'implantacao', titulo: 'Implantação', descricao: 'Vendidos que ainda estão sendo colocados no ar', rota: '/crm?tab=conexao', icone: Rocket, indicador: 'implantacao' },
    ],
  },
  {
    chave: 'financeiro',
    titulo: 'Financeiro',
    descricao: 'O que entra, o que sai e o que está atrasado',
    icone: Wallet,
    rotas: ['/pagamentos', '/financeiro', '/inadimplencia'],
    subsecoes: [
      { chave: 'inadimplencia', titulo: 'Inadimplência', descricao: 'Quem está devendo, há quanto tempo e o que já foi avisado', rota: '/inadimplencia', icone: AlertTriangle, indicador: 'atraso' },
      { chave: 'recebimentos', titulo: 'Recebimentos', descricao: 'As mensalidades dos clientes: pago, a receber e atrasado', rota: '/pagamentos', icone: CreditCard, indicador: 'receber' },
      { chave: 'caixa', titulo: 'Caixa da Via Pesados', descricao: 'Entradas, saídas e vencimentos da empresa', rota: '/financeiro', icone: Landmark, indicador: 'caixa' },
    ],
  },
  {
    chave: 'suporte',
    titulo: 'Suporte',
    descricao: 'Os chamados e as conversas com os clientes',
    icone: LifeBuoy,
    rotas: ['/tickets'],
    subsecoes: [
      { chave: 'chamados', titulo: 'Chamados', descricao: 'O que os clientes pediram e em que pé está', rota: '/tickets', icone: Ticket, indicador: 'chamados' },
      { chave: 'conversas', titulo: 'Conversas no WhatsApp', descricao: 'Atender quem escreveu para a equipe', rota: '/crm?tab=whatsapp', icone: MessageCircle },
    ],
  },
  {
    chave: 'operacao',
    titulo: 'Operação',
    descricao: 'O que mantém a plataforma no ar',
    icone: Server,
    rotas: ['/whatsapp'],
    subsecoes: [
      { chave: 'canal-oficial', titulo: 'Canal oficial do WhatsApp', descricao: 'O número dos avisos automáticos e os modelos aprovados', rota: '/whatsapp', icone: Radio },
      { chave: 'sistema-lojista', titulo: 'Sistema lojista', descricao: 'Abrir o sistema que os clientes usam', rota: '', icone: ExternalLink, externa: true },
    ],
  },
  {
    chave: 'gestao',
    titulo: 'Gestão',
    descricao: 'Metas, números da empresa e a equipe',
    icone: Compass,
    rotas: ['/metas', '/relatorios', '/equipe'],
    subsecoes: [
      { chave: 'metas', titulo: 'Metas', descricao: 'A métrica-norte e os objetivos de cada ciclo', rota: '/metas', icone: Target },
      { chave: 'relatorios', titulo: 'Relatórios', descricao: 'Recorrência, aquisição, canais, caixa e perdas', rota: '/relatorios', icone: BarChart3 },
      { chave: 'equipe', titulo: 'Equipe', descricao: 'Quem tem acesso ao painel e com que papel', rota: '/equipe', icone: UserCheck, indicador: 'equipe' },
    ],
  },
];

export const secaoPorChave = (chave: string | undefined): Secao | null =>
  SECOES.find((s) => s.chave === chave) ?? null;

const casa = (pathname: string, rota: string) => pathname === rota || pathname.startsWith(rota + '/');

/** A seção onde a tela mora (pela rota), ou null. */
export function secaoDaRota(pathname: string): Secao | null {
  const m = pathname.match(/^\/secao\/([^/]+)/);
  if (m) return secaoPorChave(m[1]);
  return SECOES.find((s) => s.rotas.some((r) => casa(pathname, r))) ?? null;
}

/** Para onde o "voltar" de cada tela leva: a ficha volta à lista, a lista
 *  volta à seção, a seção volta ao início. */
export function voltarDe(pathname: string): { para: string; rotulo: string } {
  if (pathname.startsWith('/secao/')) return { para: '/', rotulo: 'Início' };
  const ficha = pathname.match(/^\/clientes\/([^/]+)\/(cobranca|onboarding)/);
  if (ficha) return { para: `/clientes/${ficha[1]}`, rotulo: 'Cliente' };
  if (/^\/clientes\/[^/]+$/.test(pathname)) return { para: '/clientes', rotulo: 'Clientes' };
  if (/^\/crm\/(prospect|venda)/.test(pathname)) return { para: '/crm?tab=funil', rotulo: 'Funil' };
  const secao = secaoDaRota(pathname);
  return secao ? { para: `/secao/${secao.chave}`, rotulo: secao.titulo } : { para: '/', rotulo: 'Início' };
}
