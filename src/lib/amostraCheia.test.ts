import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/* A Rodolima foi ao ar vazia (13/10/2026): o seed falhou no servidor, o
   provisionamento devolveu `seed_error` e ninguém leu. A amostra é o
   argumento de venda — vazia, ela vende o contrário. */
describe('amostra nasce cheia ou avisa', () => {
  it('provisionarAmostra lê o seed_error, tenta de novo e avisa se falhar', () => {
    const fonte = readFileSync('src/components/crm/AmostrasTab.tsx', 'utf8');
    const fn = fonte.slice(fonte.indexOf('export async function provisionarAmostra'), fonte.indexOf('const HERO_FIELDS'));
    expect(fn).toMatch(/if \(provisioned\.seed_error\)/);
    expect(fn).toMatch(/await semearAmostra\(provisioned\.company_id\)/);
    expect(fn).toMatch(/toast\.error\(/);
  });
});
