import { describe, expect, it } from 'vitest';
import {
  avaliarAsaas, avaliarCanalOficial, avaliarNotaFiscal, avaliarNumerosDaEquipe, avaliarVercel, resumoDaSaude,
} from './saude';

describe('saúde da plataforma', () => {
  it('canal oficial: conectado, verde e modelos aprovados é ok', () => {
    const v = avaliarCanalOficial({ numero: { situacao: 'CONNECTED', qualidade: 'GREEN' }, total: 11, por_status: { APPROVED: 11 }, entrega: { segredo_guardado: true, combinando: true } });
    expect(v.estado).toBe('ok');
    expect(v.detalhe).toBe('conectado · qualidade verde · 11 de 11 modelos aprovados');
  });

  it('canal oficial: modelo pendente pede atenção; desconectado é erro; sem dados é sem resposta', () => {
    expect(avaliarCanalOficial({ numero: { situacao: 'CONNECTED', qualidade: 'GREEN' }, total: 11, por_status: { APPROVED: 10 } }).estado).toBe('atencao');
    expect(avaliarCanalOficial({ numero: { situacao: 'FLAGGED', qualidade: 'GREEN' }, total: 11, por_status: { APPROVED: 11 } }).estado).toBe('erro');
    expect(avaliarCanalOficial(null).estado).toBe('sem_resposta');
  });

  it('Asaas: webhook parado é erro; sem segredo é atenção', () => {
    expect(avaliarAsaas({ ok: true, ambiente: 'producao', webhooks: [{ nome: 'cobranças', ativo: true, interrompido: false, tem_autenticacao: true }] }).estado).toBe('ok');
    expect(avaliarAsaas({ ok: true, webhooks: [{ nome: 'cobranças', ativo: true, interrompido: true }] }).estado).toBe('erro');
    expect(avaliarAsaas({ ok: true, webhooks: [] }).estado).toBe('erro');
    expect(avaliarAsaas({ ok: true, webhooks: [{ nome: 'x', ativo: true, interrompido: false, tem_autenticacao: false }] }).estado).toBe('atencao');
  });

  it('nota fiscal, Vercel e números da equipe', () => {
    expect(avaliarNotaFiscal({ configuracao_fiscal: { ja_configurada: true } }).estado).toBe('ok');
    expect(avaliarNotaFiscal({ configuracao_fiscal: { ja_configurada: false } }).estado).toBe('atencao');
    expect(avaliarVercel({ token: 'válido', deploys: [{ estado: 'ERROR', mensagem: 'x' }] }).estado).toBe('erro');
    expect(avaliarVercel({ token: 'válido', deploys: [{ estado: 'READY' }] }).estado).toBe('ok');
    expect(avaliarNumerosDaEquipe([
      { nome: 'Oficial', origem: 'cloud_api', connection_state: null },
      { nome: 'Suporte', origem: 'evolution', connection_state: 'close' },
    ])).toMatchObject({ estado: 'atencao', detalhe: 'Desconectado: Suporte' });
  });

  it('resumo: erro manda, depois atenção', () => {
    const ok = { chave: 'a', titulo: 'a', estado: 'ok' as const, detalhe: '' };
    expect(resumoDaSaude([ok, ok]).texto).toBe('Tudo funcionando');
    expect(resumoDaSaude([ok, { ...ok, estado: 'atencao' }]).estado).toBe('atencao');
    expect(resumoDaSaude([{ ...ok, estado: 'erro' }, { ...ok, estado: 'atencao' }]).texto).toBe('1 ponto parado e 1 pedindo atenção');
  });
});
