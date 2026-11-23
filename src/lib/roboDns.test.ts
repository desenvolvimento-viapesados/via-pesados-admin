import { describe, expect, it } from 'vitest';
import { mudancasRegistroBr, telaConfere, PROIBIDO } from '../../supabase/functions/_shared/robo-regras';

const plano = {
  dominio: 'itruckcaminhoes.com.br', provedor: 'Registro.br',
  apagar: [{ tipo: 'A', nome: '(deixe o nome vazio)', valor: '15.197.148.33' }],
  criar: [
    { tipo: 'A', nome: '(deixe o nome vazio)', valor: '216.198.79.1' },
    { tipo: 'CNAME', nome: 'www', valor: 'e8d37b24f7eb7ce2.vercel-dns-017.com' },
  ],
  manter: [],
};

describe('robô de DNS no Registro.br', () => {
  it('troca o A da raiz e o www, sem tocar no e-mail', () => {
    const rrs = [
      { Ownername: '', Type: 'A', Rdata: '15.197.148.33' },
      { Ownername: 'www', Type: 'CNAME', Rdata: 'velho.cloudfront.net.' },
      { Ownername: '', Type: 'MX', Rdata: '10 smtp.google.com.' },
      { Ownername: '_dmarc', Type: 'TXT', Rdata: 'v=DMARC1' },
    ];
    const { add, remove } = mudancasRegistroBr(rrs, plano);
    expect(remove).toEqual([rrs[0], rrs[1]]);
    expect(add).toEqual([
      { Ownername: '', Type: 'A', Rdata: '216.198.79.1' },
      { Ownername: 'www', Type: 'CNAME', Rdata: 'e8d37b24f7eb7ce2.vercel-dns-017.com' },
    ]);
  });

  it('zona vazia (domínio desconectado): só cria', () => {
    const { add, remove } = mudancasRegistroBr([], plano);
    expect(remove).toEqual([]);
    expect(add).toHaveLength(2);
  });

  it('já certo: nada a fazer, mesmo com ponto final e nome completo', () => {
    const rrs = [
      { Ownername: 'itruckcaminhoes.com.br', Type: 'A', Rdata: '216.198.79.1' },
      { Ownername: 'www', Type: 'CNAME', Rdata: 'e8d37b24f7eb7ce2.vercel-dns-017.com.' },
    ];
    expect(mudancasRegistroBr(rrs, plano)).toEqual({ add: [], remove: [] });
  });
});

describe('conferência e travas', () => {
  it('só conclui com os valores novos na tela e os velhos fora', () => {
    expect(telaConfere('A 216.198.79.1 CNAME e8d37b24f7eb7ce2.vercel-dns-017.com', plano).ok).toBe(true);
    expect(telaConfere('A 15.197.148.33 A 216.198.79.1 e8d37b24f7eb7ce2.vercel-dns-017.com', plano).ok).toBe(false);
    expect(telaConfere('A 216.198.79.1', plano).falta).toEqual(['e8d37b24f7eb7ce2.vercel-dns-017.com']);
  });

  it('trava botões perigosos e deixa os de DNS', () => {
    for (const t of ['Alterar servidores DNS', 'Renovar', 'Pagar boleto', 'Alterar senha', 'Transferir domínio', 'DNSSEC', 'Excluir domínio']) expect(PROIBIDO.test(t), t).toBe(true);
    for (const t of ['Nova entrada', 'Salvar alterações', 'Adicionar', 'Configurar zona DNS', 'Modo avançado', 'Remover record', 'Adicionar registro']) expect(PROIBIDO.test(t), t).toBe(false);
  });
});
