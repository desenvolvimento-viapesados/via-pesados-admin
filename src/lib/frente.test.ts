import { describe, it, expect, vi, beforeEach } from 'vitest';
import { comFrente, definirFrente, frenteAtual, abreNaEmpresa, rotuloDaFrente } from './frente';

const BANCO = 'https://ktjvyysqhsyvjmhumjly.supabase.co/rest/v1/clients?select=*';
const FUNCAO = 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/wa-acao';

const pegar = () => {
  const base = vi.fn(async (_i: RequestInfo | URL, _init?: RequestInit) => new Response('[]'));
  return { base, f: comFrente(base as unknown as typeof fetch) };
};
const cabecalhos = (base: ReturnType<typeof pegar>['base']) => new Headers(base.mock.calls[0][1]?.headers);

describe('cabeçalho x-frente', () => {
  beforeEach(() => definirFrente('lojista'));

  it('vai em toda consulta ao banco, com a frente atual', async () => {
    definirFrente('transportadora');
    const { base, f } = pegar();
    await f(BANCO, { headers: { apikey: 'k', Authorization: 'Bearer t' } });
    const h = cabecalhos(base);
    expect(h.get('x-frente')).toBe('transportadora');
    expect(h.get('apikey')).toBe('k');
    expect(h.get('authorization')).toBe('Bearer t');
  });

  it('mantém os cabeçalhos quando vêm como Headers ou como lista de pares', async () => {
    definirFrente('empresa');
    const a = pegar();
    await a.f(BANCO, { headers: new Headers({ Prefer: 'return=representation' }) });
    expect(cabecalhos(a.base).get('prefer')).toBe('return=representation');
    expect(cabecalhos(a.base).get('x-frente')).toBe('empresa');

    const b = pegar();
    await b.f(new URL(BANCO), { headers: [['Range', '0-9']] });
    expect(cabecalhos(b.base).get('range')).toBe('0-9');
    expect(cabecalhos(b.base).get('x-frente')).toBe('empresa');
  });

  it('troca de frente vale para o pedido seguinte', async () => {
    const { base, f } = pegar();
    await f(BANCO, {});
    definirFrente('transportadora');
    await f(BANCO, {});
    expect(new Headers(base.mock.calls[0][1]?.headers).get('x-frente')).toBe('lojista');
    expect(new Headers(base.mock.calls[1][1]?.headers).get('x-frente')).toBe('transportadora');
    expect(frenteAtual()).toBe('transportadora');
  });

  it('não vai para as funções: elas recusariam o cabeçalho no navegador', async () => {
    definirFrente('transportadora');
    const { base, f } = pegar();
    const init = { method: 'POST', headers: { Authorization: 'Bearer t' } };
    await f(FUNCAO, init);
    expect(base.mock.calls[0][1]).toBe(init);
    expect(new Headers(base.mock.calls[0][1]?.headers).has('x-frente')).toBe(false);
  });
});

describe('telas que abrem na Empresa', () => {
  it('só a visão geral e os módulos da empresa', () => {
    for (const r of ['/', '/financeiro', '/metas', '/equipe', '/conselho', '/saude']) expect(abreNaEmpresa(r)).toBe(true);
    for (const r of ['/clientes', '/clientes/1', '/crm', '/implantacao', '/testes', '/pagamentos', '/planos', '/tickets', '/relatorios', '/whatsapp'])
      expect(abreNaEmpresa(r)).toBe(false);
  });

  it('o nome da frente é o do dono', () => {
    expect(rotuloDaFrente('lojista')).toBe('Lojistas');
    expect(rotuloDaFrente('transportadora')).toBe('Transportadoras');
    expect(rotuloDaFrente('empresa')).toBe('Empresa');
  });
});
