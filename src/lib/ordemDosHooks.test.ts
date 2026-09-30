import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Hook chamado depois de um `return` — a tela preta de ontem.
 *
 * A ficha do cliente tinha `const usoQuery = useClientUsage(client)` abaixo
 * do `if (isLoading || !client) return <spinner/>`. No primeiro render o
 * componente saía cedo e não chamava aquele hook; no segundo, com o cliente
 * na mão, chamava — e React conta hooks por posição. Resultado: erro #310,
 * a página inteira em branco e nenhuma pista na tela.
 *
 * O compilador não pega (é código válido) e o `tsc` também não. Este teste
 * pega, lendo a árvore em vez do texto: dentro de um componente ou de um
 * hook, depois que um `return` de nível de corpo aparece, nenhuma chamada
 * `useAlgumaCoisa()` pode vir.
 */

const RAIZ = new URL('..', import.meta.url).pathname;

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (nome.endsWith('.tsx') || (nome.endsWith('.ts') && !nome.includes('.test.'))) achados.push(caminho);
  }
  return achados;
}

const ehChamadaDeHook = (n: ts.Node): boolean =>
  ts.isCallExpression(n)
  && ts.isIdentifier(n.expression)
  && /^use[A-Z]/.test(n.expression.text);

/** Procura na subárvore SEM entrar em função aninhada — callback não conta. */
function temHook(n: ts.Node): boolean {
  let achou = false;
  const olhar = (no: ts.Node) => {
    if (achou) return;
    if (ts.isFunctionDeclaration(no) || ts.isFunctionExpression(no) || ts.isArrowFunction(no)) return;
    if (ehChamadaDeHook(no)) { achou = true; return; }
    ts.forEachChild(no, olhar);
  };
  ts.forEachChild(n, olhar);
  return achou || ehChamadaDeHook(n);
}

function temReturn(n: ts.Node): boolean {
  let achou = false;
  const olhar = (no: ts.Node) => {
    if (achou) return;
    if (ts.isFunctionDeclaration(no) || ts.isFunctionExpression(no) || ts.isArrowFunction(no)) return;
    if (ts.isReturnStatement(no)) { achou = true; return; }
    ts.forEachChild(no, olhar);
  };
  ts.forEachChild(n, olhar);
  return achou;
}

export type Falha = { nome: string; linha: number };

/** Os componentes e hooks de um arquivo que chamam hook depois de um return. */
export function hooksDepoisDoReturn(codigo: string, nomeDoArquivo = 'arquivo.tsx'): Falha[] {
  const fonte = ts.createSourceFile(nomeDoArquivo, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const falhas: Falha[] = [];

  const conferirCorpo = (nome: string, corpo: ts.Block) => {
    let jaSaiu = false;
    for (const st of corpo.statements) {
      if (jaSaiu && temHook(st)) {
        const { line } = fonte.getLineAndCharacterOfPosition(st.getStart(fonte));
        falhas.push({ nome, linha: line + 1 });
        return;                       // uma por função basta para reprovar
      }
      /* Return do último statement é a saída normal do componente; o que
         importa é o que vem DEPOIS de um return. */
      if (ts.isReturnStatement(st) || temReturn(st)) jaSaiu = true;
    }
  };

  const visitar = (no: ts.Node) => {
    /* Componente (PascalCase) ou hook (useAlgo) — só nesses a ordem das
       chamadas é contada pelo React. */
    if (ts.isFunctionDeclaration(no) && no.name && no.body && /^([A-Z]|use[A-Z])/.test(no.name.text)) {
      conferirCorpo(no.name.text, no.body);
    }
    if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && /^([A-Z]|use[A-Z])/.test(no.name.text)) {
      const ini = no.initializer;
      if (ini && (ts.isArrowFunction(ini) || ts.isFunctionExpression(ini)) && ini.body && ts.isBlock(ini.body)) {
        conferirCorpo(no.name.text, ini.body);
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return falhas;
}

describe('ordem dos hooks', () => {
  it('reprova o padrão que causou a tela preta', () => {
    const ruim = `
      export default function Ficha() {
        const { data: cliente, isLoading } = useClient(id);
        if (isLoading || !cliente) return <Spinner />;
        const uso = useClientUsage(cliente);
        return <div>{uso}</div>;
      }`;
    expect(hooksDepoisDoReturn(ruim)).toHaveLength(1);
  });

  it('aceita o hook antes do return e o return no fim', () => {
    const bom = `
      export default function Ficha() {
        const { data: cliente, isLoading } = useClient(id);
        const uso = useClientUsage(cliente);
        if (isLoading || !cliente) return <Spinner />;
        return <div>{uso}</div>;
      }`;
    expect(hooksDepoisDoReturn(bom)).toHaveLength(0);
  });

  it('não confunde hook dentro de callback com hook de render', () => {
    const bom = `
      export default function Ficha() {
        const qc = useQueryClient();
        if (!ok) return null;
        const salvar = () => { const x = usePorEngano(); return x; };
        return <button onClick={salvar} />;
      }`;
    /* `usePorEngano` está dentro de uma arrow function: não roda no render,
       então não entra na contagem do React. */
    expect(hooksDepoisDoReturn(bom)).toHaveLength(0);
  });

  it('nenhuma tela do painel chama hook depois de um return', () => {
    const problemas = arquivos(join(RAIZ, 'pages'))
      .concat(arquivos(join(RAIZ, 'components')), arquivos(join(RAIZ, 'hooks')))
      .flatMap((f) => hooksDepoisDoReturn(readFileSync(f, 'utf8'), f)
        .map((p) => `${f.replace(RAIZ, 'src/')}:${p.linha} — ${p.nome}`));
    expect(problemas).toEqual([]);
  });
});
