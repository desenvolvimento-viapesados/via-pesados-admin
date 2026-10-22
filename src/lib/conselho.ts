/**
 * O Conselho da Via Pesados, do lado do painel.
 *
 * As reuniões acontecem no Claude do dono (sem custo de API) e gravam em
 * conselho_*; esta tela só mostra e recolhe o que é do dono: perguntas e
 * decisões. A lista da diretoria espelha a skill `conselho-via-pesados`
 * (o slug é o que a reunião grava em `conselho_falas.diretor`).
 */

export type Diretor = {
  slug: string;
  nome: string;
  cargo: string;
  /** Classe de cor do anel — uma por diretor, para reconhecer de longe. */
  cor: string;
  ativo: boolean;
};

export const CEO: Diretor = { slug: 'ceo', nome: 'Claude', cargo: 'CEO', cor: 'bg-primary', ativo: true };

export const DIRETORIA: Diretor[] = [
  { slug: 'helena', nome: 'Helena Duarte', cargo: 'Estratégia', cor: 'bg-violet-500', ativo: true },
  { slug: 'rafael', nome: 'Rafael Monteiro', cargo: 'Receita e Vendas', cor: 'bg-emerald-500', ativo: true },
  { slug: 'marta', nome: 'Marta Lins', cargo: 'Financeiro', cor: 'bg-amber-500', ativo: true },
  { slug: 'livia', nome: 'Lívia Andrade', cargo: 'Marketing e Marca', cor: 'bg-pink-500', ativo: true },
  { slug: 'bruno', nome: 'Bruno Takeda', cargo: 'Tráfego pago', cor: 'bg-sky-500', ativo: true },
  { slug: 'camila', nome: 'Camila Prado', cargo: 'Sucesso do cliente', cor: 'bg-teal-500', ativo: true },
  { slug: 'lucas', nome: 'Lucas Ferraz', cargo: 'Produto', cor: 'bg-indigo-500', ativo: true },
  { slug: 'yara', nome: 'Yara Nakamura', cargo: 'Dados', cor: 'bg-cyan-600', ativo: true },
];

export const SEGUNDA_LEVA = [
  'Tecnologia', 'Operações', 'Jurídico e Riscos', 'Parcerias',
  'Unidade Lojistas', 'Unidade Transportadoras', 'Marketplace e Match', 'Pessoas',
];

const TODOS = [CEO, ...DIRETORIA];

export function quem(slug: string | null | undefined): Diretor {
  return TODOS.find((d) => d.slug === slug) ?? {
    slug: slug ?? '?', nome: slug ?? 'Desconhecido', cargo: '', cor: 'bg-zinc-500', ativo: false,
  };
}

export const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export const ROTULO_RODADA: Record<string, string> = {
  abertura: 'Abertura do CEO',
  proposta: 'Propostas',
  replica: 'Réplicas',
  treplica: 'Tréplicas',
  decisao: 'Decisão do CEO',
  dono: 'O dono',
};

export const ORDEM_DAS_RODADAS = ['abertura', 'proposta', 'replica', 'treplica', 'decisao', 'dono'];

export const ROTULO_TIPO: Record<string, string> = {
  semanal: 'Reunião semanal',
  extraordinaria: 'Reunião extraordinária',
  pergunta: 'Pergunta do dono',
};

export const ROTULO_EXPERIMENTO: Record<string, string> = {
  rodando: 'Rodando',
  funcionou: 'Funcionou',
  nao_funcionou: 'Não funcionou',
  inconclusivo: 'Inconclusivo',
  parado: 'Parado',
};

/** Posição de cada diretor na órbita: ângulo em graus, começando no topo. */
export function posicaoNaOrbita(i: number, total: number, raio: number) {
  const angulo = (-90 + (360 / total) * i) * (Math.PI / 180);
  return { x: Math.cos(angulo) * raio, y: Math.sin(angulo) * raio };
}

export type Leitura = { data: string; valor: number; nota?: string };

/** O último número lido de um experimento, e se ele já bateu a meta. */
export function andamentoDoExperimento(e: {
  linha_base: number | null; meta: number | null; leituras: Leitura[] | null;
}): { atual: number | null; fracao: number | null } {
  const lidas = e.leituras ?? [];
  const atual = lidas.length ? lidas[lidas.length - 1].valor : null;
  if (atual == null || e.meta == null || e.linha_base == null || e.meta === e.linha_base) {
    return { atual, fracao: null };
  }
  return { atual, fracao: Math.max(0, Math.min(1, (atual - e.linha_base) / (e.meta - e.linha_base))) };
}
