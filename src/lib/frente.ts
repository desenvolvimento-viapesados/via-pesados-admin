/**
 * Em que frente o painel está: Lojistas, Transportadoras ou Empresa.
 *
 * Decisão do dono (29/10/2026): as duas frentes moram no mesmo painel, mas
 * "completamente separados! dados nunca devem se misturar" — a não ser na
 * Empresa, onde ele vê a Via Pesados inteira.
 *
 * Quem garante a separação é o banco (migration 20261029150000_frentes):
 * cada linha tem `frente`, e as policies só mostram e gravam a frente que
 * chega no cabeçalho `x-frente`. Aqui só se decide QUAL frente vai no
 * cabeçalho — nenhuma tela precisa lembrar de filtrar.
 *
 * O cabeçalho vai SÓ nas consultas ao banco (/rest/v1/). As funções do
 * painel têm a lista de cabeçalhos permitidos fechada; um cabeçalho a mais
 * derrubaria a chamada no navegador antes de ela sair. Função que precisa
 * saber a frente recebe no corpo do pedido.
 */

export type Frente = 'lojista' | 'transportadora' | 'empresa';

export const FRENTES: { id: Frente; rotulo: string }[] = [
  { id: 'lojista', rotulo: 'Lojistas' },
  { id: 'transportadora', rotulo: 'Transportadoras' },
  { id: 'empresa', rotulo: 'Empresa' },
];

export const rotuloDaFrente = (f: Frente | string | null | undefined) =>
  f === 'transportadora' ? 'Transportadoras' : f === 'empresa' ? 'Empresa' : 'Lojistas';

export const ehFrente = (v: unknown): v is Frente =>
  v === 'lojista' || v === 'transportadora' || v === 'empresa';

const CHAVE = 'via-admin-frente';

let atual: Frente = (() => {
  try {
    const salva = typeof localStorage !== 'undefined' ? localStorage.getItem(CHAVE) : null;
    return ehFrente(salva) ? salva : 'lojista';
  } catch {
    return 'lojista';
  }
})();

/** A frente que vai no próximo pedido ao banco. */
export const frenteAtual = (): Frente => atual;

export function definirFrente(f: Frente) {
  atual = f;
  try { localStorage.setItem(CHAVE, f); } catch { /* vale só nesta aba */ }
}

const urlDe = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** Só a API de dados (PostgREST) recebe a frente — ver o comentário do topo. */
export const vaiParaOBanco = (url: string) => url.includes('/rest/v1/');

/**
 * O `fetch` do cliente supabase: o mesmo pedido, com `x-frente` quando ele
 * vai para o banco. O supabase-js manda `init.headers` às vezes como
 * objeto, às vezes como `Headers`; o `Headers` de destino aceita os dois
 * (e lista de pares), então nada do que veio se perde.
 */
export function comFrente(base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return (input, init) => {
    if (!vaiParaOBanco(urlDe(input))) return base(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('x-frente', frenteAtual());
    return base(input, { ...init, headers });
  };
}

/* As telas de uma frente. Na Empresa elas não abrem: a visão geral lê as
   duas frentes juntas, e uma lista de clientes misturada é exatamente o que
   o dono pediu para não existir. */
const DA_EMPRESA = ['/financeiro', '/metas', '/equipe', '/conselho', '/saude'];

export const abreNaEmpresa = (pathname: string) =>
  pathname === '/' || pathname === '' || DA_EMPRESA.some((r) => pathname === r || pathname.startsWith(r + '/'));
