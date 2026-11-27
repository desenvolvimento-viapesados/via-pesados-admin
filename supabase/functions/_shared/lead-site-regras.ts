/**
 * O formulário da página de vendas (dono, 18/11/2026: "as respostas precisam cair no CRM na hora,
 * e eu preciso chamar ou ligar para essas pessoas na hora").
 *
 * Aqui só as regras: o que é um pedido válido e como ele vira o texto que aparece no CRM.
 * Puro, para testar sem banco (src/lib/leadSite.test.ts).
 */

export const CARGOS: Record<string, string> = {
  dono: 'Dono', socio: 'Sócio', gerente: 'Gerente', vendedor: 'Vendedor', outro: 'Outro',
};

/** As mesmas dores do roteiro de ligação: cada uma é uma promessa do sistema. */
export const DIFICULDADES: Record<string, string> = {
  anunciar: 'Anunciar em cada lugar',
  atendimento: 'Responder cliente com foto e ficha',
  clientes: 'Lembrar quem procurou o quê',
  relatorios: 'Saber o que mais vende',
  outra: 'Outra',
};

export type PedidoDoSite = {
  nome: string; loja: string; whatsapp: string; cidade: string | null; uf: string | null;
  estoque: string | null; cargo: string | null; dificuldade: string | null; campanha: string | null;
};

const limpo = (v: unknown, max: number) => {
  const t = String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/** DDD + número, só dígitos, sem o 55. `null` se não dá para discar. */
export function whatsappDoPedido(v: unknown): string | null {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  return d.length === 10 || d.length === 11 ? d : null;
}

/** `33988144005` → `(33) 98814-4005`, que é como o CRM guarda. */
export const mascaraDoPedido = (d: string) => `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`;

/** DDD + os 8 últimos dígitos: reconhece o mesmo número com ou sem 55 e nono dígito. */
export function chaveDoWhatsapp(v: unknown): string | null {
  const d = whatsappDoPedido(v);
  return d ? d.slice(0, 2) + d.slice(-8) : null;
}

export type Leitura = { ok: true; pedido: PedidoDoSite } | { ok: false; erro: string } | { ok: 'robo' };

/** Confere o que chegou. O campo `site` é isca: gente não vê, robô preenche. */
export function lerPedido(corpo: Record<string, unknown>): Leitura {
  if (limpo(corpo.site, 200)) return { ok: 'robo' };
  const nome = limpo(corpo.nome, 80);
  const loja = limpo(corpo.loja, 120);
  const zap = whatsappDoPedido(corpo.whatsapp);
  if (!nome) return { ok: false, erro: 'Diga o seu nome.' };
  if (!loja) return { ok: false, erro: 'Diga o nome da loja.' };
  if (!zap) return { ok: false, erro: 'Confira o WhatsApp: precisa do DDD.' };
  const uf = limpo(corpo.uf, 2)?.toUpperCase() ?? null;
  const cargo = limpo(corpo.cargo, 20)?.toLowerCase() ?? null;
  const dificuldade = limpo(corpo.dificuldade, 20)?.toLowerCase() ?? null;
  return {
    ok: true,
    pedido: {
      nome, loja, whatsapp: zap, cidade: limpo(corpo.cidade, 80), uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : null,
      estoque: limpo(corpo.estoque, 40),
      cargo: cargo && cargo in CARGOS ? cargo : null,
      dificuldade: dificuldade && dificuldade in DIFICULDADES ? dificuldade : null,
      campanha: limpo(corpo.campanha, 120),
    },
  };
}

const p2 = (n: number) => String(n).padStart(2, '0');
/** "18/11 às 14h32", em Brasília. */
export function quandoFalado(agora: Date): string {
  const d = new Date(agora.getTime() - 3 * 3_600_000);
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)} às ${d.getUTCHours()}h${p2(d.getUTCMinutes())}`;
}

/** O que o CRM mostra embaixo do nome: as respostas, uma por linha. */
export function notasDoPedido(p: PedidoDoSite, agora: Date): string {
  return [
    `Pediu contato pelo site em ${quandoFalado(agora)}.`,
    p.estoque ? `Estoque: ${p.estoque}` : null,
    p.cargo ? `Cargo: ${CARGOS[p.cargo]}` : null,
    p.dificuldade ? `O que mais toma tempo: ${DIFICULDADES[p.dificuldade]}` : null,
    p.campanha ? `Campanha: ${p.campanha}` : null,
  ].filter(Boolean).join('\n');
}

/* ── limites da porta pública (27/11/2026) ─────────────────────────── */

/** Envios do formulário por IP em uma hora. Contam os que criam e os que atualizam card. */
export const TETO_POR_IP_HORA = 5;
/** Rede de segurança: envios do formulário, somando todos os IPs, em uma hora. */
export const TETO_GLOBAL_HORA = 200;
/** Anotações de um card acima disso: o formulário para de anexar (o card continua lá). */
export const TETO_NOTAS = 4000;
/** Quantas vezes o formulário anexa no mesmo card por dia. */
export const ANEXOS_POR_DIA = 3;
/** Quantas vezes o formulário reabre um card "perdido" por dia. */
export const REABRIR_POR_DIA = 1;

/**
 * O IP de quem bateu na porta: cf-connecting-ip (o Cloudflare escreve) ou o primeiro de
 * x-forwarded-for. IPv6 conta pelo /64, que é o que um aparelho costuma ter inteiro.
 * Sem nenhum dos dois, todos caem no mesmo balde ("sem-ip"), que é o lado seguro.
 */
export function ipDoPedido(cabecalhos: { get(nome: string): string | null }): string {
  const bruto = (cabecalhos.get('cf-connecting-ip') || cabecalhos.get('x-forwarded-for')?.split(',')[0] || '').trim().toLowerCase();
  if (!bruto || bruto.length > 64 || !/^[0-9a-f.:]+$/.test(bruto)) return 'sem-ip';
  if (!bruto.includes(':')) return bruto;
  const mapeado = bruto.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapeado) return mapeado[1];
  const [esq, dir = ''] = bruto.split('::');
  const a = esq ? esq.split(':') : [], b = bruto.includes('::') && dir ? dir.split(':') : [];
  const blocos = bruto.includes('::') ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
  return blocos.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/** O começo da janela de contagem: a hora cheia, ou a meia-noite de Brasília (UTC-3). */
export function janelaDe(agora: Date, tamanho: 'hora' | 'dia'): string {
  if (tamanho === 'hora') return new Date(Math.floor(agora.getTime() / 3_600_000) * 3_600_000).toISOString();
  const brasilia = new Date(agora.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(brasilia.getUTCFullYear(), brasilia.getUTCMonth(), brasilia.getUTCDate(), 3)).toISOString();
}

/** O total já conta o pedido de agora: passa quando é maior que o teto. */
export const passouDoTeto = (total: number, teto: number) => total > teto;

/**
 * O mesmo WhatsApp mandou o formulário de novo. Anexa no card só se as anotações ainda cabem e
 * se não passou dos anexos do dia; reabre "perdido" só uma vez por dia.
 * `anexosHoje` e `reaberturasHoje` já contam este pedido.
 */
export function oQueFazerNoCard(c: { notas: string | null; stage: string; anexosHoje: number; reaberturasHoje: number }) {
  return {
    anexar: (c.notas?.length ?? 0) < TETO_NOTAS && !passouDoTeto(c.anexosHoje, ANEXOS_POR_DIA),
    reabrir: c.stage === 'perdido' && !passouDoTeto(c.reaberturasHoje, REABRIR_POR_DIA),
  };
}

/** Anotação nova embaixo das que já existem; se já passou do teto, fica como estava. */
export function anexarNota(notas: string | null, nova: string): string {
  if ((notas?.length ?? 0) >= TETO_NOTAS) return notas ?? '';
  return [notas, nova].filter(Boolean).join('\n');
}
