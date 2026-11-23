import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import type { Navegador } from './cdp.ts';

/**
 * O robô que mexe no DNS do cliente (23/11/2026, pedido do dono: "construa o robô
 * inteiro, para todos os lugares onde brasileiros usam domínio").
 *
 * Não tem botão fixo por site: a cada passo ele lê a tela (foto + lista dos
 * elementos clicáveis, numerados) e a IA escolhe UMA ação. Assim serve para
 * Registro.br, GoDaddy, Hostinger, Locaweb, HostGator, KingHost, UOL Host,
 * Cloudflare e o que mais aparecer.
 *
 * Quem entra na conta é sempre o cliente, na janela ao vivo. O robô nunca digita
 * senha nem código, e as TRAVAS abaixo (no código, não só no pedido à IA) impedem
 * clique em pagamento, senha, titular, transferência e troca de servidores DNS.
 */

export type Registro = { tipo: string; nome: string; valor: string };
export type Plano = { dominio: string; provedor: string | null; apagar: Registro[]; criar: Registro[]; manter: Registro[] };

export type Passo = { quando: string; acao: string; detalhe: string };
export type Desfecho =
  | { tipo: 'feito'; resumo: string }
  | { tipo: 'precisa_cliente'; mensagem: string }
  | { tipo: 'falhou'; motivo: string };

/* Botões que o robô nunca toca, seja o que for que a IA peça. */
const PROIBIDO = /(servidores?\s*(de\s*)?dns|alterar\s*servidor|name\s*servers?|nameservers?|transfer|renova|renew|pagamento|pagar|payment|checkout|boleto|cart[aã]o|credit\s*card|comprar|buy|carrinho|cart\b|senha|password|titular|owner|contato|contact|excluir\s*dom|delete\s*domain|cancel(ar)?\s*(o\s*)?dom|desbloque|unlock|dnssec|2fa|autentica[cç][aã]o\s*em\s*duas)/i;

/* Lê a tela: elementos visíveis e clicáveis, numerados, com o rótulo que a pessoa vê. */
const LER_TELA = `(() => {
  const out = []; let n = 0;
  const visivel = (el, r) => r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
    && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  const rotulo = (el) => {
    const t = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '').replace(/\\s+/g, ' ').trim();
    if (t) return t.slice(0, 90);
    if (el.id) { const l = el.ownerDocument.querySelector('label[for="' + el.id + '"]'); if (l) return l.innerText.trim().slice(0, 90); }
    return '';
  };
  const varrer = (doc, dx, dy) => {
    const sel = 'a,button,input,select,textarea,[role=button],[role=link],[role=menuitem],[role=tab],[role=option],[role=checkbox],[role=radio],[onclick],[contenteditable=true],summary,label,li[tabindex],div[tabindex],span[tabindex]';
    for (const el of doc.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const rr = { x: r.left + dx, y: r.top + dy, w: r.width, h: r.height };
      if (!visivel(el, r)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' && el.type === 'hidden') continue;
      el.setAttribute('data-robo', String(++n));
      const item = { n, tag, tipo: el.type || el.getAttribute('role') || '', texto: rotulo(el), x: Math.round(rr.x + rr.w / 2), y: Math.round(rr.y + rr.h / 2) };
      if (tag === 'select') item.opcoes = [...el.options].map(o => o.text.trim()).slice(0, 25), item.valor = el.options[el.selectedIndex]?.text;
      if ((tag === 'input' || tag === 'textarea') && el.type !== 'password') item.valor = (el.value || '').slice(0, 80);
      if (el.type === 'password') item.texto = '[campo de senha]';
      out.push(item);
      if (out.length >= 180) return;
    }
    for (const f of doc.querySelectorAll('iframe')) {
      try { const r = f.getBoundingClientRect(); if (f.contentDocument) varrer(f.contentDocument, dx + r.left, dy + r.top); } catch {}
    }
  };
  varrer(document, 0, 0);
  const texto = (document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 2500);
  return { url: location.href, titulo: document.title, elementos: out, texto, temSenha: !!document.querySelector('input[type=password]') };
})()`;

type Tela = { url: string; titulo: string; elementos: { n: number; tag: string; tipo: string; texto: string; x: number; y: number; opcoes?: string[]; valor?: string }[]; texto: string; temSenha: boolean };

const FERRAMENTAS: Anthropic.Tool[] = [
  { name: 'clicar', description: 'Clica no elemento de número n da lista.', input_schema: { type: 'object', properties: { n: { type: 'integer' }, porque: { type: 'string' } }, required: ['n', 'porque'] } },
  { name: 'escrever', description: 'Apaga o que houver no campo n e escreve o texto. Nunca use para senha ou código.', input_schema: { type: 'object', properties: { n: { type: 'integer' }, texto: { type: 'string' }, porque: { type: 'string' } }, required: ['n', 'texto', 'porque'] } },
  { name: 'escolher', description: 'Escolhe uma opção (pelo texto visível) na lista suspensa n (elemento select).', input_schema: { type: 'object', properties: { n: { type: 'integer' }, opcao: { type: 'string' }, porque: { type: 'string' } }, required: ['n', 'opcao', 'porque'] } },
  { name: 'tecla', description: 'Aperta uma tecla.', input_schema: { type: 'object', properties: { tecla: { type: 'string', enum: ['Enter', 'Tab', 'Escape'] }, porque: { type: 'string' } }, required: ['tecla', 'porque'] } },
  { name: 'rolar', description: 'Rola a página.', input_schema: { type: 'object', properties: { direcao: { type: 'string', enum: ['baixo', 'cima'] } }, required: ['direcao'] } },
  { name: 'abrir', description: 'Abre um endereço do MESMO painel (mesmo site) quando você souber o caminho certo.', input_schema: { type: 'object', properties: { url: { type: 'string' }, porque: { type: 'string' } }, required: ['url', 'porque'] } },
  { name: 'esperar', description: 'Espera a página carregar ou salvar.', input_schema: { type: 'object', properties: { segundos: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['segundos'] } },
  { name: 'pedir_ao_cliente', description: 'Para e pede ao dono da conta para fazer algo que só ele pode: entrar na conta, digitar senha ou código, confirmar no celular, resolver captcha.', input_schema: { type: 'object', properties: { mensagem: { type: 'string', description: 'Frase curta, em português, dizendo o que ele deve fazer na janela.' } }, required: ['mensagem'] } },
  { name: 'concluir', description: 'Todas as mudanças foram feitas E salvas, e a tela confirma.', input_schema: { type: 'object', properties: { resumo: { type: 'string' } }, required: ['resumo'] } },
  { name: 'desistir', description: 'Não dá para seguir com segurança (tela inesperada, painel sem edição de DNS, risco de mexer no que não deve).', input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] } },
];

function instrucoes(p: Plano) {
  const linha = (r: Registro) => `- tipo ${r.tipo}, nome ${r.nome === '@' || r.nome.startsWith('(') ? 'raiz (@ ou vazio, conforme o painel)' : r.nome}, valor ${r.valor}`;
  return `Você opera o painel de domínio de um lojista brasileiro, que já entrou na própria conta, para ligar o domínio ${p.dominio} ao site da loja.${p.provedor ? ` O DNS do domínio é administrado em: ${p.provedor}.` : ''}

OBJETIVO — na zona DNS (registros/entradas) do domínio ${p.dominio}:
APAGAR exatamente estes registros:
${p.apagar.length ? p.apagar.map(linha).join('\n') : '- nenhum'}
CRIAR exatamente estes registros (TTL padrão do painel):
${p.criar.length ? p.criar.map(linha).join('\n') : '- nenhum'}
NÃO TOCAR em nenhum outro registro (e-mail MX, TXT, outros subdomínios)${p.manter.length ? `, em especial:\n${p.manter.map(linha).join('\n')}` : '.'}
Depois, SALVAR as alterações (muitos painéis exigem um botão "Salvar"/"Salvar alterações"/"Save").

REGRAS:
- Uma ação por vez. Leia a foto e a lista; use o número do elemento.
- Na raiz: alguns painéis pedem "@", outros o nome vazio (Registro.br: deixe vazio). Siga o que o painel aceita.
- No Registro.br, a edição fica em: domínio → "Configurar endereçamento"/DNS → se pedir, "Modo avançado" → "Nova entrada". NUNCA "Alterar servidores DNS".
- Se houver redirecionamento/encaminhamento (forwarding) ligado no domínio, desligue-o.
- Se um registro a criar já existir com o valor certo, não duplique.
- Nunca digite senha, código, CPF, cartão. Se a tela pedir login, senha, código, captcha ou confirmação no celular: pedir_ao_cliente.
- Nunca toque em: servidores DNS (nameservers), DNSSEC, pagamento, renovação, transferência, titular/contatos, senha, cancelamento ou exclusão do domínio, compra de qualquer coisa. Na dúvida: desistir.
- Pop-up de cookies ou novidades: feche.
- Só chame concluir quando a tela mostrar os registros novos salvos e os antigos fora.`;
}

let cliente: Anthropic | null = null;
const ia = () => (cliente ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }));

const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Roda até concluir, desistir, pedir o cliente ou o tempo acabar (`ate`, em ms do relógio).
 * `aoPassar` grava cada passo para a página mostrar.
 */
export async function trabalhar(
  nav: Navegador, plano: Plano, ate: number, aoPassar: (p: Passo) => Promise<void>, historico: string[] = [],
): Promise<Desfecho> {
  const sistema = instrucoes(plano);
  let tentativasIguais = 0;
  let ultima = '';
  for (let i = 0; i < 45; i++) {
    if (Date.now() > ate) return { tipo: 'falhou', motivo: 'O tempo da janela acabou antes de terminar.' };
    await pausa(1200);
    let tela: Tela;
    let foto: string;
    try {
      tela = await nav.avaliar<Tela>(LER_TELA);
      foto = await nav.foto();
    } catch {
      await pausa(2000);
      continue;
    }
    const lista = tela.elementos.map((e) =>
      `[${e.n}] ${e.tag}${e.tipo ? `(${e.tipo})` : ''} "${e.texto}"${e.valor !== undefined ? ` valor="${e.valor}"` : ''}${e.opcoes ? ` opções: ${e.opcoes.join(' | ')}` : ''}`).join('\n');

    const r = await ia().messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 800,
      system: sistema,
      tools: FERRAMENTAS,
      tool_choice: { type: 'any' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: foto } },
          { type: 'text', text: `Endereço: ${tela.url}\nTítulo: ${tela.titulo}\n\nO que já foi feito:\n${historico.slice(-25).join('\n') || '(nada)'}\n\nElementos:\n${lista}\n\nTexto da página (começo):\n${tela.texto}\n\nQual a próxima ação?` },
        ],
      }],
    // deno-lint-ignore no-explicit-any
    } as any);
    // deno-lint-ignore no-explicit-any
    const uso = (r.content as any[]).find((b) => b.type === 'tool_use');
    if (!uso) continue;
    const a = uso.input as Record<string, unknown>;
    const alvo = typeof a.n === 'number' ? tela.elementos.find((e) => e.n === a.n) : undefined;
    const porque = String(a.porque ?? '');

    const chave = `${uso.name}:${a.n ?? ''}:${a.texto ?? a.opcao ?? a.url ?? ''}`;
    tentativasIguais = chave === ultima ? tentativasIguais + 1 : 0;
    ultima = chave;
    if (tentativasIguais >= 4) return { tipo: 'falhou', motivo: 'O robô ficou repetindo a mesma ação sem avançar.' };

    if (uso.name === 'concluir') return { tipo: 'feito', resumo: String(a.resumo ?? '') };
    if (uso.name === 'desistir') return { tipo: 'falhou', motivo: String(a.motivo ?? '') };
    if (uso.name === 'pedir_ao_cliente') return { tipo: 'precisa_cliente', mensagem: String(a.mensagem ?? 'Entre na sua conta na janela abaixo.') };

    /* As travas, no código. */
    if (alvo && PROIBIDO.test(alvo.texto) && !/^(apagar|excluir|remover|delete|lixeira)$/i.test(alvo.texto.trim())) {
      historico.push(`- BLOQUEADO: tentou "${uso.name}" em "${alvo.texto}" (proibido). Escolha outro caminho.`);
      await aoPassar({ quando: new Date().toISOString(), acao: 'bloqueado', detalhe: alvo.texto });
      continue;
    }
    if (uso.name === 'escrever' && (tela.temSenha && alvo?.texto === '[campo de senha]')) {
      return { tipo: 'precisa_cliente', mensagem: 'Digite a sua senha na janela abaixo.' };
    }

    try {
      if (uso.name === 'clicar' && alvo) {
        await nav.avaliar(`document.querySelector('[data-robo="${alvo.n}"]')?.scrollIntoView({block:'center'})`);
        const pos = await nav.avaliar<{ x: number; y: number } | null>(`(() => { const el = document.querySelector('[data-robo="${alvo.n}"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await nav.clicarEm(pos?.x ?? alvo.x, pos?.y ?? alvo.y);
      } else if (uso.name === 'escrever' && alvo) {
        await nav.avaliar(`(() => { const el = document.querySelector('[data-robo="${alvo.n}"]'); if (!el) return; el.scrollIntoView({block:'center'}); el.focus(); if ('select' in el) el.select(); })()`);
        await nav.avaliar(`(() => { const el = document.querySelector('[data-robo="${alvo.n}"]'); if (el && 'value' in el) { const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set; s ? s.call(el, '') : (el.value = ''); el.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
        await nav.escrever(String(a.texto ?? ''));
        await nav.avaliar(`document.querySelector('[data-robo="${alvo.n}"]')?.dispatchEvent(new Event('change', { bubbles: true }))`);
      } else if (uso.name === 'escolher' && alvo) {
        const opcao = JSON.stringify(String(a.opcao ?? ''));
        await nav.avaliar(`(() => { const el = document.querySelector('[data-robo="${alvo.n}"]'); if (!el) return; const o = [...el.options].find(o => o.text.trim().toLowerCase() === ${opcao}.toLowerCase()) || [...el.options].find(o => o.text.toLowerCase().includes(${opcao}.toLowerCase())); if (o) { el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
      } else if (uso.name === 'tecla') {
        await nav.tecla(String(a.tecla) as 'Enter');
      } else if (uso.name === 'rolar') {
        await nav.avaliar(`window.scrollBy(0, ${a.direcao === 'cima' ? -600 : 600})`);
      } else if (uso.name === 'abrir') {
        const atual = new URL(tela.url);
        const novo = new URL(String(a.url), tela.url);
        if (novo.hostname.split('.').slice(-2).join('.') !== atual.hostname.split('.').slice(-2).join('.')) {
          historico.push(`- BLOQUEADO: abrir ${novo.href} (fora do painel).`);
          continue;
        }
        await nav.ir(novo.href);
      } else if (uso.name === 'esperar') {
        await pausa(Math.min(10, Number(a.segundos ?? 2)) * 1000);
      }
    } catch (e) {
      historico.push(`- falhou ${uso.name}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const detalhe = alvo ? `${uso.name} "${alvo.texto}"${a.texto ? ` = ${a.texto}` : ''}${a.opcao ? ` = ${a.opcao}` : ''}` : `${uso.name}${a.url ? ` ${a.url}` : ''}${a.direcao ? ` ${a.direcao}` : ''}`;
    historico.push(`- ${detalhe}${porque ? ` (${porque})` : ''}`);
    await aoPassar({ quando: new Date().toISOString(), acao: uso.name, detalhe: porque || detalhe });
  }
  return { tipo: 'falhou', motivo: 'O robô passou do número de passos sem terminar.' };
}
