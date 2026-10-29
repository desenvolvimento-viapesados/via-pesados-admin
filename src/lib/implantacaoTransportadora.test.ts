import { describe, it, expect } from 'vitest';
import { etapasDaTransportadora, fatosDaFicha, situacaoDoCliente } from './estadoDoCliente';
import { proximoPasso, estaImplantando, ORDEM_DA_TRANSPORTADORA, PASSOS_DA_TRANSPORTADORA } from './implantacao';
import type { FichaTransportadora } from '@/hooks/useTransportadoras';

const ficha = (p: Partial<FichaTransportadora> = {}): FichaTransportadora => ({
  nome: 'Transportes Exemplo', ativo: true, bloqueada_em: null, criada_em: '2026-10-29T12:00:00Z',
  certificado_ok: false, certificado_validade: null, pessoas: [], ultimo_acesso: null, primeiro_acesso: null,
  veiculos: 0, caminhoes: 0, motoristas: 0, clientes: 0, viagens: 0, viagens_30d: 0,
  primeira_viagem_em: null, ultima_viagem_em: null, frete_30d: 0, documentos_30d: 0, ...p,
});

const PAGO = { transportes_empresa_id: 't1', contract_signed_at: 'x', pagou: true };

describe('implantação da transportadora', () => {
  it('não tem domínio, canal, estoque nem anúncio', () => {
    const chaves = etapasDaTransportadora(PAGO, fatosDaFicha(ficha())).map((e) => e.chave);
    expect(chaves).toEqual(['contrato_assinado', 'pagamento_recebido', 'sistema_criado', 'acesso_liberado', 'frota_cadastrada', 'go_live', 'treinamento_realizado']);
    for (const k of ['dominio_conectado', 'canal_conectado', 'dados_importados']) expect(chaves).not.toContain(k);
  });

  it('sem sistema, o próximo passo é criar — e é com a gente', () => {
    const p = proximoPasso(etapasDaTransportadora({ contract_signed_at: 'x', pagou: true }, null), 'transportadora')!;
    expect(p.chave).toBe('sistema_criado');
    expect(p.dono).toBe('nos');
    expect(p.rota('c1')).toBe('/clientes/c1?resolver=sistema_criado');
  });

  it('segue a ordem: acesso, frota e motoristas, primeira viagem, treinamento', () => {
    const passo = (f: Partial<FichaTransportadora>) =>
      proximoPasso(etapasDaTransportadora(PAGO, fatosDaFicha(ficha(f))), 'transportadora')?.chave;
    expect(passo({})).toBe('acesso_liberado');
    expect(passo({ primeiro_acesso: '2026-10-29' })).toBe('frota_cadastrada');
    // Caminhão sem motorista ainda não roda.
    expect(passo({ primeiro_acesso: '2026-10-29', caminhoes: 3 })).toBe('frota_cadastrada');
    expect(passo({ primeiro_acesso: '2026-10-29', caminhoes: 3, motoristas: 2 })).toBe('go_live');
    expect(passo({ primeiro_acesso: '2026-10-29', caminhoes: 3, motoristas: 2, viagens: 1 })).toBe('treinamento_realizado');
  });

  it('frota e primeira viagem são do cliente, com o lembrete pronto', () => {
    expect(PASSOS_DA_TRANSPORTADORA.frota_cadastrada.dono).toBe('cliente');
    expect(PASSOS_DA_TRANSPORTADORA.go_live.lembrete).toMatch(/primeira viagem/);
    for (const k of ORDEM_DA_TRANSPORTADORA) {
      const p = PASSOS_DA_TRANSPORTADORA[k];
      // Passo do cliente sem lembrete deixaria a equipe sem o que mandar.
      if (p.dono === 'cliente') expect(p.lembrete).toBeTruthy();
      // Nada de anúncio, estoque ou site na frente das transportadoras.
      expect(`${p.acao} ${p.lembrete ?? ''}`).not.toMatch(/anúnc|estoque|site|domínio/i);
    }
  });

  it('sem resposta da ficha, diz "não sei" em vez de "não tem"', () => {
    const e = etapasDaTransportadora(PAGO, null).find((x) => x.chave === 'go_live')!;
    expect(e.feito).toBe(false);
    expect(e.porque).toMatch(/^Ainda não li/);
  });

  it('quem já lançou viagem está usando; quem pagou e não lançou está implantando', () => {
    const rodando = etapasDaTransportadora(PAGO, fatosDaFicha(ficha({ ultimo_acesso: new Date().toISOString(), caminhoes: 2, motoristas: 2, viagens: 5 })));
    expect(situacaoDoCliente(rodando, new Date().toISOString())).toBe('usando');
    expect(estaImplantando('ativo', rodando)).toBe(false);
    const parado = etapasDaTransportadora(PAGO, fatosDaFicha(ficha({ ultimo_acesso: new Date().toISOString() })));
    expect(estaImplantando('onboarding', parado)).toBe(true);
    expect(estaImplantando('ativo', parado)).toBe(true);
  });

  it('o lojista continua com a ordem dele quando a frente não é dita', () => {
    const p = proximoPasso(etapasDaTransportadora({ contract_signed_at: 'x', pagou: true }, null));
    // Sem frente = lojista: a ordem do lojista também começa por sistema_criado.
    expect(p?.chave).toBe('sistema_criado');
    expect(p?.rota('c1')).toBe('/clientes/c1?resolver=sistema_criado');
  });
});
