/**
 * A YCloud, que é por onde o número oficial passa a falar.
 *
 * A WABA anterior foi desabilitada pela Meta em 14/09/2026 e levou os onze
 * modelos junto. O número novo entrou por um BSP — a YCloud —, e isso muda
 * o transporte, não o conteúdo: os `components` do template são os MESMOS
 * da Graph API, campo por campo. O que muda é o envelope (`wabaId` no
 * corpo, `X-API-Key` no cabeçalho) e uma facilidade: o cabeçalho de
 * documento aceita URL pública, sem a dança de duas etapas da Resumable
 * Upload API.
 *
 * Este arquivo é só transporte. Quem decide se manda, e o que impede o
 * disparo repetido, continua em `wa.ts`.
 */

const API = 'https://api.ycloud.com/v2';

export type Config = { chave: string; waba: string; numero: string };

/** A configuração, ou null quando o provedor não está ligado. */
export function configYCloud(): Config | null {
  const chave = Deno.env.get('YCLOUD_API_KEY');
  const waba = Deno.env.get('YCLOUD_WABA_ID');
  const numero = Deno.env.get('YCLOUD_FROM');
  if (!chave || !waba || !numero) return null;
  return { chave, waba, numero };
}

const VARIAVEIS: [string, string][] = [
  ['YCLOUD_API_KEY', 'a chave da API'],
  ['YCLOUD_WABA_ID', 'o ID da conta (WABA)'],
  ['YCLOUD_FROM', 'o número que envia'],
];

/** O que falta configurar, em português, para a tela poder dizer. */
export function faltaNaYCloud(): string[] {
  return VARIAVEIS.filter(([v]) => !Deno.env.get(v)).map(([v, o]) => `${v} — ${o}`);
}

/**
 * Configuração pela metade: alguma variável posta, e não todas.
 *
 * Sem isto, errar o nome de uma variável faz a chamada cair em silêncio no
 * provedor antigo — que é justamente a WABA desabilitada. O painel
 * mostraria verde no lugar errado, que é a mesma falha que deixou
 * "enviado" sem entrega por semanas.
 */
export function ycloudPelaMetade(): boolean {
  const postas = VARIAVEIS.filter(([v]) => !!Deno.env.get(v)).length;
  return postas > 0 && postas < VARIAVEIS.length;
}

async function chamar(
  cfg: Config, caminho: string, metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', corpo?: unknown,
) {
  /* Teto explícito: sem isso a nossa função morre por tempo e devolve 5xx
     sem corpo — erro que não explica nada para quem olha a tela. */
  const corta = AbortSignal.timeout(25_000);
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { 'X-API-Key': cfg.chave, 'Content-Type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    signal: corta,
  }).catch(() => { throw new Error('A YCloud não respondeu a tempo.'); });

  const dados = await r.json().catch(() => null);
  if (!r.ok) {
    /* A YCloud devolve o erro em `message` ou em `error.message`, conforme
       o endpoint. Repassar o objeto cru deixaria a tela mostrando `[object
       Object]`, que foi o que já aconteceu com a passagem da Evolution. */
    const detalhe = dados?.message ?? dados?.error?.message ?? dados?.error ?? `HTTP ${r.status}`;
    throw new Error(typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe));
  }
  return dados;
}

export type TemplateNaConta = { name: string; language: string; status: string };

/** Todos os modelos da conta, seguindo a paginação até o fim. */
export async function listarTemplates(cfg: Config): Promise<TemplateNaConta[]> {
  const todos: TemplateNaConta[] = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const d = await chamar(cfg, `/whatsapp/templates?filterWabaId=${encodeURIComponent(cfg.waba)}`
      + `&page=${pagina}&limit=100&includeTotal=true`);
    const itens = (d?.items ?? d?.data ?? []) as TemplateNaConta[];
    todos.push(...itens);
    /* Sem `total` confiável, o fim é a página que veio incompleta — é o que
       evita laço infinito se a resposta mudar de formato. */
    if (itens.length < 100) break;
  }
  return todos;
}

export type WebhookYCloud = {
  id: string;
  url: string;
  status: string;
  enabledEvents?: string[];
  description?: string;
};

/**
 * Para onde a YCloud manda os eventos.
 *
 * Com BSP, a entrega de eventos é configurada na YCloud, não na Meta —
 * a "inscrição no app" da Graph não existe neste caminho. Sem um endpoint
 * ativo aqui, resposta de cliente e mudança de status de template não
 * chegam, e o painel não tem como saber que não chegaram.
 */
export async function listarWebhooks(cfg: Config): Promise<WebhookYCloud[]> {
  const d = await chamar(cfg, '/webhookEndpoints?page=1&limit=100');
  return (d?.items ?? d?.data ?? []) as WebhookYCloud[];
}

export async function criarTemplate(
  cfg: Config, m: { name: string; language: string; category: string; components: unknown[] },
) {
  return await chamar(cfg, '/whatsapp/templates', 'POST', { wabaId: cfg.waba, ...m });
}

/** Manda o template. O corpo do `template` é o mesmo da Graph. */
export async function enviarPorYCloud(
  cfg: Config,
  args: { para: string; template: string; language: string; componentes: unknown[] },
): Promise<{ id: string }> {
  const d = await chamar(cfg, '/whatsapp/messages/sendDirectly', 'POST', {
    from: cfg.numero,
    to: args.para,
    type: 'template',
    template: {
      name: args.template,
      language: { code: args.language, policy: 'deterministic' },
      ...(args.componentes.length ? { components: args.componentes } : {}),
    },
  });
  return { id: String(d?.id ?? d?.wamid ?? '') };
}

/**
 * Os eventos que nos interessam, e só eles.
 *
 * A YCloud entrega mais de trinta tipos. Assinar o que não se trata enche
 * o log de ruído e esconde o que importa — e cada evento a mais é um
 * caminho a mais para um POST inesperado derrubar a função.
 */
export const EVENTOS = [
  'whatsapp.inbound_message.received',  // o cliente respondeu
  'whatsapp.message.updated',           // entregue, lida, falhou
  'whatsapp.template.reviewed',         // a Meta aprovou ou reprovou um modelo
];

export type WebhookCriado = WebhookYCloud & { secret?: string };

/**
 * Cria o endpoint e devolve o segredo.
 *
 * O `secret` vem UMA vez, nesta resposta, e não há endpoint que o repita.
 * Quem chama tem de gravá-lo no mesmo passo — perdê-lo obriga a apagar o
 * endpoint e criar outro.
 */
export async function criarWebhook(
  cfg: Config, url: string, descricao = 'Via Pesados · admin',
): Promise<WebhookCriado> {
  return await chamar(cfg, '/webhookEndpoints', 'POST', {
    url,
    description: descricao,
    enabledEvents: EVENTOS,
    status: 'active',
  }) as WebhookCriado;
}

export async function apagarWebhook(cfg: Config, id: string): Promise<void> {
  await chamar(cfg, `/webhookEndpoints/${encodeURIComponent(id)}`, 'DELETE');
}

/**
 * Texto livre — a resposta de quem está atendendo a conversa.
 *
 * Fora da janela de 24 horas a Meta recusa, e a recusa volta como erro da
 * chamada; quem chama traduz. O envelope é o mesmo do template, mudando
 * só o `type`.
 */
export async function enviarTextoPorYCloud(
  cfg: Config, args: { para: string; texto: string },
): Promise<{ id: string }> {
  const d = await chamar(cfg, '/whatsapp/messages/sendDirectly', 'POST', {
    from: cfg.numero,
    to: args.para,
    type: 'text',
    text: { body: args.texto },
  });
  return { id: String(d?.id ?? d?.wamid ?? '') };
}

export type NumeroYCloud = {
  id?: string;
  phoneNumber?: string;
  verifiedName?: string;
  displayName?: string;
  nameStatus?: string;
  /* Nome enviado para revisão e o status dele. Aprovado não basta: a Meta
     só passa a mostrar o nome novo depois que o número é registrado de
     novo, em até 14 dias. */
  newName?: string;
  newNameStatus?: string;
  qualityRating?: string;
  messagingLimit?: string;
  status?: string;
  codeVerificationStatus?: string;
  isOfficialBusinessAccount?: boolean;
};

/**
 * O número como a Meta o vê.
 *
 * É aqui que mora a resposta para "a mensagem chegou como número
 * desconhecido": quem recebe só lê o nome do negócio quando o
 * `nameStatus` do número está aprovado. Qualidade e limite vêm junto
 * porque são as outras duas coisas que decidem se a mensagem sai.
 */
export async function listarNumeros(cfg: Config): Promise<NumeroYCloud[]> {
  const d = await chamar(cfg, `/whatsapp/phoneNumbers?filterWabaId=${encodeURIComponent(cfg.waba)}&limit=50`);
  return (d?.items ?? d?.data ?? []) as NumeroYCloud[];
}

/** Um número só, pedido diretamente (a listagem pode vir de cache). */
export async function lerNumero(cfg: Config): Promise<NumeroYCloud> {
  const tel = cfg.numero.startsWith('+') ? cfg.numero : `+${cfg.numero}`;
  return await chamar(cfg, `/whatsapp/phoneNumbers/${encodeURIComponent(cfg.waba)}/${encodeURIComponent(tel)}`) as NumeroYCloud;
}

export type PerfilDoNumero = {
  about?: string; address?: string; description?: string; email?: string;
  websites?: string[]; profilePictureUrl?: string; vertical?: string;
  verifiedName?: string; nameStatus?: string;
};

/**
 * O perfil que o cliente vê ao tocar no nome da conversa.
 *
 * Foto, descrição, site e categoria. Nada disso muda o nome que aparece
 * no topo — isso é o `nameStatus` do número —, mas é o que diferencia
 * "empresa de verdade" de "número solto" para quem recebeu a primeira
 * mensagem e foi conferir quem está falando.
 */
export async function lerPerfil(cfg: Config): Promise<PerfilDoNumero> {
  const tel = cfg.numero.startsWith('+') ? cfg.numero : `+${cfg.numero}`;
  return await chamar(cfg, `/whatsapp/phoneNumbers/${encodeURIComponent(cfg.waba)}/${encodeURIComponent(tel)}/profile`) as PerfilDoNumero;
}

export async function salvarPerfil(cfg: Config, perfil: PerfilDoNumero): Promise<PerfilDoNumero> {
  const tel = cfg.numero.startsWith('+') ? cfg.numero : `+${cfg.numero}`;
  return await chamar(
    cfg, `/whatsapp/phoneNumbers/${encodeURIComponent(cfg.waba)}/${encodeURIComponent(tel)}/profile`,
    'POST', perfil,
  ) as PerfilDoNumero;
}
