import { describe, expect, it } from 'vitest';
import { prazoDoChamado, ordenarChamados } from './chamados';

const agora = new Date('2026-10-08T12:00:00Z');
const t = (priority: 'baixa' | 'media' | 'alta' | 'urgente', aberto: string, status = 'aberto', resolved_at: string | null = null) =>
  ({ priority, status, created_at: aberto, resolved_at });

describe('prazo do chamado', () => {
  it('urgente vence em 4h, alta em 24h', () => {
    expect(prazoDoChamado(t('urgente', '2026-10-08T10:00:00Z'), agora)).toMatchObject({ estado: 'no_prazo', texto: 'vence em 2h' });
    // no último quarto do prazo, "perto"
    expect(prazoDoChamado(t('urgente', '2026-10-08T08:30:00Z'), agora)).toMatchObject({ estado: 'perto', texto: 'vence em menos de 1h' });
    expect(prazoDoChamado(t('alta', '2026-10-08T06:00:00Z'), agora)).toMatchObject({ estado: 'no_prazo', texto: 'vence em 18h' });
  });

  it('estourado diz há quanto tempo', () => {
    expect(prazoDoChamado(t('alta', '2026-10-05T12:00:00Z'), agora)).toMatchObject({ estado: 'estourado', texto: 'atrasado há 2 dias' });
  });

  it('resolvido diz se foi no prazo', () => {
    expect(prazoDoChamado(t('media', '2026-10-01T12:00:00Z', 'resolvido', '2026-10-02T12:00:00Z'), agora).texto).toBe('resolvido no prazo');
    expect(prazoDoChamado(t('urgente', '2026-10-01T12:00:00Z', 'resolvido', '2026-10-01T20:00:00Z'), agora).texto).toBe('resolvido com 4h de atraso');
  });

  it('ordem: estourado, depois o que vence antes, resolvidos no fim', () => {
    const lista = [
      { id: 'r', ...t('urgente', '2026-10-07T12:00:00Z', 'resolvido', '2026-10-07T13:00:00Z') },
      { id: 'b', ...t('baixa', '2026-10-08T11:00:00Z') },
      { id: 'e', ...t('alta', '2026-10-06T12:00:00Z') },
      { id: 'u', ...t('urgente', '2026-10-08T11:00:00Z') },
    ];
    expect(ordenarChamados(lista, agora).map((x) => x.id)).toEqual(['e', 'u', 'b', 'r']);
  });
});
