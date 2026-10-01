import { MODELOS } from './modelos.ts';

/**
 * Os parâmetros batem com o template aprovado?
 *
 * A Meta é literal: template com quatro variáveis no corpo e três
 * parâmetros enviados é recusa, não é texto faltando. O mesmo vale para
 * o botão de URL dinâmica — sem o sufixo, "Button at index 0 of type Url
 * requires a parameter" — e para o cabeçalho de documento.
 *
 * A conferência acontece ANTES de a trava de repetição ser gravada. Sem
 * isso, um gatilho com parâmetro a menos queimaria a chave e aquele
 * evento nunca mais sairia: o erro de hoje viraria silêncio para sempre.
 *
 * A fonte é `modelos.ts`, que é o texto aprovado. Ao editar um modelo na
 * Meta, atualize lá — senão esta conferência passa a mentir.
 */

export type ParamsConferidos = {
  header?: string[];
  documento?: { link: string; filename: string };
  body?: string[];
  urlSuffix?: string;
};

const variaveis = (texto: string) =>
  new Set([...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;

/** O que está errado, em português. Lista vazia = pode enviar. */
export function conferirParams(template: string, p: ParamsConferidos = {}): string[] {
  const modelo = MODELOS.find((m) => m.name === template);
  /* Template que não conhecemos não é barrado: pode ser novo na Meta e
     ainda não ter descido para cá. Barrar seria pior que tentar. */
  if (!modelo) return [];

  const erros: string[] = [];
  const comp = (t: string) => modelo.components.find((c) => c.type === t) as Record<string, unknown> | undefined;

  const body = comp('BODY');
  if (body) {
    const exige = variaveis(String(body.text ?? ''));
    const tem = p.body?.length ?? 0;
    if (exige !== tem) erros.push(`o corpo pede ${exige} ${exige === 1 ? 'variável' : 'variáveis'} e foram ${tem}`);
    if ((p.body ?? []).some((v) => !String(v ?? '').trim())) {
      /* Variável vazia é recusa da Meta, não espaço em branco no texto. */
      erros.push('há variável de corpo vazia');
    }
  }

  const header = comp('HEADER');
  if (header) {
    const formato = String(header.format ?? 'TEXT');
    if (formato === 'TEXT') {
      const exige = variaveis(String(header.text ?? ''));
      const tem = p.header?.length ?? 0;
      if (exige !== tem) erros.push(`o cabeçalho pede ${exige} e foram ${tem}`);
    } else if (formato === 'DOCUMENT') {
      if (!p.documento?.link) erros.push('o cabeçalho é um documento e falta o link do PDF');
    }
  } else if (p.header?.length || p.documento) {
    erros.push('foi enviado cabeçalho, e o modelo aprovado não tem');
  }

  const botoes = comp('BUTTONS') as { buttons?: { type: string; url?: string }[] } | undefined;
  const urlDinamica = (botoes?.buttons ?? []).some((b) => b.type === 'URL' && (b.url ?? '').includes('{{1}}'));
  if (urlDinamica && !String(p.urlSuffix ?? '').trim()) {
    erros.push('o botão tem URL dinâmica e o sufixo veio vazio');
  }
  if (!urlDinamica && String(p.urlSuffix ?? '').trim()) {
    erros.push('foi enviado sufixo de URL, e o botão do modelo é fixo');
  }

  return erros;
}

/**
 * Os parâmetros de EXEMPLO do próprio modelo aprovado.
 *
 * Toda submissão à Meta leva exemplos — foi com eles que o revisor leu o
 * texto. Para um disparo de teste, são a melhor escolha possível: saem
 * exatamente no formato que a Meta aprovou, e ninguém precisa inventar
 * valor que depois não bate com a conferência.
 */
export function exemploDoModelo(template: string): ParamsConferidos | null {
  const modelo = MODELOS.find((m) => m.name === template);
  if (!modelo) return null;
  const p: ParamsConferidos = {};
  for (const c of modelo.components as Record<string, unknown>[]) {
    const ex = c.example as Record<string, unknown> | undefined;
    if (c.type === 'BODY') {
      p.body = ((ex?.body_text as string[][] | undefined)?.[0] ?? []).map(String);
    }
    if (c.type === 'HEADER') {
      if (c.format === 'TEXT') p.header = ((ex?.header_text as string[] | undefined) ?? []).map(String);
      if (c.format === 'DOCUMENT') {
        const link = (ex?.header_url as string[] | undefined)?.[0]
          ?? (ex?.header_handle as string[] | undefined)?.[0];
        if (link) p.documento = { link, filename: 'Exemplo — Via Pesados.pdf' };
      }
    }
    if (c.type === 'BUTTONS') {
      const b = (c.buttons as { type: string; url?: string; example?: string[] }[] | undefined) ?? [];
      const dinamico = b.find((x) => x.type === 'URL' && (x.url ?? '').includes('{{1}}'));
      if (dinamico) {
        /* O exemplo do botão é a URL inteira; o que vai no disparo é só o
           sufixo — o resto a Meta monta a partir do modelo. */
        const inteira = dinamico.example?.[0] ?? '';
        const base = (dinamico.url ?? '').replace('{{1}}', '');
        p.urlSuffix = (inteira.startsWith(base) ? inteira.slice(base.length) : 'exemplo') || 'exemplo';
      }
    }
  }
  return p;
}
