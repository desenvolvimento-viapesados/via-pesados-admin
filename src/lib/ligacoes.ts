/**
 * Ligações frias do dono (18/11/2026): os rótulos das respostas e as contas
 * do placar. Puro, para testar sem banco.
 */

export type ResultadoLigacao =
  | 'nao_atendeu' | 'numero_errado' | 'reuniao' | 'retornar' | 'mandar_video' | 'sem_interesse';
export type QuemAtendeu = 'dono' | 'socio' | 'gerente' | 'vendedor' | 'outro';
export type Dor = 'anunciar' | 'atendimento' | 'clientes' | 'relatorios' | 'outra';

export const ROTULO_DO_RESULTADO: Record<ResultadoLigacao, string> = {
  nao_atendeu: 'Não atendeu',
  numero_errado: 'Número errado',
  reuniao: 'Reunião marcada',
  retornar: 'Ligar outro dia',
  mandar_video: 'Mandar o vídeo',
  sem_interesse: 'Sem interesse',
};

export const QUEM_ATENDEU: { chave: QuemAtendeu; rotulo: string }[] = [
  { chave: 'dono', rotulo: 'Dono' },
  { chave: 'socio', rotulo: 'Sócio' },
  { chave: 'gerente', rotulo: 'Gerente' },
  { chave: 'vendedor', rotulo: 'Vendedor' },
  { chave: 'outro', rotulo: 'Outro' },
];

/** As dores são as promessas do sistema: cada uma aponta o ato que abre a demonstração. */
export const DORES: { chave: Dor; rotulo: string; ato: string }[] = [
  { chave: 'anunciar', rotulo: 'Anunciar em cada lugar', ato: 'Abrir pelo Ato 1: publicar o caminhão dele em todos os canais.' },
  { chave: 'atendimento', rotulo: 'Responder cliente com foto e ficha', ato: 'Abrir pelo Ato 2: fluxo de fotos no WhatsApp.' },
  { chave: 'clientes', rotulo: 'Lembrar quem procurou o quê', ato: 'Abrir pelo Ato 2: base de contatos e possíveis negociações.' },
  { chave: 'relatorios', rotulo: 'Saber o que mais vende', ato: 'Abrir pelo Ato 3: relatório de veículos.' },
  { chave: 'outra', rotulo: 'Outra', ato: 'Abrir pelo Ato 1 e perguntar de novo no diagnóstico.' },
];
export const rotuloDaDor = (d?: string | null) => DORES.find((x) => x.chave === d)?.rotulo ?? null;

/** Atendeu = falou com alguém da loja, qualquer que tenha sido o fim. */
export const atendeu = (r: ResultadoLigacao) => r !== 'nao_atendeu' && r !== 'numero_errado';

export type LigacaoFeita = { resultado: ResultadoLigacao; quem_atendeu: QuemAtendeu | null; feita_em: string };

export type Placar = {
  ligacoes: number; atendidas: number; reunioes: number; retornos: number; videos: number; sem_interesse: number;
  /** % das ligações que alguém atendeu. */
  taxaAtendimento: number | null;
  /** % das atendidas que viraram reunião. */
  taxaReuniao: number | null;
  /** % das atendidas em que quem atendeu era dono ou sócio. */
  taxaDono: number | null;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function placar(lista: LigacaoFeita[]): Placar {
  const atendidas = lista.filter((l) => atendeu(l.resultado));
  const conta = (r: ResultadoLigacao) => lista.filter((l) => l.resultado === r).length;
  const reunioes = conta('reuniao');
  return {
    ligacoes: lista.length,
    atendidas: atendidas.length,
    reunioes,
    retornos: conta('retornar'),
    videos: conta('mandar_video'),
    sem_interesse: conta('sem_interesse'),
    taxaAtendimento: pct(atendidas.length, lista.length),
    taxaReuniao: pct(reunioes, atendidas.length),
    taxaDono: pct(atendidas.filter((l) => l.quem_atendeu === 'dono' || l.quem_atendeu === 'socio').length, atendidas.length),
  };
}

/** Início do dia em Brasília, para separar "hoje" do resto. */
export function inicioDoDia(agora = new Date()): Date {
  const brasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const diff = agora.getTime() - brasilia.getTime();
  brasilia.setHours(0, 0, 0, 0);
  return new Date(brasilia.getTime() + diff);
}

/** O que cada desfecho pede antes de salvar. null = pode salvar. */
export function faltaParaSalvar(x: {
  resultado: ResultadoLigacao | null; reuniaoEm?: string; retornarEm?: string;
}): string | null {
  if (!x.resultado) return 'Escolha como terminou a ligação.';
  if (x.resultado === 'reuniao' && !x.reuniaoEm) return 'Diga o dia e a hora da reunião.';
  if (x.resultado === 'retornar' && !x.retornarEm) return 'Diga quando ligar de novo.';
  return null;
}
