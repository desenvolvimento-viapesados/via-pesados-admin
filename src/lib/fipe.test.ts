import { describe, expect, it } from 'vitest';
import {
  anoDoModelo, enderecoDoSite, escolherModelo, marcaFipe, ordenarOfertas, oferta, pedacos, precoEmReais, queda,
} from '../../supabase/functions/_shared/fipe-regras';

const VOLVO = [
  { codigo: '5849', nome: 'FH-540 6x4 2p (diesel) (E5)' },
  { codigo: '10521', nome: 'FH-540 6X4 2p (diesel) (E6)' },
  { codigo: '10496', nome: 'FH-460 6X2 2p (diesel) (E6)' },
  { codigo: '10524', nome: 'FH-540 GLOBETROTTER 4X2 2p (diesel) (E6)' },
];
const VW = [
  { codigo: '5948', nome: '24-280 E Constel. 6x2 2p (diesel)(E5)' },
  { codigo: '9246', nome: 'Meteor 29.520 6x4 2p (diesel)(E5)' },
];

describe('ferramenta FIPE (dono, 24/11/2026)', () => {
  it('marca do anúncio vira a marca da FIPE', () => {
    expect(marcaFipe('VW')).toBe('VOLKSWAGEN');
    expect(marcaFipe('Mercedes Benz')).toBe('MERCEDES-BENZ');
    expect(marcaFipe('Scania')).toBe('SCANIA');
  });

  it('pedaços juntam número com ponto/traço e separam a tração', () => {
    expect(pedacos('Constellation 24.280')).toContain('24280');
    expect(pedacos('24-280 E Constel.')).toContain('24280');
    expect(pedacos('Volvo FH 540 6x4')).toEqual(expect.arrayContaining(['fh', '540', '6x4']));
  });

  it('casa o anúncio com o modelo certo, pela tração e pelo Euro do ano', () => {
    expect(escolherModelo('FH 540 6x4', 2023, VOLVO)?.codigo).toBe('10521');
    expect(escolherModelo('FH 540 6x4', 2019, VOLVO)?.codigo).toBe('5849');
    expect(escolherModelo('FH 460 6x2', 2022, VOLVO)?.codigo).toBe('10496');
    expect(escolherModelo('Constellation 24.280', 2016, VW)?.codigo).toBe('5948');
    expect(escolherModelo('Meteor 29520', 2023, VW)?.codigo).toBe('9246');
  });

  it('sem número de modelo, não chuta', () => {
    expect(escolherModelo('Volvo FH', 2020, VOLVO)).toBeNull();
  });

  it('preço e ano do anúncio', () => {
    expect(precoEmReais('R$ 729.000,00')).toBe(729000);
    expect(precoEmReais('729000')).toBe(729000);
    expect(precoEmReais('R$ 5.000')).toBeNull();
    expect(anoDoModelo('2023/2024')).toBe(2024);
    expect(anoDoModelo('sem ano')).toBeNull();
  });

  it('a conta do S-Way 2024 bate com o carrossel', () => {
    const q = queda(760469, 561088);
    expect(Math.round(q.perda)).toBe(199381);
    expect(Math.round(q.porDia)).toBe(546);
    expect(Math.round(q.em90)).toBe(49162);
    expect(q.pct.toFixed(1)).toBe('26.2');
  });

  it('ofertas vão da melhor à pior', () => {
    const l = ordenarOfertas([oferta('A', 2024, 620000, 561088), oferta('B', 2025, 729000, 759529)]);
    expect(l[0].titulo).toBe('B');
    expect(l[0].diferenca).toBe(-30529);
  });

  it('endereço do site: aceita sem https e recusa endereço interno', () => {
    expect(enderecoDoSite('minhaloja.com.br/estoque')).toBe('https://minhaloja.com.br/estoque');
    expect(enderecoDoSite('localhost:3000')).toBeNull();
    expect(enderecoDoSite('192.168.0.1')).toBeNull();
    expect(enderecoDoSite('nada')).toBeNull();
  });
});
