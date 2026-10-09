import type { Etapa, FatosDoSistema } from './estadoDoCliente';

/* A implantação, do jeito que a equipe precisa ler: em que passo cada
   cliente está, com quem a bola está agora e o botão que resolve. As
   etapas continuam vindo de `estadoDoCliente` — aqui só se decide a
   ORDEM em que elas são cobradas e o que cada uma pede de quem. */

/** O que a visão de empresa (client-usage-metrics) devolve, no que importa aqui. */
export type SaudeResumida = {
  veiculos: number;
  veiculos_anunciados: number;
  canais_ligados: number;
  usuarios: number;
  usuarios_que_nunca_entraram: number;
  ultimo_acesso_em: string | null;
  ultimo_veiculo_em: string | null;
};

/**
 * A linha da visão de empresa no formato que `etapasDoCliente` entende.
 * Sem linha (a ponte não respondeu, ou o cliente nem tem sistema) devolve
 * `null`: "não sei" é diferente de "não tem".
 */
export function fatosDaSaude(s: SaudeResumida | null | undefined): FatosDoSistema {
  if (!s) return null;
  return {
    marcos: {
      ja_acessou: !!s.ultimo_acesso_em || s.usuarios > s.usuarios_que_nunca_entraram,
      ultimo_acesso_em: s.ultimo_acesso_em,
      primeiro_veiculo_em: s.veiculos > 0 ? (s.ultimo_veiculo_em ?? 'sim') : null,
      tem_canal_ligado: s.canais_ligados > 0,
      tem_anuncio_no_ar: s.veiculos_anunciados > 0,
    },
    estoque: { total: s.veiculos },
  };
}

export type Dono = 'nos' | 'cliente';

export type Passo = {
  /** O que fazer, no imperativo — é o texto do botão. */
  acao: string;
  /** Com quem a bola está. */
  dono: Dono;
  /** Para onde o botão leva; `null` quando o passo é do cliente e o que
      nos cabe é lembrar no WhatsApp. */
  rota: (clienteId: string) => string | null;
  /** O lembrete pronto, quando o passo é do cliente. */
  lembrete?: string;
};

/* A ordem em que se cobra. Domínio vai por último: com o endereço padrão o
   cliente já anuncia e vende, e esperar o DNS de alguém não pode travar o
   resto da fila. */
export const ORDEM_DA_IMPLANTACAO = [
  'contrato_assinado',
  'pagamento_recebido',
  'sistema_criado',
  'acesso_liberado',
  'dados_importados',
  'canal_conectado',
  'go_live',
  'treinamento_realizado',
  'dominio_conectado',
] as const;

export const PASSOS: Record<(typeof ORDEM_DA_IMPLANTACAO)[number], Passo> = {
  contrato_assinado: {
    acao: 'Registrar a assinatura do contrato',
    dono: 'nos',
    rota: (id) => `/clientes/${id}?resolver=contrato_assinado`,
  },
  pagamento_recebido: {
    acao: 'Receber o primeiro pagamento',
    dono: 'cliente',
    rota: (id) => `/clientes/${id}/cobranca`,
    lembrete: 'para liberar o seu sistema, falta só o primeiro pagamento. O link está na fatura que enviamos — qualquer dúvida, é só me chamar por aqui.',
  },
  sistema_criado: {
    acao: 'Criar o sistema',
    dono: 'nos',
    rota: (id) => `/clientes/${id}?resolver=sistema_criado`,
  },
  acesso_liberado: {
    acao: 'Enviar o primeiro acesso',
    dono: 'nos',
    rota: (id) => `/clientes/${id}/onboarding?etapa=acesso_liberado`,
  },
  dados_importados: {
    acao: 'Cadastrar o estoque',
    dono: 'cliente',
    rota: (id) => `/clientes/${id}/onboarding?etapa=dados_importados`,
    lembrete: 'o seu sistema já está pronto. O próximo passo é cadastrar os veículos do estoque — se preferir, me manda a lista que a gente ajuda.',
  },
  canal_conectado: {
    acao: 'Ligar um canal de venda',
    dono: 'cliente',
    rota: () => null,
    lembrete: 'os veículos já estão no sistema. Agora é ligar um canal (Facebook, Instagram ou Mercado Livre) para os anúncios saírem sozinhos. Posso te mostrar em 5 minutos?',
  },
  go_live: {
    acao: 'Publicar o primeiro anúncio',
    dono: 'cliente',
    rota: () => null,
    lembrete: 'o canal já está ligado. Falta publicar o primeiro anúncio — é um clique no veículo. Quer que eu te acompanhe?',
  },
  treinamento_realizado: {
    acao: 'Fazer o treinamento',
    dono: 'nos',
    rota: (id) => `/clientes/${id}/onboarding?etapa=treinamento_realizado`,
  },
  dominio_conectado: {
    acao: 'Conectar o domínio próprio',
    dono: 'nos',
    rota: (id) => `/clientes/${id}/onboarding?etapa=dominio_conectado`,
  },
};

/** O primeiro passo em aberto na ordem de cobrança, ou `null` se acabou. */
export function proximoPasso(etapas: Etapa[]): (Passo & { chave: string; titulo: string; porque: string }) | null {
  for (const chave of ORDEM_DA_IMPLANTACAO) {
    const e = etapas.find((x) => x.chave === chave);
    if (e && !e.feito) return { ...PASSOS[chave], chave, titulo: e.titulo, porque: e.porque };
  }
  return null;
}

/** Dias inteiros desde uma data ISO. */
export const diasDesde = (iso: string, agora = Date.now()) =>
  Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 86_400_000));

export type Ritmo = 'em_dia' | 'atencao' | 'atrasado';

/** Uma semana é o combinado; duas é atraso. */
export const ritmoDaImplantacao = (dias: number): Ritmo => (dias <= 7 ? 'em_dia' : dias <= 14 ? 'atencao' : 'atrasado');

/**
 * Quem aparece na implantação: quem ainda está em `onboarding`, e quem já
 * foi marcado ativo mas não chegou a anunciar (o rótulo mudou, a loja não).
 * Cancelado e pausado ficam de fora — não há o que implantar.
 */
export function estaImplantando(status: string, etapas: Etapa[]): boolean {
  if (status === 'onboarding') return true;
  if (status !== 'ativo' && status !== 'inadimplente') return false;
  const anunciando = etapas.find((e) => e.chave === 'go_live');
  // Sem a ponte, "anunciando" fica em aberto com "Ainda não li": não dá
  // para dizer que parou, então não entra.
  return !!anunciando && !anunciando.feito && !anunciando.porque.startsWith('Ainda não li');
}
