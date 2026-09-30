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
