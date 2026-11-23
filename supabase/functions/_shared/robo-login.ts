import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import type { Navegador } from './cdp.ts';
import { LER_TELA } from './robo-dns.ts';

/**
 * O login pelo pop-up (23/11/2026, pedido do dono: "igual ao Lovable — um pop-up com a
 * logo, campo de texto normal, sem abrir a tela do Registro.br").
 *
 * O cliente digita usuário e senha no nosso pop-up; o robô os digita no painel de verdade.
 * A IA só aponta QUAIS campos são (número do elemento) e lê a situação da tela; ela NUNCA
 * recebe a senha nem o código. Quem digita é o código.
 *
 * Captcha ou tela que o robô não entende: devolve 'janela' e a página mostra o painel ao
 * vivo para o cliente terminar ali (nunca se resolve captcha por ele).
 */

export type Situacao =
  | { tipo: 'logado' }
  | { tipo: 'codigo'; mensagem: string }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'janela'; mensagem: string };

type Tela = { url: string; titulo: string; texto: string; temSenha: boolean; elementos: { n: number; tag: string; tipo: string; texto: string; valor?: string; x: number; y: number }[] };

const LER = {
  name: 'ler_login',
  description: 'Diz em que ponto do login a tela está e quais elementos usar (pelo número).',
  input_schema: {
    type: 'object',
    properties: {
      situacao: { type: 'string', enum: ['formulario', 'pede_codigo', 'logado', 'erro_login', 'captcha', 'carregando', 'outra'], description: 'formulario = pede usuário e/ou senha; pede_codigo = código de verificação/2FA/token/chave de acesso; logado = já está dentro do painel/área do cliente; erro_login = mostra erro de usuário ou senha; captcha = desafio "não sou robô" que exige ação humana; carregando = ainda carregando.' },
      usuario: { type: 'integer', description: 'campo do usuário/e-mail/CPF/código, se visível' },
      senha: { type: 'integer', description: 'campo de senha, se visível' },
      codigo: { type: 'integer', description: 'campo do código de verificação, se visível' },
      botao: { type: 'integer', description: 'botão para enviar/entrar/avançar/continuar' },
      abrir_login: { type: 'integer', description: 'se a tela é a página inicial e não tem formulário: o link/botão "Entrar"/"Acessar conta"/"Área do cliente"' },
      mensagem: { type: 'string', description: 'erro ou pedido mostrado na tela, em português, curto' },
    },
    required: ['situacao'],
  },
} as const;

let cliente: Anthropic | null = null;
const ia = () => (cliente ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }));
const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function lerSituacao(nav: Navegador, provedor: string | null) {
  const tela = await nav.avaliar<Tela>(LER_TELA);
  const foto = await nav.foto();
  const lista = tela.elementos.map((e) => `[${e.n}] ${e.tag}${e.tipo ? `(${e.tipo})` : ''} "${e.texto}"${e.valor ? ` valor="${e.valor}"` : ''}`).join('\n');
  const r = await ia().messages.create({
    model: Deno.env.get('ROBO_DNS_MODELO') ?? 'claude-opus-5-5',
    max_tokens: 600,
    system: `Você olha a tela de login de um painel de domínio${provedor ? ` (${provedor})` : ''} e diz em que ponto o login está, apontando os elementos pelo número. Não invente números. Sempre responda chamando a ferramenta ler_login.`,
    tools: [LER],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: foto } },
      { type: 'text', text: `Endereço: ${tela.url}\nTítulo: ${tela.titulo}\nElementos:\n${lista}\n\nTexto:\n${tela.texto.slice(0, 2500)}` },
    ] }],
  // deno-lint-ignore no-explicit-any
  } as any);
  // deno-lint-ignore no-explicit-any
  const uso = (r.content as any[]).find((b) => b.type === 'tool_use');
  return { tela, s: (uso?.input ?? { situacao: 'outra' }) as Record<string, unknown> };
}

async function digitar(nav: Navegador, n: number, texto: string) {
  const pos = await nav.avaliar<{ x: number; y: number } | null>(`(() => { const el = document.querySelector('[data-robo="${n}"]'); if (!el) return null; el.scrollIntoView({block:'center'}); el.focus(); const r = el.getBoundingClientRect(); if ('value' in el) { const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set; s ? s.call(el, '') : (el.value = ''); el.dispatchEvent(new Event('input', { bubbles: true })); } return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!pos) throw new Error('campo sumiu');
  await nav.clicarEm(pos.x, pos.y);
  await nav.escrever(texto);
  await nav.avaliar(`(() => { const el = document.querySelector('[data-robo="${n}"]'); if (el) { el.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
}

async function clicar(nav: Navegador, n: number) {
  const pos = await nav.avaliar<{ x: number; y: number } | null>(`(() => { const el = document.querySelector('[data-robo="${n}"]'); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (pos) await nav.clicarEm(pos.x, pos.y);
}

const logadoPeloEndereco = async (nav: Navegador) => {
  const t = await nav.avaliar<{ senha: boolean; url: string }>(`({ senha: !!document.querySelector('input[type=password]'), url: location.href })`).catch(() => null);
  return !!t && /^https?:/.test(t.url) && !t.senha && !/login|signin|sign-in|entrar|acessar|auth|sso\.|account\/log/i.test(t.url);
};

/** Entra com usuário e senha. Devolve onde parou. */
export async function entrar(nav: Navegador, provedor: string | null, usuario: string, senha: string): Promise<Situacao> {
  let usouUsuario = false, usouSenha = false;
  for (let i = 0; i < 6; i++) {
    await nav.seguirAbaNova().catch(() => false);
    const { s } = await lerSituacao(nav, provedor);
    const sit = String(s.situacao);
    if (sit === 'logado') return { tipo: 'logado' };
    if (sit === 'pede_codigo') return { tipo: 'codigo', mensagem: String(s.mensagem ?? 'Digite o código de verificação.') };
    if (sit === 'erro_login') return { tipo: 'erro', mensagem: String(s.mensagem ?? 'Usuário ou senha não conferem.') };
    if (sit === 'captcha') return { tipo: 'janela', mensagem: 'O painel pediu a verificação "não sou robô". Termine o acesso na janela abaixo.' };
    if (sit === 'carregando') { await pausa(2500); continue; }
    if (sit === 'formulario') {
      if (typeof s.usuario === 'number' && !usouUsuario) { await digitar(nav, s.usuario, usuario); usouUsuario = true; }
      if (typeof s.senha === 'number' && !usouSenha) { await digitar(nav, s.senha, senha); usouSenha = true; }
      else if (typeof s.senha === 'number' && usouSenha) return { tipo: 'erro', mensagem: String(s.mensagem ?? 'Usuário ou senha não conferem.') };
      if (typeof s.botao === 'number') await clicar(nav, s.botao); else await nav.tecla('Enter');
      await pausa(4000);
      if (await logadoPeloEndereco(nav)) { await pausa(1500); return { tipo: 'logado' }; }
      continue;
    }
    if (typeof s.abrir_login === 'number') { await clicar(nav, s.abrir_login); await pausa(3000); continue; }
    break;
  }
  return { tipo: 'janela', mensagem: 'Não reconheci a tela de acesso. Termine o acesso na janela abaixo.' };
}

/** Informa o código de verificação (2FA). */
export async function informarCodigo(nav: Navegador, provedor: string | null, codigo: string): Promise<Situacao> {
  for (let i = 0; i < 4; i++) {
    await nav.seguirAbaNova().catch(() => false);
    const { s } = await lerSituacao(nav, provedor);
    const sit = String(s.situacao);
    if (sit === 'logado') return { tipo: 'logado' };
    if (sit === 'erro_login') return { tipo: 'codigo', mensagem: String(s.mensagem ?? 'Código não conferiu. Digite de novo.') };
    if (sit === 'carregando') { await pausa(2500); continue; }
    if (sit === 'pede_codigo' && typeof s.codigo === 'number') {
      await digitar(nav, s.codigo, codigo);
      if (typeof s.botao === 'number') await clicar(nav, s.botao); else await nav.tecla('Enter');
      await pausa(5000);
      if (await logadoPeloEndereco(nav)) return { tipo: 'logado' };
      /* Depois do código o Registro.br às vezes deixa a aba em branco: o login já valeu. */
      const url = await nav.avaliar<string>('location.href').catch(() => '');
      if (!/^https?:/.test(url)) return { tipo: 'logado' };
      const { s: depois } = await lerSituacao(nav, provedor);
      if (depois.situacao === 'logado') return { tipo: 'logado' };
      if (depois.situacao === 'pede_codigo' || depois.situacao === 'erro_login') return { tipo: 'codigo', mensagem: String(depois.mensagem ?? 'Código não conferiu. Digite de novo.') };
      return { tipo: 'logado' };
    }
    break;
  }
  return { tipo: 'janela', mensagem: 'Não achei onde colocar o código. Termine o acesso na janela abaixo.' };
}
