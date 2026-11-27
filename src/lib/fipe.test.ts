import { describe, expect, it } from 'vitest';
import {
  anoDoModelo, destinoSeguro, enderecoDoSite, escolherModelo, ipProibido, marcaFipe, ordenarOfertas, oferta, pedacos, precoEmReais, queda,
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

describe('cavalo mecânico × caminhão (dono, 24/11/2026)', () => {
  it('vale o que a IA leu; sem isso, o texto do anúncio', async () => {
    const { tipoDoVeiculo } = await import('../../supabase/functions/_shared/fipe-regras');
    expect(tipoDoVeiculo('cavalo', 'Volvo FH 540')).toBe('cavalo');
    expect(tipoDoVeiculo('caminhao', 'Cavalo 6x4')).toBe('caminhao');
    expect(tipoDoVeiculo(null, 'VOLVO FH 540 Cavalo 6x4')).toBe('cavalo');
    expect(tipoDoVeiculo(undefined, 'Constellation 24.280 baú')).toBe('caminhao');
  });
});

describe('ferramenta FIPE não abre rede interna (27/11/2026)', () => {
  it('recusa IP privado, loopback, link-local, CGNAT, multicast e 0.0.0.0', () => {
    for (const ip of [
      '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.254', '192.168.1.10', '127.0.0.1', '127.8.8.8',
      '169.254.169.254', '100.64.0.1', '100.127.255.254', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    ]) expect(ipProibido(ip), ip).toBe(true);
  });

  it('recusa IPv6 local, privado e IPv4-mapeado', () => {
    for (const ip of [
      '::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:8.8.8.8', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%en0',
      'ff02::1', '64:ff9b::a9fe:a9fe', '2002:0a00:0001::1', 'nao-e-ip', '1::2::3',
    ]) expect(ipProibido(ip), ip).toBe(true);
  });

  it('deixa passar IP público, inclusive 172.32.x e 100.128.x, que ficam fora das faixas', () => {
    for (const ip of ['172.32.0.1', '172.15.255.255', '100.128.0.1', '8.8.8.8', '200.147.67.142', '2804:14c::1', '2606:4700::6810:84e5']) {
      expect(ipProibido(ip), ip).toBe(false);
    }
  });

  it('o endereço digitado: só http/https, porta padrão, sem senha e sem IP interno escrito direto', () => {
    expect(enderecoDoSite('http://minhaloja.com.br')).toBe('http://minhaloja.com.br/');
    expect(enderecoDoSite('https://minhaloja.com.br:443/estoque')).toBe('https://minhaloja.com.br/estoque');
    expect(enderecoDoSite('minhaloja.com.br:8080')).toBeNull();
    expect(enderecoDoSite('ftp://minhaloja.com.br')).toBeNull();
    expect(enderecoDoSite('file:///etc/passwd')).toBeNull();
    expect(enderecoDoSite('https://user:senha@minhaloja.com.br')).toBeNull();
    expect(enderecoDoSite('172.16.0.1')).toBeNull();
    expect(enderecoDoSite('http://2130706433/')).toBeNull(); // 127.0.0.1 escrito como número
    expect(enderecoDoSite('http://0x7f.1/')).toBeNull();
    expect(enderecoDoSite('http://[::1]/')).toBeNull();
    expect(enderecoDoSite('http://[::ffff:127.0.0.1]/')).toBeNull();
    expect(enderecoDoSite('servidor.local')).toBeNull();
    expect(enderecoDoSite('172.32.0.1')).toBe('https://172.32.0.1/');
  });

  const dns = (tabela: Record<string, { A?: string[]; AAAA?: string[] }>) =>
    async (nome: string, tipo: 'A' | 'AAAA') => {
      const r = tabela[nome]?.[tipo];
      if (!r) throw new Error('NXDOMAIN');
      return r;
    };

  it('resolve o nome e recusa se QUALQUER IP for interno (como 127.0.0.1.nip.io)', async () => {
    const resolver = dns({
      'minhaloja.com.br': { A: ['200.147.67.142'], AAAA: ['2804:14c::1'] },
      '127.0.0.1.nip.io': { A: ['127.0.0.1'] },
      'metade.com.br': { A: ['200.147.67.142', '10.0.0.5'] },
      'so-v6-local.com.br': { AAAA: ['fd00::1'] },
      'mapeado.com.br': { AAAA: ['::ffff:169.254.169.254'] },
    });
    expect(await destinoSeguro('https://minhaloja.com.br/estoque', resolver)).toBe(true);
    expect(await destinoSeguro('https://127.0.0.1.nip.io/', resolver)).toBe(false);
    expect(await destinoSeguro('https://metade.com.br/', resolver)).toBe(false);
    expect(await destinoSeguro('https://so-v6-local.com.br/', resolver)).toBe(false);
    expect(await destinoSeguro('https://mapeado.com.br/', resolver)).toBe(false);
    expect(await destinoSeguro('https://nao-existe.com.br/', resolver)).toBe(false);
    /* Redirecionamento para porta, esquema ou IP interno também cai aqui. */
    expect(await destinoSeguro('https://minhaloja.com.br:8443/', resolver)).toBe(false);
    expect(await destinoSeguro('gopher://minhaloja.com.br/', resolver)).toBe(false);
    expect(await destinoSeguro('http://169.254.169.254/latest/meta-data/', resolver)).toBe(false);
    expect(await destinoSeguro('http://localhost/', resolver)).toBe(false);
  });
});
