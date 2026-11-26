/** Regras puras do robô de DNS (sem rede), testadas em src/lib/roboDns.test.ts. */
export type Registro = { tipo: string; nome: string; valor: string };
export type Plano = { dominio: string; provedor: string | null; apagar: Registro[]; criar: Registro[]; manter: Registro[] };
export type Passo = { quando: string; acao: string; detalhe: string };
export type Desfecho =
  | { tipo: 'feito'; resumo: string }
  | { tipo: 'precisa_cliente'; mensagem: string }
  | { tipo: 'falhou'; motivo: string };

/* Botões que o robô nunca toca, seja o que for que a IA peça. */
export const PROIBIDO = /(servidores?\s*(de\s*)?dns|alterar\s*servidor|name\s*servers?|nameservers?|transfer|renova|renew|pagamento|pagar|payment|checkout|boleto|cart[aã]o|credit\s*card|comprar|buy\b|carrinho|\bcart\b|senha|password|titular|owner|excluir\s*dom|delete\s*domain|cancel(ar)?\s*(o\s*)?dom|desbloque|unlock|dnssec|ds\s*record|autentica[cç][aã]o\s*em\s*duas|two.?factor)/i;

const semPonto = (v: string) => v.replace(/\.$/, '').toLowerCase();


/** A tela mostra os valores novos e não mostra os apagados? (conferência no código) */
export function telaConfere(texto: string, p: Plano): { ok: boolean; falta: string[]; sobra: string[] } {
  const t = texto.toLowerCase();
  const falta = p.criar.map((r) => semPonto(r.valor)).filter((v) => !t.includes(v));
  const sobra = p.apagar.map((r) => semPonto(r.valor)).filter((v) => t.includes(v));
  return { ok: falta.length === 0 && sobra.length === 0, falta, sobra };
}

export type RR = { Ownername: string; Type: string; Rdata: string };

function relativo(nome: string, dominio: string): string {
  const n = nome.toLowerCase().replace(/\.$/, '');
  if (!n || n === '@' || n.startsWith('(') || n === dominio) return '';
  return n.endsWith(`.${dominio}`) ? n.slice(0, -(dominio.length + 1)) : n;
}
const mesmo = (a: string, b: string) => a.toLowerCase().replace(/\.$/, '') === b.toLowerCase().replace(/\.$/, '');

/** O que muda na zona, a partir do que ela TEM hoje (não do que o DNS público mostra). */
export function mudancasRegistroBr(rrs: RR[], plano: Plano): { add: RR[]; remove: RR[] } {
  const d = plano.dominio;
  const criar = plano.criar.map((r) => ({ Ownername: relativo(r.nome, d), Type: r.tipo, Rdata: r.valor.replace(/\.$/, '') }));
  const nossosRaiz = criar.filter((r) => r.Ownername === '' && r.Type === 'A').map((r) => r.Rdata);
  const nossoWww = criar.find((r) => r.Ownername === 'www' && r.Type === 'CNAME')?.Rdata;
  const remove = rrs.filter((r) => {
    const nome = relativo(r.Ownername, d);
    if (nome === '' && (r.Type === 'A' || r.Type === 'AAAA' || r.Type === 'CNAME')) return !(r.Type === 'A' && nossosRaiz.some((ip) => mesmo(ip, r.Rdata)));
    if (nome === 'www' && (r.Type === 'A' || r.Type === 'AAAA' || r.Type === 'CNAME')) return !(r.Type === 'CNAME' && nossoWww && mesmo(nossoWww, r.Rdata));
    return false;
  });
  const add = criar.filter((c) => !rrs.some((r) => relativo(r.Ownername, d) === c.Ownername && r.Type === c.Type && mesmo(r.Rdata, c.Rdata)));
  return { add, remove };
}

/* Cloudflare com proxy (nuvem laranja): a internet vê os IPs da própria Cloudflare, não o
   servidor de verdade que está na zona. Então o plano não sabe o VALOR a apagar — só o nome.
   Faixas publicadas em cloudflare.com/ips (26/11/2026). */
const CF_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'];
const CF_V6 = ['2400:cb00:', '2606:4700:', '2803:f800:', '2405:b500:', '2405:8100:', '2a06:98c', '2a06:98c0:', '2c0f:f248:'];
const num = (ip: string) => ip.split('.').reduce((a, p) => a * 256 + Number(p), 0);
export function ehIpCloudflare(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v.includes(':')) return CF_V6.some((p) => v.startsWith(p));
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(v)) return false;
  return CF_V4.some((faixa) => {
    const [base, bits] = faixa.split('/');
    const m = 2 ** (32 - Number(bits));
    return Math.floor(num(v) / m) === Math.floor(num(base) / m);
  });
}
/** Valor de "apagar" quando o registro está atrás do proxy: o robô apaga pelo NOME, qualquer valor. */
export const QUALQUER_VALOR = '(qualquer valor: está atrás do proxy da Cloudflare)';
