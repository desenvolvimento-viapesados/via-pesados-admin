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
export function escolherModelo(anuncio: string, ano: number | null, modelos: ModeloFipe[]): ModeloFipe | null {
  const numerosDoAnuncio = pedacos(anuncio).filter((p) => /^\d{3,}$/.test(p));
  if (!numerosDoAnuncio.length) return null;
  let melhor: { m: ModeloFipe; n: number } | null = null;
  for (const m of modelos) {
    const f = pedacos(m.nome.replace(/\(.*?\)/g, ' '));
    if (!f.some((p) => numerosDoAnuncio.includes(p))) continue;
    let n = nota(anuncio, m.nome);
    const e6 = /\(E6\)/i.test(m.nome), e5 = /\(E5\)/i.test(m.nome);
    if (ano && ano >= 2023 && e6) n += 0.5;
    if (ano && ano < 2023 && e5) n += 0.5;
    if (!melhor || n > melhor.n) melhor = { m, n };
  }
  return melhor && melhor.n >= 3 ? melhor.m : null;
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

/** Endereço de site digitado de qualquer jeito → URL https. null se não parece site. */
export function enderecoDoSite(v: unknown): string | null {
  let s = String(v ?? '').trim();
  if (!s || /\s/.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (!/\./.test(u.hostname) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) return null;
    return u.toString();
  } catch { return null; }
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
