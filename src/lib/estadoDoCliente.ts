/**
 * Em que pé está o cliente — lido dos fatos, não de uma caixa marcada.
 *
 * O painel guardava o andamento em `onboarding_tasks.done`, marcado à mão.
 * O resultado foi previsível: a iTruck passou duas semanas como
 * "aguardando primeiro acesso" enquanto publicava caminhão todo dia, e o
 * status dela ficou em `onboarding` depois de faturar um milhão. Estado
 * que depende de alguém lembrar de clicar é estado que envelhece sozinho,
 * e um painel que mente é pior que um painel vazio — o vazio ninguém usa
 * para decidir.
 *
 * Aqui cada etapa é uma PERGUNTA com resposta no banco. O que não tem
 * resposta no banco — treinamento, que é uma conversa entre pessoas —
 * continua manual, e a tela diz que é manual. A honestidade sobre o que o
 * sistema não sabe é o que faz confiar no resto.
 */

/** O que a ficha precisa saber do cliente, do lado do painel. */
export type FatosDoPainel = {
  lojista_company_id?: string | null;
  domain?: string | null;
  contract_signed_at?: string | null;
  asaas_payment_link_url?: string | null;
  /** Pagamento confirmado — vem de `payments`, não do link existir. */
  pagou?: boolean;
  /** As tarefas marcadas à mão, para o que não é verificável. */
  tarefas?: Array<{ task_key: string; done: boolean }>;
};

/** O que a ponte devolve do sistema do lojista. */
export type FatosDoSistema = {
  marcos?: {
    ja_acessou?: boolean;
    ultimo_acesso_em?: string | null;
    primeiro_veiculo_em?: string | null;
    primeira_publicacao_em?: string | null;
    primeira_venda_em?: string | null;
    tem_canal_ligado?: boolean;
    tem_anuncio_no_ar?: boolean;
  };
  estoque?: { total?: number };
} | null;

export type Etapa = {
  chave: string;
  titulo: string;
  /** De onde o painel tirou isto. Três coisas diferentes, e a tela
      precisa separá-las: o que o painel já sabia (contrato, cobrança), o
      que ele foi buscar no sistema do cliente, e o que alguém marcou. */
  origem: 'painel' | 'sistema' | 'mao';
  feito: boolean;
  /** A frase que explica o que o painel viu. Aparece na tela. */
  porque: string;
};

const sim = (v: unknown) => v !== null && v !== undefined && v !== false && v !== 0 && v !== '';

/**
 * As etapas, na ordem em que acontecem de verdade.
 *
 * `sistema` nulo significa que a ponte ainda não respondeu — e aí o que
 * depende dela fica em aberto com o motivo dito, em vez de virar "não
 * feito". Não saber e não ter são coisas diferentes.
 */
export function etapasDoCliente(painel: FatosDoPainel, sistema: FatosDoSistema): Etapa[] {
  const m = sistema?.marcos ?? {};
  const semPonte = sistema === null;
  const naoSei = (q: string) => (semPonte ? `Ainda não li o sistema do cliente — ${q}` : q);
  const marcada = (k: string) => painel.tarefas?.find((t) => t.task_key === k)?.done === true;

  return [
    {
      chave: 'contrato_assinado',
      titulo: 'Contrato assinado',
      origem: 'painel',
      feito: sim(painel.contract_signed_at),
      porque: sim(painel.contract_signed_at) ? 'tem data de assinatura' : 'sem data de assinatura',
    },
    {
      chave: 'pagamento_recebido',
      titulo: 'Pagamento recebido',
      origem: 'painel',
      feito: painel.pagou === true,
      porque: painel.pagou === true
        ? 'cobrança confirmada'
        : sim(painel.asaas_payment_link_url) ? 'link criado, pagamento não confirmado' : 'cobrança ainda não criada',
    },
    {
      chave: 'sistema_criado',
      titulo: 'Sistema no ar',
      origem: 'painel',
      feito: sim(painel.lojista_company_id),
      porque: sim(painel.lojista_company_id) ? 'empresa provisionada' : 'empresa ainda não existe',
    },
    {
      chave: 'dominio_conectado',
      titulo: 'Domínio próprio',
      origem: 'painel',
      feito: sim(painel.domain),
      porque: sim(painel.domain) ? `aponta para ${painel.domain}` : 'usando o endereço padrão',
    },
    {
      chave: 'acesso_liberado',
      titulo: 'Primeiro acesso',
      origem: 'sistema',
      feito: m.ja_acessou === true,
      porque: m.ja_acessou === true
        ? 'alguém da loja já entrou'
        : naoSei('ninguém da loja entrou ainda'),
    },
    {
      chave: 'dados_importados',
      titulo: 'Estoque cadastrado',
      origem: 'sistema',
      feito: sim(m.primeiro_veiculo_em),
      porque: sim(m.primeiro_veiculo_em)
        ? `${sistema?.estoque?.total ?? 0} veículos no sistema`
        : naoSei('nenhum veículo cadastrado'),
    },
    {
      chave: 'canal_conectado',
      titulo: 'Canal de venda ligado',
      origem: 'sistema',
      feito: m.tem_canal_ligado === true,
      porque: m.tem_canal_ligado === true ? 'pelo menos um canal conectado' : naoSei('nenhum canal conectado'),
    },
    {
      chave: 'go_live',
      titulo: 'Anunciando',
      origem: 'sistema',
      feito: m.tem_anuncio_no_ar === true,
      porque: m.tem_anuncio_no_ar === true ? 'tem anúncio no ar agora' : naoSei('nenhum anúncio no ar'),
    },
    {
      /* A única que não tem resposta no banco: é conversa entre pessoas.
         Fica marcada à mão, e a tela diz que é à mão — misturar as duas
         origens sem avisar é o que fazia o checklist inteiro parecer
         igualmente confiável. */
      chave: 'treinamento_realizado',
      titulo: 'Treinamento feito',
      origem: 'mao',
      feito: marcada('treinamento_realizado'),
      porque: marcada('treinamento_realizado') ? 'marcado pela equipe' : 'a equipe ainda não marcou',
    },
  ];
}

export type SituacaoCliente = 'prospecto' | 'implantando' | 'usando' | 'ocioso' | 'parado';

/**
 * A situação do cliente numa palavra, para a lista e para o alarme.
 *
 * Separa "implantando" de "usando" pelo único critério que importa: ele
 * está anunciando? E separa "usando" de "ocioso" e "parado" pelo tempo
 * desde o último acesso — que é o que antecede o churn, e não aparece em
 * nenhum lugar hoje.
 */
export function situacaoDoCliente(
  etapas: Etapa[],
  ultimoAcessoEm: string | null | undefined,
  agora = Date.now(),
): SituacaoCliente {
  const feito = (k: string) => etapas.find((e) => e.chave === k)?.feito === true;
  if (!feito('sistema_criado')) return 'prospecto';

  const dias = ultimoAcessoEm
    ? Math.floor((agora - new Date(ultimoAcessoEm).getTime()) / 86_400_000)
    : Infinity;

  if (dias > 30) return 'parado';
  if (!feito('go_live')) return 'implantando';
  if (dias > 7) return 'ocioso';
  return 'usando';
}

export const ROTULO_SITUACAO: Record<SituacaoCliente, { texto: string; tom: 'neutro' | 'bom' | 'atencao' | 'ruim' }> = {
  prospecto:   { texto: 'Sem sistema',  tom: 'neutro' },
  implantando: { texto: 'Implantando',  tom: 'atencao' },
  usando:      { texto: 'Usando',       tom: 'bom' },
  ocioso:      { texto: 'Sem entrar há mais de uma semana', tom: 'atencao' },
  parado:      { texto: 'Parado há mais de um mês',         tom: 'ruim' },
};

/** Quantas etapas fecharam, para a barra de progresso. */
export const progresso = (etapas: Etapa[]) => ({
  feitas: etapas.filter((e) => e.feito).length,
  total: etapas.length,
});
