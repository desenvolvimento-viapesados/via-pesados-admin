import { describe, it, expect } from 'vitest';
import { mesmaCategoria, sugestoesQueFaltam, palavrasDe } from './categoriasFinanceiras';

/**
 * Os nomes abaixo são os reais: as 11 categorias de despesa da iTruck, do
 * banco, contra a lista de sugestões que vive no código.
 */

const DA_ITRUCK = [
  'Água, luz e internet', 'Aluguel do pátio', 'Combustível e frete',
  'Comissão de vendedor', 'Compra de veículo', 'Contabilidade',
  'Folha de pagamento', 'Impostos e taxas', 'Manutenção e preparação',
  'Marketing e anúncios', 'Software e sistemas',
];

const SUGERIDAS = [
  'Aluguel', 'Energia e Água', 'Manutenção do Espaço',
  'Telefonia e Internet', 'Software e Tecnologia',
  'Marketing e Publicidade',
  'Contabilidade', 'Impostos e Taxas', 'Despesas Bancárias',
  'Seguros da Empresa', 'Material de Escritório',
  'Combustível e Transporte', 'Viagens e Hospedagem',
  'Alimentação', 'Treinamento e Cursos',
  'Jurídico', 'Consultoria', 'Outros',
];

describe('palavrasDe', () => {
  it('ignora acento, caixa e pontuação', () => {
    expect(palavrasDe('Água, luz e internet')).toEqual(new Set(['agua', 'luz', 'internet']));
  });

  it('descarta as palavras que só ligam', () => {
    // Sem isso, "Energia e Água" e "Jurídico e Consultoria" virariam a mesma
    // categoria por causa do "e".
    expect(palavrasDe('Manutenção do Espaço')).toEqual(new Set(['manutencao', 'espaco']));
  });
});

describe('mesmaCategoria — os pares que o lojista via duplicados', () => {
  it.each([
    ['Aluguel do pátio', 'Aluguel'],
    ['Software e sistemas', 'Software e Tecnologia'],
    ['Marketing e anúncios', 'Marketing e Publicidade'],
    ['Manutenção e preparação', 'Manutenção do Espaço'],
    ['Impostos e taxas', 'Impostos e Taxas'],
    ['Água, luz e internet', 'Energia e Água'],
    ['Água, luz e internet', 'Telefonia e Internet'],
    ['Combustível e frete', 'Combustível e Transporte'],
    ['Contabilidade', 'Contabilidade'],
  ])('%s e %s são a mesma coisa', (a, b) => {
    expect(mesmaCategoria(a, b)).toBe(true);
  });

  it.each([
    ['Folha de pagamento', 'Alimentação'],
    ['Comissão de vendedor', 'Consultoria'],
    ['Compra de veículo', 'Viagens e Hospedagem'],
    ['Jurídico', 'Consultoria'],
    ['Energia e Água', 'Jurídico'],
  ])('%s e %s continuam separadas', (a, b) => {
    expect(mesmaCategoria(a, b)).toBe(false);
  });
});

describe('sugestoesQueFaltam — o que sobra para a iTruck', () => {
  const sobram = sugestoesQueFaltam(SUGERIDAS, DA_ITRUCK);

  it('não repete nada que ela já tem', () => {
    for (const repetida of [
      'Aluguel', 'Energia e Água', 'Telefonia e Internet', 'Software e Tecnologia',
      'Marketing e Publicidade', 'Contabilidade', 'Impostos e Taxas',
      'Manutenção do Espaço', 'Combustível e Transporte',
    ]) {
      expect(sobram).not.toContain(repetida);
    }
  });

  it('mantém as que fazem falta de verdade', () => {
    expect(sobram).toEqual(expect.arrayContaining([
      'Despesas Bancárias', 'Seguros da Empresa', 'Material de Escritório',
      'Viagens e Hospedagem', 'Alimentação', 'Treinamento e Cursos',
      'Jurídico', 'Consultoria', 'Outros',
    ]));
  });

  it('corta mais da metade do ruído da tela', () => {
    expect(SUGERIDAS.length).toBe(18);
    expect(sobram.length).toBe(9);
  });

  it('loja sem categoria nenhuma continua vendo todas as sugestões', () => {
    expect(sugestoesQueFaltam(SUGERIDAS, [])).toHaveLength(18);
  });
});
