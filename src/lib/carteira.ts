import type { Client, SaudeDaEmpresa } from '@/hooks/useAdmin';
import { situacaoDoCliente, etapasDoCliente, type SituacaoCliente } from '@/lib/estadoDoCliente';
import { mrrDaCarteira, type PagamentoDoMRR } from '@/lib/mrr';

/**
 * A carteira inteira, do jeito que um diretor olha.
 *
 * O painel tinha uma lista de nomes com o MRR ao lado. Isso responde
 * "quantos clientes eu tenho" e nada mais — nem quem está no ar, nem quem
 * sumiu, nem onde está o dinheiro parado. Com dez clientes dá para saber
 * de cabeça; com mil, a lista vira um índice telefônico.
 *
 * Aqui cada cliente ganha situação (do uso, não do que alguém marcou) e
 * os alarmes que se pode agir hoje. O total em cima é o que se olha
 * primeiro e o que aparece em reunião.
 */

export type Alarme = {
  chave: string;
  texto: string;
  /** `grave` é dinheiro ou conta sumindo; `atencao` é sinal amarelo. */
  peso: 'grave' | 'atencao';
};

export type LinhaDaCarteira = {
  cliente: Client;
  saude: SaudeDaEmpresa | null;
  situacao: SituacaoCliente;
  alarmes: Alarme[];
  /** Quanto tempo desde o último login, em dias. `null` = nunca entrou. */
  diasSemEntrar: number | null;
};

const dias = (iso: string | null | undefined, agora: number) =>
  iso ? Math.floor((agora - new Date(iso).getTime()) / 86_400_000) : null;

/**
 * O que precisa de ação neste cliente, hoje.
 *
 * Alarme que aparece sempre é alarme que ninguém lê — foi o que aconteceu
 * com o aviso de canal fora do ar no sistema do lojista. Cada um destes
 * tem uma ação óbvia do outro lado: ligar, reconectar, cobrar.
 */
export function alarmesDoCliente(
  cliente: Client,
  s: SaudeDaEmpresa | null,
  agora = Date.now(),
): Alarme[] {
  const a: Alarme[] = [];
  if (cliente.status === 'cancelado') return a;

  if (cliente.status === 'inadimplente') {
    a.push({ chave: 'inadimplente', texto: 'Cobrança em atraso', peso: 'grave' });
  }
  if (!s) return a;

  const semEntrar = dias(s.ultimo_acesso_em, agora);
  if (semEntrar === null) {
    a.push({ chave: 'nunca_entrou', texto: 'Ninguém nunca entrou', peso: 'grave' });
  } else if (semEntrar > 30) {
    a.push({ chave: 'parado', texto: `Sem entrar há ${semEntrar} dias`, peso: 'grave' });
  } else if (semEntrar > 7) {
    a.push({ chave: 'ocioso', texto: `Sem entrar há ${semEntrar} dias`, peso: 'atencao' });
  }

  if (s.canais_caidos > 0) {
    a.push({
      chave: 'canal_caido',
      texto: s.canais_caidos === 1 ? 'Um canal desconectado' : `${s.canais_caidos} canais desconectados`,
      peso: 'grave',
    });
  }
  /* Ter estoque e nenhum anúncio é o pior caso silencioso: o cliente paga
     e não recebe nada em troca. */
  if (s.veiculos > 0 && s.veiculos_anunciados === 0) {
    a.push({ chave: 'sem_anuncio', texto: 'Estoque sem nenhum anúncio no ar', peso: 'grave' });
  }
  /* Aqui havia um alarme de "anúncio de veículo vendido ainda no ar". Ele
     saiu porque a frase era mais forte do que o dado: o que o banco sabe
     é que a LINHA ficou marcada como ativa, não que o post esteja
     visível. Os dois casos da iTruck eram registro velho — o post do
     Facebook abria em "conteúdo não disponível". Dizer "no ar" sobre o
     que não se conferiu ensina a desconfiar do painel inteiro. */
  if (s.veiculos_parados_60d >= 3) {
    a.push({
      chave: 'estoque_parado',
      texto: `${s.veiculos_parados_60d} veículos parados há 60 dias`,
      peso: 'atencao',
    });
  }
  if (s.usuarios_que_nunca_entraram > 0) {
    a.push({
      chave: 'usuario_ocioso',
      texto: `${s.usuarios_que_nunca_entraram} de ${s.usuarios} usuários nunca entraram`,
      peso: 'atencao',
    });
  }
  return a;
}

export function montarCarteira(
  clientes: Client[],
  saude: SaudeDaEmpresa[],
  agora = Date.now(),
): LinhaDaCarteira[] {
  const porEmpresa = new Map(saude.map((s) => [s.company_id, s]));
  return clientes.map((cliente) => {
    const s = cliente.lojista_company_id ? porEmpresa.get(cliente.lojista_company_id) ?? null : null;
    const etapas = etapasDoCliente(
      { lojista_company_id: cliente.lojista_company_id, domain: cliente.domain },
      s ? {
        marcos: {
          ja_acessou: !!s.ultimo_acesso_em,
          ultimo_acesso_em: s.ultimo_acesso_em,
          primeiro_veiculo_em: s.ultimo_veiculo_em,
          tem_canal_ligado: s.canais_ligados > 0,
          tem_anuncio_no_ar: s.veiculos_anunciados > 0,
        },
        estoque: { total: s.veiculos },
      } : null,
    );
    return {
      cliente,
      saude: s,
      situacao: situacaoDoCliente(etapas, s?.ultimo_acesso_em, agora),
      alarmes: alarmesDoCliente(cliente, s, agora),
      diasSemEntrar: dias(s?.ultimo_acesso_em, agora),
    };
  });
}

/**
 * Os números que abrem a tela — e a reunião.
 *
 * Os pagamentos entram aqui porque MRR é o que já entrou, não o que foi
 * assinado: ver `lib/mrr.ts`. Passar a lista é obrigatório de propósito —
 * com um valor padrão, esquecer de passar daria zero em silêncio, que é
 * exatamente o defeito que estamos consertando.
 */
export function totaisDaCarteira(linhas: LinhaDaCarteira[], pagamentos: PagamentoDoMRR[]) {
  const vivos = linhas.filter((l) => l.cliente.status !== 'cancelado');
  const soma = (f: (l: LinhaDaCarteira) => number) => vivos.reduce((s, l) => s + f(l), 0);
  const dinheiro = mrrDaCarteira(linhas.map((l) => l.cliente), pagamentos);
  return {
    clientes: vivos.length,
    mrr: dinheiro.mrr,
    mrrAguardando: dinheiro.aguardando,
    contasPagantes: dinheiro.contas,
    veiculos: soma((l) => l.saude?.veiculos ?? 0),
    valorEstoque: soma((l) => Number(l.saude?.valor_estoque ?? 0)),
    veiculosAnunciados: soma((l) => l.saude?.veiculos_anunciados ?? 0),
    vendas30d: soma((l) => l.saude?.vendas_30d ?? 0),
    faturamento30d: soma((l) => Number(l.saude?.faturamento_30d ?? 0)),
    usuarios: soma((l) => l.saude?.usuarios ?? 0),
    /* Quantas contas precisam de alguém hoje. É o número que decide a
       agenda da equipe, e não existia em lugar nenhum. */
    comAlarmeGrave: vivos.filter((l) => l.alarmes.some((a) => a.peso === 'grave')).length,
    usando: vivos.filter((l) => l.situacao === 'usando').length,
    implantando: vivos.filter((l) => l.situacao === 'implantando').length,
    sumidos: vivos.filter((l) => l.situacao === 'ocioso' || l.situacao === 'parado').length,
  };
}

/** Quem precisa de atenção primeiro: grave na frente, e o mais parado antes. */
export const ordemDeAtencao = (a: LinhaDaCarteira, b: LinhaDaCarteira) => {
  const peso = (l: LinhaDaCarteira) =>
    l.alarmes.some((x) => x.peso === 'grave') ? 2 : l.alarmes.length ? 1 : 0;
  const d = peso(b) - peso(a);
  if (d) return d;
  return (b.diasSemEntrar ?? 9999) - (a.diasSemEntrar ?? 9999);
};
