/**
 * Máscaras de digitação — telefone e dinheiro.
 *
 * O formato de dinheiro é o mesmo do sistema-lojista (`src/utils/brCurrency.ts`):
 * preenche da direita para a esquerda tratando o digitado como centavos. É a
 * mesma pessoa operando os dois sistemas, então divergir de convenção aqui
 * significaria que o mesmo gesto produz números diferentes em telas diferentes.
 */

/** `27997246060` → `(27) 99724-6060`. Formata enquanto digita, sem esperar o campo completo. */
export const mascaraTelefone = (valor: string | null | undefined) => {
  const d = String(valor ?? '').replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  // Fixo tem 8 dígitos depois do DDD, celular tem 9. O hífen anda uma casa
  // quando o nono chega — é assim em todo formulário brasileiro.
  const corte = d.length <= 10 ? 6 : 7;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
};

/** Só os dígitos, para gravar e comparar. */
export const soDigitos = (valor: string | null | undefined) =>
  String(valor ?? '').replace(/\D/g, '');

/** `1200000` → `12.000,00`. O digitado são centavos. */
export const mascaraMoeda = (valor: string | number | null | undefined) => {
  const d = String(valor ?? '').replace(/\D/g, '');
  if (!d) return '';
  return (Number(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** `12.000,00` → `12000`. Devolve null quando não dá número. */
export const valorDaMoeda = (valor: string | number | null | undefined) => {
  if (valor == null || valor === '') return null;
  const n = Number(String(valor).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** `1200` → `1.200,00`. Para pré-preencher um campo com máscara a partir do banco. */
export const moedaDeNumero = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
