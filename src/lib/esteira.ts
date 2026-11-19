import {
  diaFalado, diasEntre, horaFalada, reuniaoPassou, type Oportunidade,
} from './oportunidades';

/**
 * A esteira de vendas (dono, 18/11/2026): "quero o CRM como uma esteira, processos evidentes,
 * bem divididos; eu sei que o cliente entrou aqui, depois vai para cá, depois para lá".
 *
 * Sete estações, em ordem. Cada loja está em UMA, e cada estação diz três coisas: o que acontece
 * ali, o que é a parte dele e para onde a loja vai depois. Dentro da loja, a esteira vira uma
 * tela de cada vez (telaDa): marcar a reunião, preparar, a reunião, o resultado, o pagamento.
 *
 * Nada aqui é gravado: a estação sai da etapa da oportunidade (lib/oportunidades) e, depois da
 * venda, do cadastro do cliente (pagou, está em teste, foi implantado). Puro, para testar.
 */

export const ESTACOES = [
  {
    chave: 'prospeccao', rotulo: 'Prospecção',
    acontece: 'O sistema manda a primeira mensagem para as lojas da lista, sozinho.',
    voce: ['Ligar para as lojas do dia', 'Dizer como foi cada ligação'],
    depois: 'Respondeu ou atendeu: vai para Conversa.',
  },
  {
    chave: 'conversa', rotulo: 'Conversa',
    acontece: 'A loja respondeu ou pediu contato.',
    voce: ['Responder quem está esperando você', 'Marcar a reunião'],
    depois: 'Marcou dia e hora: vai para Reunião.',
  },
  {
    chave: 'reuniao', rotulo: 'Reunião',
    acontece: 'A demonstração está marcada.',
    voce: ['Montar a amostra da loja antes', 'Entrar na chamada', 'Dizer como foi'],
    depois: 'Aconteceu: vai para Decisão. Faltou: volta para Conversa.',
  },
  {
    chave: 'decisao', rotulo: 'Decisão',
    acontece: 'A loja viu o sistema e ficou de pensar.',
    voce: ['Cobrar a resposta em dois dias', 'Quando disser sim, apertar Fechou'],
    depois: 'Disse sim: vai para Fechamento.',
  },
  {
    chave: 'fechamento', rotulo: 'Fechamento',
    acontece: 'O cliente disse "eu quero".',
    voce: ['Mandar o link de pagamento', 'Mandar o contrato'],
    depois: 'Pagou: vai para Implantação.',
  },
  {
    chave: 'implantacao', rotulo: 'Implantação',
    acontece: 'A loja está sendo colocada no ar.',
    voce: ['Seguir os passos até o primeiro anúncio publicado'],
    depois: 'Loja no ar: vira Cliente.',
  },
  {
    chave: 'cliente', rotulo: 'Cliente',
    acontece: 'Usa o sistema e paga todo mês.',
    voce: ['Nada no dia a dia: o sistema avisa se atrasar'],
    depois: 'Fim da esteira.',
  },
] as const;

export type Estacao = (typeof ESTACOES)[number]['chave'];

export const numeroDaEstacao = (e: Estacao) => ESTACOES.findIndex((x) => x.chave === e) + 1;
export const estacaoPorChave = (e: Estacao) => ESTACOES.find((x) => x.chave === e)!;

/** O cadastro do cliente, depois que a venda (ou o teste) foi registrada. */
export type ClienteDaEsteira = {
  id: string; prospectId: string | null; nome: string; lugar: string; telefone: string | null;
  status: string;
  /** Já entrou algum pagamento. */
  pagou: boolean;
  /** Está no teste grátis (não se espera pagamento agora). */
  emTeste: boolean;
  /** A loja já foi colocada no ar. */
  implantado: boolean;
  checkoutToken: string | null;
  contratoAssinado: boolean;
  mensalidade: number | null;
  criadoEm: string;
};

export function estacaoDoCliente(c: ClienteDaEsteira): Estacao {
  if (c.implantado || c.status === 'ativo' || c.status === 'inadimplente' || c.status === 'pausado') return 'cliente';
  return c.pagou || c.emTeste ? 'implantacao' : 'fechamento';
}

export function estacaoDaOportunidade(o: Oportunidade): Estacao {
  switch (o.etapa) {
    case 'cliente': return 'cliente';
    case 'teste': return 'implantacao';
    case 'decisao': return 'decisao';
    case 'reuniao': return 'reuniao';
    default: return 'conversa';
  }
}

/** As telas da esteira de uma loja: uma coisa de cada vez. */
export type Tela = 'marcar' | 'preparar' | 'reuniao' | 'resultado' | 'pagamento' | 'implantacao' | 'cliente' | 'perdida';

/** Quantos minutos antes da hora a tela já vira "a reunião" (e deixa de ser "prepare"). */
export const MINUTOS_ANTES = 15;

export type ItemDaEsteira = {
  /** `loja:<id>`, `card:<id>` ou `cliente:<id>`. */
  id: string;
  nome: string;
  lugar: string;
  telefone: string | null;
  estacao: Estacao;
  /** Antes da venda. */
  o: Oportunidade | null;
  /** Depois da venda. */
  cliente: ClienteDaEsteira | null;
  /** A loja já tem amostra para mostrar na reunião. */
  temAmostra: boolean;
  /** É com você, agora. */
  suaVez: boolean;
  /** O que fazer com ela, numa linha. */
  fazer: string;
  mexeuEm: string;
};

export function telaDo(i: ItemDaEsteira, agora: Date = new Date()): Tela {
  if (i.o?.perdida && !i.cliente) return 'perdida';
  switch (i.estacao) {
    case 'reuniao': {
      const r = i.o?.reuniao;
      if (!r) return 'marcar';
      return new Date(r.scheduled_at).getTime() - agora.getTime() <= MINUTOS_ANTES * 60_000 ? 'reuniao' : 'preparar';
    }
    case 'decisao': return 'resultado';
    case 'fechamento': return 'pagamento';
    case 'implantacao': return 'implantacao';
    case 'cliente': return 'cliente';
    default: return 'marcar';
  }
}

/**
 * Lojas e clientes numa esteira só. Card que já tem cliente sai da parte de cima (a venda foi
 * registrada) e quem manda passa a ser o cadastro do cliente.
 */
export function montarEsteira(
  ops: Oportunidade[], clientes: ClienteDaEsteira[], comAmostra: Set<string>, agora: Date = new Date(),
): ItemDaEsteira[] {
  const vivos = clientes.filter((c) => c.status !== 'cancelado');
  const comCliente = new Set(vivos.map((c) => c.prospectId).filter(Boolean));
  const itens: ItemDaEsteira[] = [];
  for (const o of ops) {
    if (o.perdida || (o.cardId && comCliente.has(o.cardId))) continue;
    const estacao = estacaoDaOportunidade(o);
    const temAmostra = !!o.cardId && comAmostra.has(o.cardId);
    let fazer = o.passo.texto;
    let suaVez = o.passo.tom === 'agora' || o.esperandoVoce;
    if (estacao === 'reuniao' && o.reuniao && !reuniaoPassou(o.reuniao, agora) && !temAmostra && o.naoLidas === 0) {
      fazer = `${o.passo.texto}: monte a amostra antes`;
      suaVez = true;
    }
    itens.push({ id: o.id, nome: o.nome, lugar: o.lugar, telefone: o.telefone, estacao, o, cliente: null, temAmostra, suaVez, fazer, mexeuEm: o.mexeuEm });
  }
  for (const c of vivos) {
    const estacao = estacaoDoCliente(c);
    const fazer = estacao === 'fechamento' ? 'Mande o link de pagamento e acompanhe até pagar'
      : estacao === 'implantacao' ? (c.emTeste ? 'Em teste grátis: coloque a loja no ar' : 'Pagou: coloque a loja no ar')
      : c.status === 'inadimplente' ? 'Mensalidade em atraso' : 'Cliente';
    itens.push({
      id: `cliente:${c.id}`, nome: c.nome, lugar: c.lugar, telefone: c.telefone, estacao, o: null, cliente: c,
      temAmostra: true, suaVez: estacao === 'fechamento', fazer, mexeuEm: c.criadoEm,
    });
  }
  return itens;
}

export function porEstacao(itens: ItemDaEsteira[]): Record<Estacao, ItemDaEsteira[]> {
  const m = Object.fromEntries(ESTACOES.map((e) => [e.chave, [] as ItemDaEsteira[]])) as Record<Estacao, ItemDaEsteira[]>;
  for (const i of itens) m[i.estacao].push(i);
  for (const e of ESTACOES) m[e.chave].sort((a, b) => Number(b.suaVez) - Number(a.suaVez) || b.mexeuEm.localeCompare(a.mexeuEm));
  return m;
}

/* ── a rotina do dia ─────────────────────────────────────────────── */

export type LinhaDaRotina = { estacao: Estacao; titulo: string; quantos: number; resumo: string };

/**
 * O dia, sempre na mesma ordem: do fim da esteira (quem está mais perto de pagar) para o começo
 * (ligação fria). `ligacoes` vem da lista do dia.
 */
export function rotinaDoDia(
  itens: ItemDaEsteira[], ligacoes: { feitas: number; meta: number }, soltas = 0, agora: Date = new Date(),
): LinhaDaRotina[] {
  const de = (e: Estacao) => itens.filter((i) => i.estacao === e);
  const lojas = (n: number) => (n === 0 ? 'nada' : n === 1 ? '1 loja' : `${n} lojas`);
  const fechamento = de('fechamento').length;
  const decisao = de('decisao').length;
  const reunioes = de('reuniao').filter((i) => i.o?.reuniao && diasEntre(i.o.reuniao.scheduled_at, agora) >= 0).length;
  const esperam = de('conversa').filter((i) => i.suaVez).length + soltas;
  const faltam = Math.max(0, ligacoes.meta - ligacoes.feitas);
  return [
    { estacao: 'fechamento', titulo: 'Receber de quem fechou', quantos: fechamento, resumo: lojas(fechamento) },
    { estacao: 'decisao', titulo: 'Cobrar quem ficou de pensar', quantos: decisao, resumo: lojas(decisao) },
    { estacao: 'reuniao', titulo: 'Fazer as reuniões de hoje', quantos: reunioes, resumo: reunioes === 0 ? 'nada' : reunioes === 1 ? '1 reunião' : `${reunioes} reuniões` },
    { estacao: 'conversa', titulo: 'Responder quem espera você', quantos: esperam, resumo: lojas(esperam) },
    { estacao: 'prospeccao', titulo: 'Ligar para lojas novas', quantos: faltam, resumo: ligacoes.meta ? `${ligacoes.feitas} de ${ligacoes.meta}` : 'nada' },
  ];
}

/* ── a próxima coisa ─────────────────────────────────────────────── */

export type Proxima = { item: ItemDaEsteira; titulo: string; detalhe: string; botao: string } | null;

/** A coisa mais importante para fazer agora: uma só, para ficar grande na tela. */
export function proximaCoisa(itens: ItemDaEsteira[], agora: Date = new Date()): Proxima {
  const naReuniao = itens.filter((i) => i.estacao === 'reuniao' && i.o?.reuniao);
  const hora = (i: ItemDaEsteira) => i.o!.reuniao!.scheduled_at;
  const quando = (i: ItemDaEsteira) => `${diaFalado(hora(i), agora)} às ${horaFalada(hora(i))}`;
  const cedo = (a: ItemDaEsteira, b: ItemDaEsteira) => hora(a).localeCompare(hora(b));

  const agoraMesmo = naReuniao.filter((i) => telaDo(i, agora) === 'reuniao').sort(cedo)[0];
  if (agoraMesmo) {
    const passou = reuniaoPassou(agoraMesmo.o!.reuniao, agora);
    return {
      item: agoraMesmo,
      titulo: passou ? `Como foi a reunião com ${agoraMesmo.nome}?` : `Reunião com ${agoraMesmo.nome} agora`,
      detalhe: passou ? `Era ${quando(agoraMesmo)}. Conte como foi para a loja andar na esteira.` : `Marcada para ${quando(agoraMesmo)}.`,
      botao: passou ? 'Contar como foi' : 'Abrir a reunião',
    };
  }
  const novo = itens.filter((i) => i.o?.etapa === 'novo').sort((a, b) => b.o!.entrouEm.localeCompare(a.o!.entrouEm))[0];
  if (novo) return { item: novo, titulo: `${novo.nome} pediu contato`, detalhe: 'Quem acabou de pedir esfria rápido: chame agora.', botao: 'Abrir' };

  const semAmostra = naReuniao.filter((i) => !i.temAmostra).sort(cedo)[0];
  if (semAmostra) {
    return {
      item: semAmostra, titulo: `Monte a amostra da ${semAmostra.nome}`,
      detalhe: `A reunião é ${quando(semAmostra)}. Com a amostra pronta, você mostra o sistema com a cara da loja.`, botao: 'Montar a amostra',
    };
  }
  const aReceber = itens.filter((i) => i.estacao === 'fechamento')[0];
  if (aReceber) return { item: aReceber, titulo: `${aReceber.nome} fechou: falta pagar`, detalhe: 'Mande o link de pagamento e acompanhe até entrar.', botao: 'Abrir o pagamento' };

  const esperando = itens.filter((i) => i.estacao === 'conversa' && i.suaVez).sort((a, b) => a.mexeuEm.localeCompare(b.mexeuEm))[0];
  if (esperando) return { item: esperando, titulo: `${esperando.nome} está esperando você`, detalhe: esperando.o?.motivo ?? esperando.fazer, botao: 'Abrir' };

  const proximaReuniao = [...naReuniao].sort(cedo)[0];
  if (proximaReuniao) return { item: proximaReuniao, titulo: `Reunião com ${proximaReuniao.nome}`, detalhe: `${quando(proximaReuniao)}. A amostra está pronta.`, botao: 'Abrir' };

  const decidir = itens.filter((i) => i.estacao === 'decisao').sort((a, b) => a.mexeuEm.localeCompare(b.mexeuEm))[0];
  if (decidir) return { item: decidir, titulo: `Cobre a decisão da ${decidir.nome}`, detalhe: decidir.fazer, botao: 'Abrir' };
  return null;
}
