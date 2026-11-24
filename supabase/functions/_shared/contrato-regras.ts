/**
 * O contrato de assinatura dentro do link de boas-vindas (dono, 18/11/2026: "mando o contrato
 * de alguma forma… quero isso organizado"). O cliente confere os dados, lê e aceita antes de
 * pagar; é o que a Cláusula 15 já descreve: aceite registrado a partir de link exclusivo
 * enviado ao WhatsApp, com versão, código de integridade, data e hora, IP e dispositivo.
 *
 * Aqui só as regras, puras (testadas em src/lib/contrato.test.ts): conferir CPF e CNPJ,
 * escrever valor e data por extenso, preencher o texto e quebrá-lo em blocos para a página.
 * O TEXTO do contrato não é escrito aqui: vem de docs/contrato (contrato-texto.ts é cópia).
 */

export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export function cpfValido(v: unknown): boolean {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (ate: number) => {
    let s = 0;
    for (let i = 0; i < ate; i++) s += Number(d[i]) * (ate + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(v: unknown): boolean {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (ate: number) => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((t, p, i) => t + p * Number(d[i]), 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export const mascaraCpf = (v: unknown) => soDigitos(v).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
export const mascaraCnpj = (v: unknown) => soDigitos(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

/* ── por extenso ─────────────────────────────────────────────────── */

const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n === 100) return 'cem';
  const p: string[] = [];
  if (n >= 100) { p.push(C[Math.floor(n / 100)]); n %= 100; }
  if (n >= 20) { const u = n % 10; p.push(u ? `${D[Math.floor(n / 10)]} e ${U[u]}` : D[Math.floor(n / 10)]); }
  else if (n > 0 || !p.length) p.push(U[n]);
  return p.join(' e ');
}

function inteiroPorExtenso(n: number): string {
  if (n < 1000) return ate999(n);
  const mil = Math.floor(n / 1000), resto = n % 1000;
  const m = mil === 1 ? 'mil' : `${ate999(mil)} mil`;
  if (!resto) return m;
  return m + (resto < 100 || resto % 100 === 0 ? ' e ' : ' ') + ate999(resto);
}

/** 437 → "quatrocentos e trinta e sete reais"; 437.5 → "… reais e cinquenta centavos". Até 999.999,99. */
export function valorPorExtenso(valor: number): string {
  const c = Math.round(valor * 100);
  const r = Math.floor(c / 100), ct = c % 100;
  const reais = r === 1 ? 'um real' : `${inteiroPorExtenso(r)} reais`;
  if (!ct) return reais;
  const centavos = ct === 1 ? 'um centavo' : `${ate999(ct)} centavos`;
  return r ? `${reais} e ${centavos}` : centavos;
}

/** 437 → "437,00". */
export const valorEmReais = (valor: number) =>
  valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const emBrasilia = (d: Date) => new Date(d.getTime() - 3 * 3_600_000);
/** "18 de novembro de 2026", em Brasília. */
export function dataPorExtenso(d: Date): string {
  const b = emBrasilia(d);
  return `${b.getUTCDate()} de ${MESES[b.getUTCMonth()]} de ${b.getUTCFullYear()}`;
}
/** "18/11/2026 às 14h32", em Brasília. */
export function dataEHora(d: Date): string {
  const b = emBrasilia(d), p = (n: number) => String(n).padStart(2, '0');
  return `${p(b.getUTCDate())}/${p(b.getUTCMonth() + 1)}/${b.getUTCFullYear()} às ${b.getUTCHours()}h${p(b.getUTCMinutes())}`;
}

/* ── os dados de quem assina ─────────────────────────────────────── */

export type DadosDoContrato = {
  razao_social: string; cnpj: string; endereco: string; representante_nome: string; representante_cpf: string;
};

const limpo = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Junta o que o cliente digitou com o que já estava no cadastro (o que ele digita vale) e confere.
 * O CPF nunca volta para a página: se já existe no cadastro e ele não digitou outro, vale o guardado.
 */
export function lerDadosDoContrato(
  digitado: Record<string, unknown> | null | undefined, guardado: Partial<DadosDoContrato>,
): { ok: true; dados: DadosDoContrato } | { ok: false; erro: string } {
  const x = digitado ?? {};
  const de = (k: keyof DadosDoContrato, max: number) => limpo(x[k], max) || limpo(guardado[k], max);
  const dados: DadosDoContrato = {
    razao_social: de('razao_social', 160), cnpj: soDigitos(de('cnpj', 20)), endereco: de('endereco', 240),
    representante_nome: de('representante_nome', 120), representante_cpf: soDigitos(de('representante_cpf', 20)),
  };
  if (dados.razao_social.length < 3) return { ok: false, erro: 'Informe a razão social da empresa.' };
  if (!cnpjValido(dados.cnpj)) return { ok: false, erro: 'Confira o CNPJ: o número não é válido.' };
  if (dados.endereco.length < 8) return { ok: false, erro: 'Informe o endereço completo da empresa.' };
  if (dados.representante_nome.split(' ').length < 2) return { ok: false, erro: 'Informe o nome completo de quem aceita.' };
  if (!cpfValido(dados.representante_cpf)) return { ok: false, erro: 'Confira o CPF de quem aceita: o número não é válido.' };
  return { ok: true, dados };
}

/* ── o texto ─────────────────────────────────────────────────────── */

export type CamposDoContrato = DadosDoContrato & {
  valor: number;
  /** O dia do vencimento, quando a implantação já aconteceu. */
  dia_vencimento: number | null;
  data: Date;
  whatsapp: string;
  /** Só existe depois do aceite. */
  registro: string | null;
};

/** O contrato com os dados no lugar dos `{{campos}}`. A nota de minuta do topo sai. */
export function preencherContrato(modelo: string, c: CamposDoContrato): string {
  const valores: Record<string, string> = {
    razao_social: c.razao_social, cnpj: mascaraCnpj(c.cnpj), endereco: c.endereco,
    representante_nome: c.representante_nome, representante_cpf: mascaraCpf(c.representante_cpf),
    valor_mensal: valorEmReais(c.valor), valor_extenso: valorPorExtenso(c.valor),
    dia_vencimento: c.dia_vencimento ? String(c.dia_vencimento) : 'a definir',
    data_aceite: dataPorExtenso(c.data), whatsapp_assinatura: c.whatsapp,
    registro_aceite: c.registro ?? 'gerado no momento do aceite',
  };
  return modelo
    .split('\n').filter((l) => !/^\*Minuta v\d+/.test(l.trim())).join('\n')
    .replace(/`?\{\{(\w+)\}\}`?/g, (tudo, k: string) => (k in valores ? valores[k] : tudo))
    .replace(/\n{3,}/g, '\n\n');
}

/** O registro do aceite, como a Cláusula 15.2 pede. */
export function registroDoAceite(x: { versao: string; hash: string; quando: Date; ip: string | null; dispositivo: string | null }): string {
  return [
    `versão ${x.versao}`, `código de integridade (SHA-256) ${x.hash}`, dataEHora(x.quando),
    `IP ${x.ip || 'não informado'}`, `dispositivo ${limpo(x.dispositivo, 180) || 'não informado'}`,
  ].join('; ');
}

/** SHA-256 em hexadecimal (funciona no Deno e no Node). */
export async function sha256(texto: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── para a página ───────────────────────────────────────────────── */

export type Bloco =
  | { t: 'titulo' | 'secao' | 'p' | 'item'; texto: string }
  | { t: 'linha'; rotulo: string; texto: string };

const semMarcas = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[^*])\*([^*]+)\*/g, '$1$2').replace(/`/g, '').trim();

/**
 * O contrato em blocos simples, para a página desenhar sem interpretar HTML: título, seções,
 * parágrafos, itens e as linhas do quadro-resumo. O negrito do meio do texto sai.
 */
export function emBlocos(md: string): Bloco[] {
  const blocos: Bloco[] = [];
  for (const bruta of md.split('\n')) {
    const l = bruta.trim();
    if (!l || /^-{3,}$/.test(l)) continue;
    if (l.startsWith('|')) {
      const cel = l.split('|').slice(1, -1).map((c) => semMarcas(c));
      if (cel.length < 2 || cel.every((c) => !c || /^-+$/.test(c))) continue;
      blocos.push({ t: 'linha', rotulo: cel[0], texto: cel.slice(1).join(' ') });
    } else if (/^#\s/.test(l)) blocos.push({ t: 'titulo', texto: semMarcas(l.replace(/^#\s+/, '')) });
    else if (/^#{2,}\s/.test(l)) blocos.push({ t: 'secao', texto: semMarcas(l.replace(/^#+\s+/, '')) });
    else if (/^[-*]\s/.test(l)) blocos.push({ t: 'item', texto: semMarcas(l.replace(/^[-*]\s+/, '')) });
    else blocos.push({ t: 'p', texto: semMarcas(l) });
  }
  return blocos;
}

/** Cliente novo aceita o contrato (antes ou depois de pagar). Quem já pagava antes do contrato existir na página, não. */
export const precisaAceitar = (x: { aceitoEm: string | null | undefined; jaPagou: boolean }) => !x.aceitoEm && !x.jaPagou;

/* v7 = Termos de Uso (24/11/2026, dono: "o contrato cria uma barreira"); até a v6 era o contrato. */
export const VERSAO_DO_CONTRATO = 'v7';
