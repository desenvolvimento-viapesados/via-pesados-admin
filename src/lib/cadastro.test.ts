import { describe, expect, it } from 'vitest';
import {
  desfechoDaResposta, ehCadastroDeTeste, montarCadastro, proximaTentativa, reais, telefoneParaEscala,
  ESPERA_ENTRE_TENTATIVAS_MIN,
} from '../../supabase/functions/_shared/cadastro-regras';
import { mascaraTelefoneDoBanco } from './mascaras';

describe('cadastro para a Escala SaaS', () => {
  it('telefone: DDD + número, sem o 55, mantendo o 9', () => {
    expect(telefoneParaEscala('(33) 98814-4005')).toBe('33988144005');
    expect(telefoneParaEscala('5533988144005')).toBe('33988144005');
    expect(telefoneParaEscala('(33) 3271-1234')).toBe('3332711234');
    expect(telefoneParaEscala('(55) 99999-8888')).toBe('55999998888');
    expect(telefoneParaEscala(null)).toBe('');
  });

  it('celular sem o 9 ganha o 9 (WhatsApp que entrega sem ele, ou digitado com 8 dígitos); fixo não', () => {
    expect(telefoneParaEscala('553188144005')).toBe('31988144005');
    expect(telefoneParaEscala('(33) 9881-4005')).toBe('33998814005');
    expect(telefoneParaEscala('554188887777')).toBe('41988887777');
    expect(telefoneParaEscala('553332711234')).toBe('3332711234');
  });

  it('campo preenchido com o número do card do assistente não corta o último dígito', () => {
    expect(mascaraTelefoneDoBanco('5533988887777')).toBe('(33) 98888-7777');
    expect(mascaraTelefoneDoBanco('553388887777')).toBe('(33) 98888-7777');
    expect(mascaraTelefoneDoBanco('(27) 99724-6060')).toBe('(27) 99724-6060');
    expect(mascaraTelefoneDoBanco(null)).toBe('');
  });

  it('número de teste do dono fica de fora, com ou sem o 9 e com máscara', () => {
    const testes = ['27 99724-6060'];
    expect(ehCadastroDeTeste('(27) 99724-6060', testes)).toBe(true);
    expect(ehCadastroDeTeste('5527997246060', testes)).toBe(true);
    expect(ehCadastroDeTeste('552797246060', testes)).toBe(true);
    expect(ehCadastroDeTeste('(27) 99724-6061', testes)).toBe(false);
    expect(ehCadastroDeTeste('(27) 99724-6060', [])).toBe(false);
  });

  it('lead do assistente: sem e-mail, sem campo vazio, empresa que é telefone não vira empresa', () => {
    const c = montarCadastro('lead', {
      company_name: '5533999990000', contact_name: 'João', whatsapp: '5533999990000',
      email: null, city: 'Governador Valadares', state: 'mg', frente: 'lojista', stage: 'contato',
      proposal_value: null, plan: null,
    }, { canal: 'Assistente de vendas' });
    expect(c).toEqual({
      name: 'João',
      phone: '33999990000',
      custom_fields: {
        'Tipo de cadastro': 'Lead', Cidade: 'Governador Valadares', UF: 'MG', Frente: 'Lojista',
        Origem: 'Assistente de vendas', Etapa: 'Contato',
      },
    });
    expect(c).not.toHaveProperty('email');
  });

  it('lead sem nome de contato usa o nome da empresa', () => {
    const c = montarCadastro('lead', { company_name: 'Rodolfo Caminhões', whatsapp: '(31) 99999-0000', proposal_value: 437 });
    expect(c?.name).toBe('Rodolfo Caminhões');
    expect(c?.custom_fields.Empresa).toBe('Rodolfo Caminhões');
    expect(c?.custom_fields['Mensalidade proposta']).toBe('R$ 437,00');
  });

  it('cliente: e-mail em minúsculas, plano pelo nome, teste grátis marcado', () => {
    const c = montarCadastro('cliente', {
      company_name: 'Loja X', contact_name: ' Ana Souza ', whatsapp: '(11) 99999-8888', email: ' Ana@Empresa.com ',
      frente: 'transportadora', mrr: 1437.5, plan: null,
    }, { plano: 'Completo', testeGratis: true });
    expect(c).toEqual({
      name: 'Ana Souza',
      email: 'ana@empresa.com',
      phone: '11999998888',
      custom_fields: {
        'Tipo de cadastro': 'Teste grátis', Empresa: 'Loja X', Frente: 'Transportadora',
        Mensalidade: 'R$ 1.437,50', 'Plano escolhido': 'Completo',
      },
    });
    expect(montarCadastro('cliente', { contact_name: 'Bia' })?.custom_fields['Tipo de cadastro']).toBe('Cliente');
  });

  it('e-mail inválido não vai; sem nome e sem telefone não há cadastro', () => {
    expect(montarCadastro('cliente', { contact_name: 'Bia', email: 'bia@' })).not.toHaveProperty('email');
    expect(montarCadastro('lead', { company_name: '  ', contact_name: null, whatsapp: null })).toBeNull();
    expect(montarCadastro('lead', { whatsapp: '(33) 99999-0000' })?.name).toBe('33999990000');
  });

  it('nunca leva colunas sensíveis, mesmo se vierem no registro', () => {
    const registro = { contact_name: 'Ana', admin_password: 'x', legal_rep_cpf: '1', checkout_token: 't' };
    const corpo = JSON.stringify(montarCadastro('cliente', registro as never));
    expect(corpo).not.toMatch(/admin_password|legal_rep_cpf|checkout_token/);
  });

  it('reais: zero e vazio não viram campo', () => {
    expect(reais(0)).toBeNull();
    expect(reais('')).toBeNull();
    expect(reais(null)).toBeNull();
    expect(reais('430')).toBe('R$ 430,00');
    expect(reais(1234567.8)).toBe('R$ 1.234.567,80');
  });

  it('resposta da agência: 2xx enviou, fora do ar tenta de novo, recusa para', () => {
    expect(desfechoDaResposta(200)).toBe('enviado');
    expect(desfechoDaResposta(201)).toBe('enviado');
    expect(desfechoDaResposta(null)).toBe('tentar');
    expect(desfechoDaResposta(500)).toBe('tentar');
    expect(desfechoDaResposta(503)).toBe('tentar');
    expect(desfechoDaResposta(429)).toBe('tentar');
    expect(desfechoDaResposta(408)).toBe('tentar');
    expect(desfechoDaResposta(400)).toBe('falhou');
    expect(desfechoDaResposta(422)).toBe('falhou');
  });

  it('token ou endereço recusados não queimam o cadastro: ele espera a correção na fila', () => {
    expect(desfechoDaResposta(401)).toBe('configuracao');
    expect(desfechoDaResposta(403)).toBe('configuracao');
    expect(desfechoDaResposta(404)).toBe('configuracao');
  });

  it('nova tentativa espaça e desiste depois de cerca de 2 dias', () => {
    const t0 = new Date('2026-11-12T12:00:00Z');
    expect(proximaTentativa(1, t0)?.toISOString()).toBe('2026-11-12T12:01:00.000Z');
    expect(proximaTentativa(2, t0)?.toISOString()).toBe('2026-11-12T12:05:00.000Z');
    expect(proximaTentativa(ESPERA_ENTRE_TENTATIVAS_MIN.length, t0)?.toISOString()).toBe('2026-11-13T12:00:00.000Z');
    expect(proximaTentativa(ESPERA_ENTRE_TENTATIVAS_MIN.length + 1, t0)).toBeNull();
    const total = ESPERA_ENTRE_TENTATIVAS_MIN.reduce((a, b) => a + b, 0);
    expect(total / 60).toBeGreaterThan(40);
    expect(total / 60).toBeLessThan(50);
  });
});
