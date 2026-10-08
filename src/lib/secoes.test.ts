/**
 * O mapa do painel (lib/secoes.ts). Trava as duas coisas que quebram em
 * silêncio quando alguém mexe: um cartão apontando para uma rota que não
 * existe, e uma tela sem seção — que voltaria para o Início em vez de voltar
 * para a seção dela.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECOES, secaoDaRota, voltarDe } from './secoes';

const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
const rotasDoApp = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
const existe = (rota: string) => {
  const caminho = rota.split('?')[0];
  return rotasDoApp.some((r) => {
    const padrao = new RegExp('^' + r.replace(/:[^/]+/g, '[^/]+') + '$');
    return padrao.test(caminho);
  });
};

describe('mapa do painel', () => {
  it('são seis seções, cada uma com chave única e pelo menos uma subseção', () => {
    expect(SECOES.map((s) => s.chave)).toEqual(['comercial', 'clientes', 'financeiro', 'suporte', 'operacao', 'gestao']);
    for (const s of SECOES) expect(s.subsecoes.length, s.chave).toBeGreaterThan(0);
  });

  it('todo cartão interno aponta para uma rota que existe', () => {
    for (const s of SECOES) {
      for (const sub of s.subsecoes.filter((x) => !x.externa)) {
        expect(existe(sub.rota), `${s.chave} › ${sub.titulo} → ${sub.rota}`).toBe(true);
      }
    }
    expect(existe('/secao/comercial')).toBe(true);
  });

  it('toda tela do painel mora numa seção', () => {
    const telas = rotasDoApp.filter((r) => r !== '/' && !r.startsWith('/secao') && !r.includes(':')
      && !['/funil', '/reunioes', '/amostras', '*'].includes(r));
    for (const t of telas) expect(secaoDaRota(t), t).not.toBeNull();
  });

  it('o voltar sobe um degrau', () => {
    expect(voltarDe('/secao/financeiro')).toEqual({ para: '/', rotulo: 'Início' });
    expect(voltarDe('/financeiro')).toEqual({ para: '/secao/financeiro', rotulo: 'Financeiro' });
    expect(voltarDe('/clientes')).toEqual({ para: '/secao/clientes', rotulo: 'Clientes' });
    expect(voltarDe('/clientes/abc')).toEqual({ para: '/clientes', rotulo: 'Clientes' });
    expect(voltarDe('/clientes/abc/cobranca')).toEqual({ para: '/clientes/abc', rotulo: 'Cliente' });
    expect(voltarDe('/metas')).toEqual({ para: '/secao/gestao', rotulo: 'Gestão' });
  });
});
