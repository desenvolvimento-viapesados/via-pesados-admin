/**
 * Sugestão de categoria que o lojista ainda não tem.
 *
 * A tela mostra duas listas: as categorias da loja, vindas do banco, e uma
 * lista de sugestões fixa no código. O filtro comparava nome IDÊNTICO, então
 * "Aluguel do pátio" e "Aluguel" conviviam como se fossem coisas diferentes —
 * e o lojista via "Aluguel" duas vezes, "Software" duas vezes, "Marketing"
 * duas vezes. Ele acabava lançando metade num e metade no outro.
 *
 * Aqui duas categorias são a mesma coisa quando compartilham qualquer palavra
 * que signifique algo. "Água, luz e internet" cobre "Energia e Água" e
 * "Telefonia e Internet"; "Manutenção e preparação" cobre "Manutenção do
 * Espaço".
 */

/* Palavras que ligam e não distinguem. Sem tirá-las, "Energia e Água" e
   "Jurídico e Consultoria" seriam a mesma categoria por causa do "e". */
const VAZIAS = new Set([
  'e', 'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'em', 'com', 'para',
]);

export function palavrasDe(nome: string): Set<string> {
  return new Set(
    nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length > 2 && !VAZIAS.has(p)),
  );
}

/** Duas categorias falam da mesma coisa? */
export function mesmaCategoria(a: string, b: string): boolean {
  const pa = palavrasDe(a);
  const pb = palavrasDe(b);
  for (const p of pa) if (pb.has(p)) return true;
  return false;
}

/**
 * As sugestões que sobram depois de tirar o que a loja já tem.
 * Lista vazia = não mostra a seção; a loja já se organizou.
 */
export function sugestoesQueFaltam(sugestoes: string[], jaExistentes: string[]): string[] {
  return sugestoes.filter((s) => !jaExistentes.some((e) => mesmaCategoria(s, e)));
}
