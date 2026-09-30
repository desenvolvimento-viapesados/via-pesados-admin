import type { Client, Payment, ClientUsage } from '@/hooks/useAdmin';

/**
 * O que a ficha responde antes de qualquer clique.
 *
 * A ficha virou uma pilha de dezessete blocos do mesmo tamanho, e nenhum
 * respondia as três perguntas que fazem alguém abrir a página de um
 * cliente: ele está pagando, ele está usando, e o que eu tenho que fazer
 * hoje. Aqui moram as duas primeiras — a terceira sai delas.
 *
 * Nada disso se marca à mão. Inadimplente era um botão que alguém tinha
 * de lembrar de clicar, com o Asaas do lado sabendo a resposta desde o
 * dia do vencimento.
 */

const DIA = 86_400_000;
const hojeISO = (agora: number) => new Date(agora).toISOString().slice(0, 10);

export type EstadoFinanceiro = 'sem_cobranca' | 'aguardando_primeira' | 'em_dia' | 'atrasado';

export type Financeiro = {
  estado: EstadoFinanceiro;
  /** Dias desde o vencimento mais antigo em aberto. */
  diasAtraso: number;
  valorEmAberto: number;
  proximoVencimento: string | null;
  ultimoPagamentoEm: string | null;
  /** Uma linha, pronta para a tela. */
  texto: string;
};

/** Vencida e não paga — a definição que o Asaas já carimba. */
const emAberto = (p: Pick<Payment, 'status' | 'due_date'>, hoje: string) =>
  (p.status === 'atrasado' || p.status === 'pendente') && !!p.due_date && p.due_date < hoje;

export function situacaoFinanceira(
  pagamentos: Pick<Payment, 'status' | 'due_date' | 'amount' | 'paid_at'>[],
  agora = Date.now(),
): Financeiro {
  const hoje = hojeISO(agora);
  const vivos = pagamentos.filter((p) => p.status !== 'cancelado');
  const pagos = vivos.filter((p) => p.status === 'pago');
  const vencidas = vivos.filter((p) => emAberto(p, hoje));

  const ultimoPagamentoEm = pagos
    .map((p) => p.paid_at).filter(Boolean).sort().at(-1) ?? null;
  const proximoVencimento = vivos
    .filter((p) => p.status !== 'pago' && p.due_date >= hoje)
    .map((p) => p.due_date).sort().at(0) ?? null;

  if (vencidas.length) {
    const maisAntiga = vencidas.map((p) => p.due_date).sort()[0];
    const diasAtraso = Math.max(1, Math.round((agora - new Date(`${maisAntiga}T12:00:00`).getTime()) / DIA));
    const valorEmAberto = vencidas.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    return {
      estado: 'atrasado', diasAtraso, valorEmAberto, proximoVencimento, ultimoPagamentoEm,
      texto: vencidas.length === 1
        ? `Fatura vencida há ${diasAtraso} ${diasAtraso === 1 ? 'dia' : 'dias'}`
        : `${vencidas.length} faturas vencidas, a mais antiga há ${diasAtraso} dias`,
    };
  }
  if (!vivos.length) {
    return { estado: 'sem_cobranca', diasAtraso: 0, valorEmAberto: 0, proximoVencimento: null,
      ultimoPagamentoEm: null, texto: 'Cobrança ainda não criada' };
  }
  if (!pagos.length) {
    return { estado: 'aguardando_primeira', diasAtraso: 0, valorEmAberto: 0, proximoVencimento,
      ultimoPagamentoEm: null, texto: 'Esperando a primeira fatura ser paga' };
  }
  return {
    estado: 'em_dia', diasAtraso: 0, valorEmAberto: 0, proximoVencimento, ultimoPagamentoEm,
    texto: proximoVencimento
      ? `Em dia · próxima em ${proximoVencimento.split('-').reverse().slice(0, 2).join('/')}`
      : 'Em dia',
  };
}

export type Pendencia = {
  chave: string;
  texto: string;
  /** O que fazer, em uma frase — sem isso o aviso é só um aviso. */
  acao?: string;
  peso: 'grave' | 'atencao';
};

/**
 * O que precisa de alguém hoje, nesta conta.
 *
 * Só entra o que tem uma ação do outro lado. Aviso que aparece sempre é
 * aviso que ninguém lê — foi o que aconteceu com o alerta de canal fora
 * do ar no sistema do lojista.
 */
export function pendenciasDoCliente(
  cliente: Pick<Client, 'status'>,
  uso: ClientUsage | null,
  fin: Financeiro,
  agora = Date.now(),
): Pendencia[] {
  const p: Pendencia[] = [];
  if (cliente.status === 'cancelado') return p;

  if (fin.estado === 'atrasado') {
    p.push({ chave: 'atrasado', texto: fin.texto, acao: 'Cobrar', peso: 'grave' });
  }
  if (!uso) return p;

  const dias = (iso: string | null) => (iso ? Math.floor((agora - new Date(iso).getTime()) / DIA) : null);
  const semEntrar = dias(uso.marcos.ultimo_acesso_em);
  if (!uso.marcos.ja_acessou) {
    p.push({ chave: 'nunca_entrou', texto: 'Ninguém nunca entrou no sistema', acao: 'Ligar', peso: 'grave' });
  } else if (semEntrar !== null && semEntrar > 30) {
    p.push({ chave: 'parado', texto: `Sem ninguém entrar há ${semEntrar} dias`, acao: 'Ligar', peso: 'grave' });
  } else if (semEntrar !== null && semEntrar > 7) {
    p.push({ chave: 'ocioso', texto: `Sem ninguém entrar há ${semEntrar} dias`, peso: 'atencao' });
  }

  const caidos = uso.canais.conexoes.filter((c) => !c.ativo);
  if (caidos.length) {
    p.push({
      chave: 'canal_caido',
      texto: caidos.length === 1
        ? `Canal ${caidos[0].canal} desconectado`
        : `${caidos.length} canais desconectados`,
      acao: 'Reconectar no sistema do cliente',
      peso: 'grave',
    });
  }

  if (uso.estoque.disponiveis > 0 && !uso.marcos.tem_anuncio_no_ar) {
    p.push({ chave: 'sem_anuncio', texto: 'Estoque sem nenhum anúncio no ar', acao: 'Publicar', peso: 'grave' });
  }
  if (uso.estoque.parados_60d >= 3) {
    p.push({
      chave: 'estoque_parado',
      texto: `${uso.estoque.parados_60d} veículos sem mexer há 60 dias`,
      peso: 'atencao',
    });
  }
  if (uso.marcos.nunca_entraram > 0) {
    p.push({
      chave: 'usuario_ocioso',
      texto: `${uso.marcos.nunca_entraram} de ${uso.uso.usuarios} usuários nunca entraram`,
      acao: 'Treinar',
      peso: 'atencao',
    });
  }
  return p;
}
