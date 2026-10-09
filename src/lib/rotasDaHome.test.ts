/**
 * Todo botão da Home leva a uma tela que existe. Um módulo novo entra na
 * grade da Home (pages/Home.tsx) e na lista de rotas (App.tsx); se faltar a
 * rota, o botão cairia numa tela em branco.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ler = (a: string) => readFileSync(join(process.cwd(), a), 'utf8');

describe('botões da Home', () => {
  it('cada navigate da Home aponta para uma rota do App', () => {
    const rotas = [...ler('src/App.tsx').matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
    const destinos = [...ler('src/pages/Home.tsx').matchAll(/navigate\('([^']+)'\)/g)].map((m) => m[1].split('?')[0]);
    expect(destinos.length).toBeGreaterThan(5);
    for (const d of destinos) expect(rotas, d).toContain(d);
  });
});
