/**
 * Ferramenta FIPE grátis (dono, 24/11/2026): "qual a melhor oferta do meu estoque em comparação à FIPE"
 * e "quanto um caminhão está desvalorizando". Antes de usar, pede o nome da loja e o WhatsApp.
 *
 * Aqui só as regras, puras, para testar sem rede (src/lib/fipe.test.ts):
 *   - casar o caminhão anunciado no site da loja com o modelo da Tabela FIPE;
 *   - ler preço em reais;
 *   - montar as contas (diferença para a FIPE, queda em 12 meses, por dia, em 90 dias).
 */

/** O nome da marca como a FIPE escreve (caminhões, codigoTipoVeiculo 3). */
const MARCAS: Record<string, string> = {
  vw: 'VOLKSWAGEN', volkswagen: 'VOLKSWAGEN', volks: 'VOLKSWAGEN',
  mercedes: 'MERCEDES-BENZ', 'mercedes-benz': 'MERCEDES-BENZ', mercedesbenz: 'MERCEDES-BENZ', mb: 'MERCEDES-BENZ',
  scania: 'SCANIA', volvo: 'VOLVO', iveco: 'IVECO', daf: 'DAF', ford: 'FORD', man: 'MAN',
  international: 'NAVISTAR', navistar: 'NAVISTAR', agrale: 'AGRALE', hyundai: 'HYUNDAI', foton: 'FOTON',
  sinotruk: 'SINOTRUK', shacman: 'SHACMAN', jac: 'JAC', gm: 'CHEVROLET', chevrolet: 'CHEVROLET',
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "Mercedes Benz" → "MERCEDES-BENZ"; desconhecida → em maiúsculas, como veio. */
export function marcaFipe(marca: string | null | undefined): string | null {
  const t = semAcento(String(marca ?? '')).toLowerCase().trim();
  if (!t) return null;
  const chave = t.replace(/\s+/g, '-');
  return MARCAS[chave] ?? MARCAS[t.split(/[\s-]+/)[0]] ?? t.toUpperCase();
}

/**
 * Pedaços que identificam o modelo: "FH-540 6x4" → ["fh", "540", "6x4"]; "24.280" e "24-280" → "24280".
 * Tração (6x4) é um pedaço só, para "6x4" não casar com "4x2".
 */
export function pedacos(texto: string | null | undefined): string[] {
  let s = semAcento(String(texto ?? '')).toLowerCase();
  s = s.replace(/(\d)\s*[.\-/]\s*(\d)/g, '$1$2');
  s = s.replace(/(\d)\s*x\s*(\d)/g, ' $1x$2 ');
  s = s.replace(/(?<!\d)([a-z]+)-?(\d)/g, '$1 $2');
  const out = s.match(/\d+x\d+|[a-z]+|\d+/g) ?? [];
  const ruido = new Set(['diesel', 'p', 'e', 'cab', 'cabine', 'cavalo', 'mecanico', 'caminhao', 'trucado', 'traçado', 'tracado', 'toco']);
  return out.filter((x) => !ruido.has(x));
}

/** Quanto o nome da FIPE combina com o anúncio. Número que a FIPE tem e o anúncio não tem tira ponto. */
export function nota(anuncio: string, modeloFipe: string): number {
  const a = new Set(pedacos(anuncio));
  const f = pedacos(modeloFipe.replace(/\(.*?\)/g, ' '));
  let n = 0;
  for (const p of f) {
    const numero = /^\d/.test(p);
    if (a.has(p)) n += /x/.test(p) ? 2 : numero ? 3 : 1;
    else if (numero && !/x/.test(p) && p.length >= 3) n -= 2;
  }
  return n;
}

export type ModeloFipe = { codigo: string; nome: string };

/**
 * O modelo da FIPE para o anúncio. Exige casar pelo menos um número de modelo (540, 2651, 24280):
 * sem número, "Scania" casaria com qualquer Scania. Empate: Euro 6 a partir de 2023, Euro 5 antes.
 */
export function candidatosDoModelo(anuncio: string, ano: number | null, modelos: ModeloFipe[]): ModeloFipe[] {
  const numerosDoAnuncio = pedacos(anuncio).filter((p) => /^\d{3,}$/.test(p));
  if (!numerosDoAnuncio.length) return [];
  const notas: { m: ModeloFipe; n: number }[] = [];
  for (const m of modelos) {
    const f = pedacos(m.nome.replace(/\(.*?\)/g, ' '));
    if (!f.some((p) => numerosDoAnuncio.includes(p))) continue;
    let n = nota(anuncio, m.nome);
    const e6 = /\(E6\)/i.test(m.nome), e5 = /\(E5\)/i.test(m.nome);
    if (ano && ano >= 2023 && e6) n += 0.5;
    if (ano && ano < 2023 && e5) n += 0.5;
    if (n >= 3) notas.push({ m, n });
  }
  return notas.sort((a, b) => b.n - a.n).map((x) => x.m);
}

/** O melhor candidato (o primeiro da lista). Quem consulta a FIPE tenta os seguintes se o ano não existir. */
export const escolherModelo = (anuncio: string, ano: number | null, modelos: ModeloFipe[]): ModeloFipe | null =>
  candidatosDoModelo(anuncio, ano, modelos)[0] ?? null;

/**
 * Preço longe demais da FIPE quase sempre é entrada, parcela ou erro do anúncio ("financiado, R$ 64 mil"):
 * não serve para dizer se é boa oferta.
 */
export const precoPlausivel = (preco: number, fipe: number) => preco >= fipe * 0.5 && preco <= fipe * 1.6;

/** O mesmo caminhão listado duas vezes na página (destaque e lista): fica um. */
export function semRepetidos<T extends { titulo?: unknown; modelo?: unknown; ano?: unknown; preco?: unknown }>(lista: T[]): T[] {
  const vistos = new Set<string>();
  return lista.filter((c) => {
    const k = [pedacos(`${c.modelo ?? ''}`).filter((p) => /\d/.test(p)).join(' '), anoDoModelo(c.ano), precoEmReais(c.preco) ?? String(c.titulo ?? '')].join('|');
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  });
}

/** "R$ 729.000,00", "729000", "729.000" → 729000. Fora de R$ 20 mil a R$ 5 mi não é preço de caminhão. */
export function precoEmReais(v: unknown): number | null {
  if (typeof v === 'number') return v >= 20_000 && v <= 5_000_000 ? Math.round(v) : null;
  const s = String(v ?? '').replace(/[^\d,.]/g, '');
  if (!s) return null;
  const n = Number(s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 20_000 && n <= 5_000_000 ? Math.round(n) : null;
}

/** "R$ 561.088,00" (como a FIPE devolve) → 561088. */
export const valorFipe = (v: unknown) => precoEmReais(v);

/** Ano do modelo: "2023/2024" → 2024; fora de 1990..ano que vem → null. */
export function anoDoModelo(v: unknown, agora = new Date()): number | null {
  const anos = String(v ?? '').match(/(19|20)\d{2}/g)?.map(Number) ?? [];
  const a = anos.length ? Math.max(...anos) : NaN;
  return a >= 1990 && a <= agora.getFullYear() + 1 ? a : null;
}

export type Queda = { inicio: number; fim: number; perda: number; pct: number; porDia: number; em90: number };

/** A queda entre dois valores da FIPE, num ano: perda, porcentagem, por dia e em 90 dias. */
export function queda(inicio: number, fim: number): Queda {
  const perda = inicio - fim;
  const porDia = perda / 365;
  return { inicio, fim, perda, pct: inicio ? (perda / inicio) * 100 : 0, porDia, em90: porDia * 90 };
}

export type Oferta = { titulo: string; ano: number; preco: number; fipe: number; diferenca: number; pct: number };

/** Da melhor oferta (mais abaixo da FIPE) à pior. */
export function ordenarOfertas(lista: Oferta[]): Oferta[] {
  return [...lista].sort((a, b) => a.diferenca - b.diferenca);
}

export const oferta = (titulo: string, ano: number, preco: number, fipe: number): Oferta =>
  ({ titulo, ano, preco, fipe, diferenca: preco - fipe, pct: fipe ? ((preco - fipe) / fipe) * 100 : 0 });

/**
 * Endereço de site digitado de qualquer jeito → URL https. null se não parece site.
 * Só http/https na porta padrão, sem usuário/senha e sem IP de rede interna escrito direto.
 * O nome ainda precisa passar por destinoSeguro (que resolve o DNS) antes de abrir.
 */
export function enderecoDoSite(v: unknown): string | null {
  let s = String(v ?? '').trim();
  if (!s || /\s/.test(s) || s.length > 2000) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (!enderecoAceito(u)) return null;
    if (!/\./.test(u.hostname) && !u.hostname.startsWith('[')) return null;
    return u.toString();
  } catch { return null; }
}

/** Esquema, porta, credencial e nome que a ferramenta aceita abrir (antes de olhar o DNS). */
function enderecoAceito(u: URL): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.port !== '' || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h || h === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(h)) return false;
  const ip = ipDoNome(h);
  return !(ip && ipProibido(ip));
}

/** O IP escrito direto no endereço ("10.0.0.1", "[::1]"); null quando é nome. */
function ipDoNome(h: string): string | null {
  if (h.startsWith('[') && h.endsWith(']')) return h.slice(1, -1);
  return /^\d+\.\d+\.\d+\.\d+$/.test(h) ? h : null;
}

const IPV4_PROIBIDOS: [number, number][] = [
  // [rede, tamanho do prefixo]
  [0x00000000, 8],    // 0.0.0.0/8 ("esta rede")
  [0x0a000000, 8],    // 10.0.0.0/8 privada
  [0x64400000, 10],   // 100.64.0.0/10 CGNAT
  [0x7f000000, 8],    // 127.0.0.0/8 loopback
  [0xa9fe0000, 16],   // 169.254.0.0/16 link-local (metadados de nuvem)
  [0xac100000, 12],   // 172.16.0.0/12 privada
  [0xc0000000, 24],   // 192.0.0.0/24 protocolos
  [0xc0000200, 24],   // 192.0.2.0/24 documentação
  [0xc0586300, 24],   // 192.88.99.0/24 relay 6to4
  [0xc0a80000, 16],   // 192.168.0.0/16 privada
  [0xc6120000, 15],   // 198.18.0.0/15 testes
  [0xc6336400, 24],   // 198.51.100.0/24 documentação
  [0xcb007100, 24],   // 203.0.113.0/24 documentação
  [0xe0000000, 4],    // 224.0.0.0/4 multicast
  [0xf0000000, 4],    // 240.0.0.0/4 reservada e 255.255.255.255
];

function ipv4EmNumero(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((n, x) => n * 256 + Number(x), 0);
}

/** IPv6 em 8 blocos de 16 bits (aceita "::" e IPv4 no fim). null se não é IPv6. */
function ipv6EmBlocos(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/%.*$/, '');
  const v4 = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = ipv4EmNumero(v4[2]);
    if (n === null) return null;
    s = v4[1] + (n >>> 16).toString(16) + ':' + (n & 0xffff).toString(16);
  }
  const partes = s.split('::');
  if (partes.length > 2) return null;
  const esq = partes[0] ? partes[0].split(':') : [];
  const dir = partes.length === 2 && partes[1] ? partes[1].split(':') : [];
  const faltam = 8 - esq.length - dir.length;
  if (partes.length === 1 ? esq.length !== 8 : faltam < 1) return null;
  const blocos = [...esq, ...Array(partes.length === 2 ? faltam : 0).fill('0'), ...dir];
  if (blocos.some((b) => !/^[0-9a-f]{1,4}$/.test(b))) return null;
  return blocos.map((b) => parseInt(b, 16));
}

/**
 * IP que a ferramenta nunca abre: privada, loopback, link-local, CGNAT, multicast, reservada,
 * documentação, 0.0.0.0; no IPv6 também ::, ::1, fc00::/7, fe80::/10, ff00::/8, IPv4-mapeado
 * (::ffff:x) e os que carregam um IPv4 dentro (64:ff9b::/96, 2002::/16) quando ele é proibido.
 * O que não dá para ler como IP também é proibido.
 */
export function ipProibido(ip: string): boolean {
  const v4 = ipv4EmNumero(ip);
  if (v4 !== null) return IPV4_PROIBIDOS.some(([rede, bits]) => (v4 >>> (32 - bits)) === (rede >>> (32 - bits)));
  const b = ipv6EmBlocos(ip);
  if (!b) return true;
  const zerosAte = (n: number) => b.slice(0, n).every((x) => x === 0);
  if (zerosAte(6)) return true;                                       // ::, ::1 e IPv4-compatível (::a.b.c.d)
  if (zerosAte(5) && b[5] === 0xffff) return true;                    // ::ffff:a.b.c.d (IPv4-mapeado)
  if ((b[0] & 0xfe00) === 0xfc00) return true;                        // fc00::/7 local única
  if ((b[0] & 0xffc0) === 0xfe80 || (b[0] & 0xffc0) === 0xfec0) return true; // fe80::/10 e fec0::/10
  if ((b[0] & 0xff00) === 0xff00) return true;                        // ff00::/8 multicast
  if (b[0] === 0x2001 && b[1] === 0x0db8) return true;                // 2001:db8::/32 documentação
  if (b[0] === 0x0064 && b[1] === 0xff9b) return ipProibido(v4DosBlocos(b[6], b[7])); // NAT64
  if (b[0] === 0x2002) return ipProibido(v4DosBlocos(b[1], b[2]));    // 6to4
  return false;
}
const v4DosBlocos = (alto: number, baixo: number) => [alto >> 8, alto & 0xff, baixo >> 8, baixo & 0xff].join('.');

/** Quem resolve o nome: na função é o Deno.resolveDns; nos testes, um de mentira. */
export type Resolvedor = (nome: string, tipo: 'A' | 'AAAA') => Promise<string[]>;

/**
 * O endereço pode ser aberto? Confere esquema, porta e nome, resolve o nome (A e AAAA) e recusa se
 * QUALQUER IP for de rede interna, ou se o nome não resolver. Vale para o primeiro endereço e para
 * cada redirecionamento.
 */
export async function destinoSeguro(url: string, resolver: Resolvedor): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (!enderecoAceito(u)) return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (ipDoNome(h)) return true; // IP escrito direto já passou por enderecoAceito
  const [a, aaaa] = await Promise.all([
    resolver(h, 'A').catch(() => [] as string[]),
    resolver(h, 'AAAA').catch(() => [] as string[]),
  ]);
  const ips = [...a, ...aaaa];
  return ips.length > 0 && !ips.some(ipProibido);
}

/** Texto limpo da página para a IA ler: sem script, estilo e tags; corta no tamanho. */
export function textoDaPagina(html: string, max = 60_000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/a)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;|&dollar;/g, '$')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n')
    .trim().slice(0, max);
}

/**
 * Cavalo mecânico ou caminhão (dono, 24/11/2026: "sempre separe a análise de cavalos mecânicos e caminhão…
 * a diferença é grande"). Vale o que a IA leu no anúncio; sem isso, o texto do anúncio decide.
 */
export function tipoDoVeiculo(lido: unknown, texto: string): 'cavalo' | 'caminhao' {
  const l = semAcento(String(lido ?? '')).toLowerCase();
  if (l.startsWith('cavalo')) return 'cavalo';
  if (l.startsWith('caminhao')) return 'caminhao';
  return /cavalo|tractor|trator/i.test(semAcento(texto)) ? 'cavalo' : 'caminhao';
}
