import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import type { Navegador } from './cdp.ts';
import { roteiroDo } from './robo-roteiros.ts';
import { mudancasRegistroBr, PROIBIDO, telaConfere, type Desfecho, type Passo, type Plano, type Registro, type RR } from './robo-regras.ts';
export { mudancasRegistroBr, PROIBIDO, telaConfere };
export type { Desfecho, Passo, Plano, Registro };

/**
 * O robô que mexe no DNS do cliente (23/11/2026, pedido do dono: "construa o robô
 * inteiro, para todos os lugares onde brasileiros usam domínio"; depois: "estuda
 * mais para ele ficar assertivo").
 *
 * A cada passo ele lê a tela (foto + lista numerada dos elementos clicáveis) e a IA
 * devolve um LOTE de ações (preencher tipo, nome, valor e clicar em adicionar de uma
 * vez). Cada painel tem um roteiro estudado (robo-roteiros.ts) com o caminho e os
 * nomes dos botões; o que o roteiro não cobre, a IA resolve olhando a tela.
 *
 * Quem entra na conta é sempre o cliente. As TRAVAS ficam no código: nada de
 * pagamento, senha, titular, transferência, servidores DNS. E "concluir" só vale se
 * a tela mostrar os valores novos (conferência no código, não na palavra da IA).
 */



/* Lê a tela: elementos visíveis e clicáveis (também dentro de iframes do mesmo site e de shadow DOM). */
export const LER_TELA = `(() => {
  const out = []; let n = 0;
  const visivel = (el, r) => r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
    && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' && getComputedStyle(el).opacity !== '0';
  const rotulo = (el) => {
    let t = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || el.getAttribute('data-testid') || '').replace(/\\s+/g, ' ').trim();
    if (!t && el.id) { const l = el.ownerDocument.querySelector('label[for="' + el.id + '"]'); if (l) t = l.innerText.trim(); }
    if (!t) { const i = el.querySelector && el.querySelector('i,svg,img'); if (i) t = '[ícone ' + ((i.getAttribute('class') || i.getAttribute('aria-label') || i.getAttribute('alt') || '') + '').slice(0, 40) + ']'; }
    return t.slice(0, 90);
  };
  const sel = 'a,button,input,select,textarea,[role=button],[role=link],[role=menuitem],[role=tab],[role=option],[role=checkbox],[role=radio],[role=switch],[role=combobox],[onclick],[contenteditable=true],summary,label,[tabindex]:not([tabindex="-1"])';
  const varrer = (raiz, dx, dy) => {
    for (const el of raiz.querySelectorAll(sel)) {
      if (out.length >= 200) return;
      const r = el.getBoundingClientRect();
      if (!visivel(el, r)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' && el.type === 'hidden') continue;
      el.setAttribute('data-robo', String(++n));
      const item = { n, tag, tipo: el.type || el.getAttribute('role') || '', texto: rotulo(el), x: Math.round(r.left + dx + r.width / 2), y: Math.round(r.top + dy + r.height / 2) };
      if (tag === 'select') { item.opcoes = [...el.options].map(o => o.text.trim()).slice(0, 30); item.valor = el.options[el.selectedIndex]?.text; }
      if ((tag === 'input' || tag === 'textarea') && el.type !== 'password') item.valor = (el.value || '').slice(0, 80);
      if (el.type === 'checkbox' || el.type === 'radio' || el.getAttribute('role') === 'switch') item.marcado = !!(el.checked || el.getAttribute('aria-checked') === 'true');
      if (el.type === 'password') item.texto = '[campo de senha]';
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') item.desligado = true;
      out.push(item);
    }
    for (const h of raiz.querySelectorAll('*')) if (h.shadowRoot) varrer(h.shadowRoot, dx, dy);
    for (const f of raiz.querySelectorAll('iframe')) {
      try { const r = f.getBoundingClientRect(); if (f.contentDocument) varrer(f.contentDocument, dx + r.left, dy + r.top); } catch {}
    }
  };
  varrer(document, 0, 0);
  const texto = (document.body?.innerText || '').replace(/\\s+/g, ' ');
  return { url: location.href, titulo: document.title, elementos: out, texto: texto.slice(0, 3500), textoTodo: texto.slice(0, 40000), temSenha: !!document.querySelector('input[type=password]') };
})()`;

type Elemento = { n: number; tag: string; tipo: string; texto: string; x: number; y: number; opcoes?: string[]; valor?: string; marcado?: boolean; desligado?: boolean };
type Tela = { url: string; titulo: string; elementos: Elemento[]; texto: string; textoTodo: string; temSenha: boolean };

const ACAO = {
  type: 'object',
  properties: {
    acao: { type: 'string', enum: ['clicar', 'escrever', 'escolher', 'tecla', 'rolar', 'esperar', 'abrir'] },
    n: { type: 'integer', description: 'número do elemento (clicar, escrever, escolher)' },
    texto: { type: 'string', description: 'escrever: o texto' },
    opcao: { type: 'string', description: 'escolher: texto visível da opção' },
    tecla: { type: 'string', enum: ['Enter', 'Tab', 'Escape'] },
    direcao: { type: 'string', enum: ['baixo', 'cima'] },
    segundos: { type: 'integer', minimum: 1, maximum: 8 },
    url: { type: 'string', description: 'abrir: endereço do MESMO painel' },
  },
  required: ['acao'],
};

const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: 'fazer',
    description: 'Executa de 1 a 6 ações, em ordem, na tela atual. Agrupe o que dá para fazer sem a tela mudar (ex.: escolher o tipo, escrever o nome, escrever o valor e clicar em Adicionar). Depois de um clique que abre outra tela ou diálogo, pare o lote: os números mudam.',
    input_schema: {
      type: 'object',
      properties: { acoes: { type: 'array', items: ACAO, minItems: 1, maxItems: 6 }, porque: { type: 'string', description: 'Em português simples, o que está fazendo (aparece para o cliente).' } },
      required: ['acoes', 'porque'],
    },
  },
  { name: 'pedir_ao_cliente', description: 'Para e pede ao dono da conta para fazer algo que só ele pode: entrar na conta, digitar senha ou código, confirmar no celular, resolver captcha.', input_schema: { type: 'object', properties: { mensagem: { type: 'string' } }, required: ['mensagem'] } },
  { name: 'concluir', description: 'Todas as mudanças foram feitas E salvas, e a tela mostra a lista de registros final.', input_schema: { type: 'object', properties: { resumo: { type: 'string' } }, required: ['resumo'] } },
  { name: 'desistir', description: 'Não dá para seguir com segurança (painel sem edição de DNS, tela inesperada, risco de mexer no que não deve).', input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] } },
];

function nomeLegivel(r: Registro) {
  return r.nome === '@' || r.nome.startsWith('(') || r.nome === '' ? 'RAIZ' : r.nome;
}

function instrucoes(p: Plano) {
  const linha = (r: Registro) => `- tipo ${r.tipo} · nome ${nomeLegivel(r)} · valor ${r.valor}`;
  return `Você opera o painel de domínio de um lojista brasileiro, que já entrou na própria conta, para ligar o domínio ${p.dominio} ao site da loja.

OBJETIVO, na zona DNS do domínio ${p.dominio}:
APAGAR:
${p.apagar.length ? p.apagar.map(linha).join('\n') : '- nada'}
CRIAR (TTL padrão do painel):
${p.criar.length ? p.criar.map(linha).join('\n') : '- nada'}
NÃO TOCAR em mais nada (e-mail MX, TXT, outros subdomínios)${p.manter.length ? `, em especial:\n${p.manter.map(linha).join('\n')}` : '.'}
"RAIZ" = o próprio domínio: cada painel escreve de um jeito (vazio, "@" ou o domínio completo); o roteiro abaixo diz qual.
Se algum registro de APAGAR já não existir, siga. Se um de CRIAR já existir com o mesmo valor, não duplique.
Se o painel não deixar criar porque existe outro registro no mesmo nome (ex.: CNAME/ALIAS na raiz, CNAME www antigo), apague esse conflito primeiro — é o mesmo que a lista APAGAR pede.

${roteiroDo(p.provedor, p.dominio)}

REGRAS:
- Use os números da lista de elementos. Lotes curtos; pare o lote depois de um clique que muda a tela.
- Nunca digite senha, código, CPF, cartão. Login, senha, código, captcha ou confirmação no celular → pedir_ao_cliente.
- Nunca toque em: servidores DNS / nameservers, DNSSEC, pagamento, renovação, transferência, titular, contatos, senha, cancelamento ou exclusão do domínio, compras. Na dúvida: desistir.
- Banner de cookies, tour ou novidades: feche ou aceite só o necessário.
- Diálogo "tem certeza?" ao apagar um registro da lista APAGAR: confirme.
- Só chame concluir quando a tela mostrar a lista final já SALVA, com os valores novos.
- Responda SEMPRE chamando uma ferramenta (fazer, pedir_ao_cliente, concluir ou desistir), nunca só com texto.`;
}

let cliente: Anthropic | null = null;
const ia = () => (cliente ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }));
const MODELO = Deno.env.get('ROBO_DNS_MODELO') ?? 'claude-opus-5-5';

const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function executar(nav: Navegador, tela: Tela, a: Record<string, unknown>): Promise<string> {
  const alvo = typeof a.n === 'number' ? tela.elementos.find((e) => e.n === a.n) : undefined;
  const acao = String(a.acao);
  if (['clicar', 'escrever', 'escolher'].includes(acao) && !alvo) throw new Error(`elemento ${a.n} não existe`);
  if (alvo && PROIBIDO.test(alvo.texto) && !/^(apagar|excluir|remover|delete|lixeira|\[ícone)/i.test(alvo.texto.trim())) {
    return `BLOQUEADO: "${alvo.texto}" é proibido`;
  }
  const sel = alvo ? `document.querySelector('[data-robo="${alvo.n}"]')` : '';
  if (acao === 'clicar' && alvo) {
    const pos = await nav.avaliar<{ x: number; y: number } | null>(`(() => { const el = ${sel}; if (!el) return null; el.scrollIntoView({block:'center', inline:'center'}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await nav.clicarEm(pos?.x ?? alvo.x, pos?.y ?? alvo.y);
    return `clicou "${alvo.texto}"`;
  }
  if (acao === 'escrever' && alvo) {
    if (alvo.texto === '[campo de senha]') throw new Error('campo de senha: é com o cliente');
    const pos = await nav.avaliar<{ x: number; y: number } | null>(`(() => { const el = ${sel}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await nav.clicarEm(pos?.x ?? alvo.x, pos?.y ?? alvo.y);
    await nav.avaliar(`(() => { const el = ${sel}; if (!el) return; el.focus(); if ('value' in el) { const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set; s ? s.call(el, '') : (el.value = ''); el.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
    await nav.escrever(String(a.texto ?? ''));
    await nav.avaliar(`(() => { const el = ${sel}; if (el) { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); } })()`);
    return `escreveu "${a.texto}" em "${alvo.texto}"`;
  }
  if (acao === 'escolher' && alvo) {
    const opcao = JSON.stringify(String(a.opcao ?? ''));
    const ok = await nav.avaliar<boolean>(`(() => { const el = ${sel}; if (!el || !el.options) return false; const q = ${opcao}.toLowerCase(); const o = [...el.options].find(o => o.text.trim().toLowerCase() === q) || [...el.options].find(o => o.text.trim().toLowerCase().startsWith(q)) || [...el.options].find(o => o.text.toLowerCase().includes(q)); if (!o) return false; const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; s.call(el, o.value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    if (!ok) throw new Error(`opção "${a.opcao}" não existe em "${alvo.texto}" (se não for <select>, clique nele e depois na opção)`);
    return `escolheu "${a.opcao}"`;
  }
  if (acao === 'tecla') { await nav.tecla(String(a.tecla) as 'Enter'); return `tecla ${a.tecla}`; }
  if (acao === 'rolar') { await nav.avaliar(`window.scrollBy(0, ${a.direcao === 'cima' ? -650 : 650})`); return `rolou para ${a.direcao}`; }
  if (acao === 'esperar') { await pausa(Math.min(8, Number(a.segundos ?? 2)) * 1000); return `esperou ${a.segundos}s`; }
  if (acao === 'abrir') {
    const atual = new URL(tela.url);
    const novo = new URL(String(a.url), tela.url);
    const raiz = (h: string) => h.split('.').slice(-2).join('.');
    if (raiz(novo.hostname) !== raiz(atual.hostname)) return `BLOQUEADO: ${novo.hostname} fica fora do painel`;
    await nav.ir(novo.href);
    return `abriu ${novo.pathname}`;
  }
  throw new Error(`ação "${acao}" incompleta`);
}

/**
 * Roda até concluir, desistir, pedir o cliente ou o tempo acabar (`ate`, em ms do relógio).
 * `aoPassar` grava cada passo para a página mostrar; `aoTrocarAba` atualiza a janela ao vivo.
 */
export async function trabalhar(
  nav: Navegador, plano: Plano, ate: number,
  aoPassar: (p: Passo) => Promise<void>, aoTrocarAba: () => Promise<void>,
  historico: string[] = [],
): Promise<Desfecho> {
  const sistema = instrucoes(plano);
  let repetidas = 0;
  let ultimo = '';
  let recusas = 0;
  for (let i = 0; i < 40; i++) {
    if (Date.now() > ate) return { tipo: 'falhou', motivo: 'O tempo da janela acabou antes de terminar.' };
    await pausa(900);
    if (await nav.seguirAbaNova().catch(() => false)) { await aoTrocarAba(); await pausa(1500); }
    let tela: Tela, foto: string;
    try {
      tela = await nav.avaliar<Tela>(LER_TELA);
      foto = await nav.foto();
      if (!tela?.elementos) throw new Error('tela vazia');
    } catch (e) {
      const m = `leitura da tela: ${e instanceof Error ? e.message : e}`;
      console.error('robo-dns:', m);
      await aoPassar({ quando: new Date().toISOString(), acao: 'erro', detalhe: m });
      await pausa(1500); continue;
    }

    const lista = tela.elementos.map((e) =>
      `[${e.n}] ${e.tag}${e.tipo ? `(${e.tipo})` : ''} "${e.texto}"${e.valor !== undefined ? ` valor="${e.valor}"` : ''}${e.marcado !== undefined ? (e.marcado ? ' [marcado]' : ' [desmarcado]') : ''}${e.desligado ? ' [desabilitado]' : ''}${e.opcoes ? ` opções: ${e.opcoes.join(' | ')}` : ''}`).join('\n');

    // deno-lint-ignore no-explicit-any
    let r: any;
    try {
      r = await ia().messages.create({
        model: MODELO,
        max_tokens: 1500,
        system: sistema,
        tools: FERRAMENTAS,
        tool_choice: { type: 'auto' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: foto } },
            { type: 'text', text: `Endereço: ${tela.url}\nTítulo: ${tela.titulo}\n\nO que já foi feito (mais recente por último):\n${historico.slice(-30).join('\n') || '(nada ainda)'}\n\nElementos:\n${lista}\n\nTexto da página:\n${tela.texto}\n\nPróximo passo?` },
          ],
        }],
      // deno-lint-ignore no-explicit-any
      } as any);
    } catch (e) {
      const m = `IA: ${e instanceof Error ? e.message.slice(0, 300) : e}`;
      console.error('robo-dns:', m);
      await aoPassar({ quando: new Date().toISOString(), acao: 'erro', detalhe: m });
      historico.push(`- (erro ao pensar: ${m.slice(0, 80)})`);
      await pausa(2000);
      continue;
    }
    // deno-lint-ignore no-explicit-any
    const uso = (r.content as any[]).find((b) => b.type === 'tool_use');
    if (!uso) {
      // deno-lint-ignore no-explicit-any
      const fala = (r.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join(' ').slice(0, 200);
      historico.push(`- (respondeu sem ação: "${fala}". Use SEMPRE uma ferramenta.)`);
      await aoPassar({ quando: new Date().toISOString(), acao: 'erro', detalhe: `IA sem ação: ${fala}` });
      continue;
    }
    const a = uso.input as Record<string, unknown>;

    if (uso.name === 'pedir_ao_cliente') return { tipo: 'precisa_cliente', mensagem: String(a.mensagem ?? 'Entre na sua conta na janela abaixo.') };
    if (uso.name === 'desistir') return { tipo: 'falhou', motivo: String(a.motivo ?? '') };
    if (uso.name === 'concluir') {
      const c = telaConfere(tela.textoTodo, plano);
      if (c.ok) return { tipo: 'feito', resumo: String(a.resumo ?? '') };
      recusas++;
      historico.push(`- CONFERÊNCIA RECUSOU o concluir: ${c.falta.length ? `não aparece na tela: ${c.falta.join(', ')}` : ''}${c.sobra.length ? ` ainda aparece: ${c.sobra.join(', ')}` : ''}. Se já salvou, abra a lista de registros para conferir; senão termine o que falta.`);
      if (recusas >= 3) return { tipo: 'falhou', motivo: `O painel não mostrou as mudanças completas (${[...c.falta, ...c.sobra].join(', ')}).` };
      continue;
    }

    const acoes = Array.isArray(a.acoes) ? (a.acoes as Record<string, unknown>[]).slice(0, 6) : [];
    const chave = JSON.stringify(acoes);
    repetidas = chave === ultimo ? repetidas + 1 : 0;
    ultimo = chave;
    if (repetidas >= 3) return { tipo: 'falhou', motivo: 'O robô repetiu a mesma ação sem a tela mudar.' };

    const feitos: string[] = [];
    const urlAntes = tela.url;
    for (const ac of acoes) {
      try {
        const res = await executar(nav, tela, ac);
        feitos.push(res);
        if (res.startsWith('BLOQUEADO')) break;
        await pausa(ac.acao === 'clicar' ? 700 : 250);
        if (ac.acao === 'clicar' || ac.acao === 'abrir' || ac.acao === 'tecla') {
          const urlAgora = await nav.avaliar<string>('location.href').catch(() => urlAntes);
          if (urlAgora !== urlAntes) break;
        }
      } catch (e) {
        feitos.push(`falhou: ${e instanceof Error ? e.message : e}`);
        break;
      }
    }
    const porque = String(a.porque ?? '');
    historico.push(`- ${porque} → ${feitos.join('; ')}`);
    await aoPassar({ quando: new Date().toISOString(), acao: 'fazer', detalhe: porque || feitos.join('; ') });
  }
  return { tipo: 'falhou', motivo: 'O robô passou do número de passos sem terminar.' };
}

/** Na espera do login: o cliente já entrou? (saiu da tela de senha e caiu no painel) */
export async function parecePainel(nav: Navegador): Promise<boolean> {
  try {
    const t = await nav.avaliar<{ senha: boolean; url: string }>(`({ senha: !!document.querySelector('input[type=password]'), url: location.href })`);
    return !t.senha && !/login|signin|sign-in|entrar|acessar|auth|sso\./i.test(t.url);
  } catch { return false; }
}

/* ── Registro.br: o caminho direto (23/11/2026) ─────────────────────────────
   Lido no próprio código do painel deles (build mwcnd2vg): a zona em modo avançado é
   lida em GET /v2/ajax/domain/{fqdn}/freedns-advanced (RRs: Ownername relativo, "" = raiz;
   Type; Rdata) e salva em POST no mesmo endereço com {AddRR, RemoveRR} — é o que o
   botão "Salvar alterações" faz. Modo básico vira avançado com PUT (o "Confirmar" do
   diálogo "Modo Avançado"). Roda DENTRO da página, com a sessão que o cliente abriu,
   e o cabeçalho X-XSRF-TOKEN do cookie XSRF-TOKEN, como o painel faz. */


export const CHAMAR_RB = (metodo: string, caminho: string, corpo?: unknown) => `(async () => {
  /* O painel manda o X-XSRF-TOKEN lido do cookie XSRF-TOKEN. Pode haver mais de um cookie
     com esse nome (caminhos diferentes): tenta cada um e, por fim, sem o cabeçalho. */
  const tokens = document.cookie.split('; ').filter(c => c.startsWith('XSRF-TOKEN=')).map(c => decodeURIComponent(c.slice(11)));
  const tentativas = [...tokens.map(t => ({ 'X-XSRF-TOKEN': t })), {}];
  let ultimo = null;
  for (const extra of tentativas) {
    const r = await fetch(${JSON.stringify(caminho)}, {
      method: ${JSON.stringify(metodo)}, credentials: 'include',
      headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', ...extra },
      ${corpo === undefined ? '' : `body: ${JSON.stringify(JSON.stringify(corpo))},`}
    });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    ultimo = { status: r.status, url: r.url, json: j, texto: t.slice(0, 500), tokens: tokens.length };
    if (!/invalid-header/.test(t)) return ultimo;
  }
  return ultimo;
})()`;

type Resp = { status: number; url: string; json: unknown; texto: string };

function acharRRs(j: unknown): RR[] | null {
  // deno-lint-ignore no-explicit-any
  const o = j as any;
  const lista = o?.RRs ?? o?.Data?.RRs ?? o?.data?.RRs ?? o?.Zone?.RRs;
  return Array.isArray(lista) ? lista.map((r: RR) => ({ Ownername: String(r.Ownername ?? ''), Type: String(r.Type ?? '').replace(/<[^>]*>/g, '').trim(), Rdata: String(r.Rdata ?? '') })) : null;
}
// deno-lint-ignore no-explicit-any
const campo = (j: any, nome: string) => j?.[nome] ?? j?.Data?.[nome] ?? j?.data?.[nome];



/**
 * Faz a troca no Registro.br pelo caminho direto. Devolve null quando algo não bate com o
 * esperado (aí o robô segue pelo caminho de olhar a tela).
 */
export async function viaRegistroBr(nav: Navegador, plano: Plano, ate: number, aoPassar: (p: Passo) => Promise<void>): Promise<Desfecho | null> {
  const d = plano.dominio;
  const passo = (detalhe: string) => aoPassar({ quando: new Date().toISOString(), acao: 'registro.br', detalhe });
  const chamar = (m: string, c: string, corpo?: unknown) => nav.avaliar<Resp>(CHAMAR_RB(m, c, corpo));
  // deno-lint-ignore no-explicit-any
  const sessaoCaiu = (r: Resp) => r.status === 401 || /\/login\//.test(r.url) || /session:(required|expired)/.test(JSON.stringify((r.json as any)?.messages ?? ''));
  const nada = async (motivo: string) => { await aoPassar({ quando: new Date().toISOString(), acao: 'erro', detalhe: `registro.br direto: ${motivo}` }); return null; };

  await nav.seguirAbaNova().catch(() => false);
  const url = await nav.avaliar<string>('location.href').catch(() => '');
  if (!/registro\.br/.test(url)) return nada(`a janela está em ${url}`);

  await passo('Abrindo o domínio na sua conta');
  const info = await chamar('GET', `/v2/ajax/domain/${d}`);
  if (sessaoCaiu(info)) return { tipo: 'precisa_cliente', mensagem: 'A sua sessão do Registro.br saiu. Entre de novo na janela abaixo.' };
  if (info.status === 404 || info.status === 403) return { tipo: 'falhou', motivo: `O domínio ${d} não aparece nesta conta do Registro.br. Entre com a conta que é dona do domínio.` };
  if (info.status !== 200 || !info.json) return nada(`domínio respondeu ${info.status}: ${info.texto.slice(0, 150)}`);
  const status = String(campo(info.json, 'FreeDNSStatus') ?? '');
  if (status === 'not-using') return { tipo: 'falhou', motivo: 'Este domínio usa servidores DNS de outro lugar, não os do Registro.br. A mudança tem de ser feita onde o DNS está.' };
  if (campo(info.json, 'CanEditFreeDNS') === false) return nada('CanEditFreeDNS = false');

  if (status === 'basic') {
    await passo('Ligando o modo avançado do DNS (pedido do próprio Registro.br)');
    const r = await chamar('PUT', `/v2/ajax/domain/${d}/freedns-advanced`);
    if (sessaoCaiu(r)) return { tipo: 'precisa_cliente', mensagem: 'A sua sessão do Registro.br saiu. Entre de novo na janela abaixo.' };
    if (r.status >= 300) return nada(`modo avançado respondeu ${r.status}: ${r.texto.slice(0, 150)}`);
  }

  /* Em transição o painel não deixa editar: espera, como pede o aviso deles. */
  let zona: Resp | null = null;
  for (let i = 0; ; i++) {
    zona = await chamar('GET', `/v2/ajax/domain/${d}/freedns-advanced`);
    if (sessaoCaiu(zona)) return { tipo: 'precisa_cliente', mensagem: 'A sua sessão do Registro.br saiu. Entre de novo na janela abaixo.' };
    const pode = campo(zona.json, 'CanEditZone');
    if (zona.status === 200 && acharRRs(zona.json) && pode !== false) break;
    if (Date.now() + 20_000 > ate) return { tipo: 'falhou', motivo: 'O Registro.br ainda está preparando o modo avançado do seu domínio (leva alguns minutos). Tente de novo daqui a 10 minutos.' };
    if (i === 0) await passo('O Registro.br está preparando o domínio, aguardando…');
    await pausa(15_000);
  }
  const rrs = acharRRs(zona!.json)!;
  const { add, remove } = mudancasRegistroBr(rrs, plano);
  if (!add.length && !remove.length) {
    await passo('Já estava tudo certo na sua zona DNS');
    return { tipo: 'feito', resumo: 'A zona já tinha as entradas certas.' };
  }
  await passo(`Trocando ${remove.length ? `${remove.length} entrada(s) antiga(s)` : ''}${remove.length && add.length ? ' e ' : ''}${add.length ? `criando ${add.length} nova(s)` : ''}`);
  const salvo = await chamar('POST', `/v2/ajax/domain/${d}/freedns-advanced`, { AddRR: add, RemoveRR: remove });
  if (sessaoCaiu(salvo)) return { tipo: 'precisa_cliente', mensagem: 'A sua sessão do Registro.br saiu. Entre de novo na janela abaixo.' };
  if (salvo.status >= 300) {
    // deno-lint-ignore no-explicit-any
    const msgs = ((salvo.json as any)?.messages ?? (salvo.json as any)?.Messages ?? []).map((m: { message?: string; Message?: string }) => m.message ?? m.Message).filter(Boolean);
    return { tipo: 'falhou', motivo: `O Registro.br recusou: ${msgs.join('; ') || salvo.texto.slice(0, 200)}` };
  }

  /* Confere relendo a zona e mostra a tela do domínio ao cliente. */
  const depois = acharRRs((await chamar('GET', `/v2/ajax/domain/${d}/freedns-advanced`)).json) ?? [];
  const resto = mudancasRegistroBr(depois, plano);
  await nav.ir(`https://registro.br/painel/dominios/?dominio=${d}`).catch(() => null);
  if (resto.add.length || resto.remove.length) return { tipo: 'falhou', motivo: 'O Registro.br salvou, mas a zona não ficou como esperado. Tente de novo.' };
  await passo('Zona DNS atualizada com sucesso');
  return { tipo: 'feito', resumo: `Removidas ${remove.length}, criadas ${add.length} entradas no Registro.br.` };
}
