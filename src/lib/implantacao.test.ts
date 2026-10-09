import { describe, expect, it } from 'vitest';
import { etapasDoCliente } from './estadoDoCliente';
import { fatosDaSaude, proximoPasso, ritmoDaImplantacao, estaImplantando, diasDesde, PASSOS, ORDEM_DA_IMPLANTACAO } from './implantacao';

const saude = (o: Partial<Parameters<typeof fatosDaSaude>[0] & object> = {}) => ({
  veiculos: 0, veiculos_anunciados: 0, canais_ligados: 0, usuarios: 1, usuarios_que_nunca_entraram: 1,
  ultimo_acesso_em: null, ultimo_veiculo_em: null, ...o,
});

describe('implantação', () => {
  it('cliente recém-vendido: o próximo passo é o contrato, e é nosso', () => {
    const etapas = etapasDoCliente({}, null);
    const p = proximoPasso(etapas)!;
    expect(p.chave).toBe('contrato_assinado');
    expect(p.dono).toBe('nos');
    expect(p.rota('c1')).toBe('/clientes/c1?resolver=contrato_assinado');
  });

  it('com sistema e acesso, falta estoque: a bola está com o cliente', () => {
    const etapas = etapasDoCliente(
      { contract_signed_at: '2026-09-14', pagou: true, lojista_company_id: 'e1' },
      fatosDaSaude(saude({ ultimo_acesso_em: '2026-10-01T10:00:00Z' })),
    );
    const p = proximoPasso(etapas)!;
    expect(p.chave).toBe('dados_importados');
    expect(p.dono).toBe('cliente');
    expect(p.lembrete).toBeTruthy();
  });

  it('domínio é cobrado por último: não trava quem já anuncia', () => {
    const etapas = etapasDoCliente(
      { contract_signed_at: 'x', pagou: true, lojista_company_id: 'e1', tarefas: [{ task_key: 'treinamento_realizado', done: true }] },
      fatosDaSaude(saude({ ultimo_acesso_em: 'x', veiculos: 5, canais_ligados: 1, veiculos_anunciados: 3 })),
    );
    expect(proximoPasso(etapas)?.chave).toBe('dominio_conectado');
  });

  it('tudo feito: sem próximo passo', () => {
    const etapas = etapasDoCliente(
      { contract_signed_at: 'x', pagou: true, lojista_company_id: 'e1', domain: 'loja.com.br', tarefas: [{ task_key: 'treinamento_realizado', done: true }] },
      fatosDaSaude(saude({ ultimo_acesso_em: 'x', veiculos: 5, canais_ligados: 1, veiculos_anunciados: 3 })),
    );
    expect(proximoPasso(etapas)).toBeNull();
  });

  it('quem entra na lista', () => {
    const semAnuncio = etapasDoCliente({ lojista_company_id: 'e1' }, fatosDaSaude(saude()));
    const anunciando = etapasDoCliente({ lojista_company_id: 'e1' }, fatosDaSaude(saude({ veiculos_anunciados: 2 })));
    const semPonte = etapasDoCliente({ lojista_company_id: 'e1' }, null);
    expect(estaImplantando('onboarding', anunciando)).toBe(true);
    expect(estaImplantando('ativo', semAnuncio)).toBe(true);
    expect(estaImplantando('ativo', anunciando)).toBe(false);
    expect(estaImplantando('ativo', semPonte)).toBe(false);
    expect(estaImplantando('cancelado', semAnuncio)).toBe(false);
  });

  it('ritmo: uma semana é o combinado, duas é atraso', () => {
    expect(ritmoDaImplantacao(3)).toBe('em_dia');
    expect(ritmoDaImplantacao(10)).toBe('atencao');
    expect(ritmoDaImplantacao(15)).toBe('atrasado');
    expect(diasDesde('2026-10-01T12:00:00Z', Date.parse('2026-10-09T13:00:00Z'))).toBe(8);
  });

  it('todo passo tem ação; passo do cliente sem rota tem lembrete', () => {
    for (const k of ORDEM_DA_IMPLANTACAO) {
      const p = PASSOS[k];
      expect(p.acao.length).toBeGreaterThan(3);
      if (p.rota('x') === null) expect(p.lembrete).toBeTruthy();
    }
  });
});
