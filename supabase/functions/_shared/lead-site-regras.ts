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

/** Quantos pedidos do site cabem em uma hora antes de a porta fechar (proteção contra enxurrada). */
export const TETO_POR_HORA = 40;
