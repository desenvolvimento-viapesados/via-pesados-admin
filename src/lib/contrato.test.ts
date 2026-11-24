import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTRATO } from '../../supabase/functions/_shared/contrato-texto.ts';
import {
  cnpjValido, cpfValido, dataEHora, dataPorExtenso, emBlocos, lerDadosDoContrato, mascaraCnpj, mascaraCpf, precisaAceitar,
  preencherContrato, registroDoAceite, sha256, valorEmReais, valorPorExtenso,
} from '../../supabase/functions/_shared/contrato-regras.ts';

/* Os Termos de Uso no link de boas-vindas (até a v6, o contrato): o cliente paga, confere os dados, lê e aceita. */

const DADOS = {
  razao_social: 'Minas Caminhões Ltda', cnpj: '11.222.333/0001-81', endereco: 'Rua das Flores, 100, Centro, Governador Valadares/MG',
  representante_nome: 'Carlos Menezes', representante_cpf: '529.982.247-25',
};
const QUANDO = new Date('2026-11-18T17:32:00Z');
const campos = (x: Record<string, unknown> = {}) => ({
  ...DADOS, cnpj: '11222333000181', representante_cpf: '52998224725', valor: 437, dia_vencimento: null, data: QUANDO,
  whatsapp: '(33) 99999-0000', registro: null, ...x,
});

describe('o texto dos Termos de Uso', () => {
  it('a cópia que a função usa é idêntica ao documento em docs/contrato', () => {
    expect(CONTRATO).toBe(readFileSync('docs/contrato/termos-de-uso-via-pesados.md', 'utf8'));
  });
  it('preenche todos os campos e não deixa nenhum {{ }} para trás', () => {
    const t = preencherContrato(CONTRATO, campos({ registro: 'versão v7; código…' }));
    expect(t).not.toMatch(/\{\{|\}\}/);
    expect(t).toContain('Minas Caminhões Ltda, CNPJ 11.222.333/0001-81, com sede em Rua das Flores');
    expect(t).toContain('Carlos Menezes, CPF 529.982.247-25');
    expect(t).toContain('R$ 437,00 (quatrocentos e trinta e sete reais)');
    expect(t).toContain('Governador Valadares/MG, 18 de novembro de 2026.');
    expect(t).toContain('pelo link enviado ao WhatsApp (33) 99999-0000');
    expect(t).not.toContain('Minuta v7');
  });
  it('sem a data da implantação o dia do vencimento fica "a definir"; com ela, o dia', () => {
    expect(preencherContrato(CONTRATO, campos())).toContain('Todo dia a definir, o dia da implantação');
    expect(preencherContrato(CONTRATO, campos({ dia_vencimento: 14 }))).toContain('Todo dia 14, o dia da implantação');
  });
  it('antes do aceite, o registro avisa que ainda vai ser gerado', () => {
    expect(preencherContrato(CONTRATO, campos())).toContain('Registro do aceite: gerado no momento do aceite');
  });
  it('vira blocos que a página desenha: título, seções, quadro-resumo e parágrafos, sem marcas', () => {
    const b = emBlocos(preencherContrato(CONTRATO, campos()));
    expect(b[0]).toEqual({ t: 'titulo', texto: 'TERMOS DE USO DA VIA PESADOS' });
    expect(b.filter((x) => x.t === 'linha')).toHaveLength(8);
    expect(b.find((x) => x.t === 'linha' && x.rotulo === 'Mensalidade')).toEqual({ t: 'linha', rotulo: 'Mensalidade', texto: 'R$ 437,00 (quatrocentos e trinta e sete reais)' });
    expect(b.filter((x) => x.t === 'secao').map((x) => x.texto)).toContain('13. Comunicação e aceite');
    expect(b.every((x) => !/\*\*|`|^\|/.test(x.texto))).toBe(true);
  });
});

describe('quem assina', () => {
  it('CPF e CNPJ são conferidos pelo dígito', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-26')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cnpjValido('68.835.124/0001-20')).toBe(true);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(mascaraCpf('52998224725')).toBe('529.982.247-25');
    expect(mascaraCnpj('68835124000120')).toBe('68.835.124/0001-20');
  });
  it('o que o cliente digita vale; o que falta vem do cadastro', () => {
    const r = lerDadosDoContrato({ razao_social: ' Minas  Caminhões Ltda ', endereco: DADOS.endereco, representante_nome: 'Carlos Menezes' },
      { cnpj: DADOS.cnpj, representante_cpf: DADOS.representante_cpf, razao_social: 'Nome antigo' });
    expect(r).toEqual({ ok: true, dados: { ...DADOS, cnpj: '11222333000181', representante_cpf: '52998224725' } });
  });
  it('recusa com a frase certa o que está errado', () => {
    const erro = (x: Record<string, unknown>) => { const r = lerDadosDoContrato({ ...DADOS, ...x }, {}); return r.ok ? null : r.erro; };
    expect(erro({ razao_social: '' })).toBe('Informe a razão social da empresa.');
    expect(erro({ cnpj: '11.222.333/0001-82' })).toBe('Confira o CNPJ: o número não é válido.');
    expect(erro({ endereco: 'Rua' })).toBe('Informe o endereço completo da empresa.');
    expect(erro({ representante_nome: 'Carlos' })).toBe('Informe o nome completo de quem aceita.');
    expect(erro({ representante_cpf: '123' })).toBe('Confira o CPF de quem aceita: o número não é válido.');
    expect(erro({})).toBeNull();
  });
  it('só cliente novo aceita antes de pagar: quem já pagou ou já aceitou segue direto', () => {
    expect(precisaAceitar({ aceitoEm: null, jaPagou: false })).toBe(true);
    expect(precisaAceitar({ aceitoEm: null, jaPagou: true })).toBe(false);
    expect(precisaAceitar({ aceitoEm: '2026-11-18T17:32:00Z', jaPagou: false })).toBe(false);
  });
});

describe('valores, datas e o registro do aceite', () => {
  it('escreve o valor por extenso', () => {
    expect(valorPorExtenso(437)).toBe('quatrocentos e trinta e sete reais');
    expect(valorPorExtenso(587)).toBe('quinhentos e oitenta e sete reais');
    expect(valorPorExtenso(100)).toBe('cem reais');
    expect(valorPorExtenso(1)).toBe('um real');
    expect(valorPorExtenso(1000)).toBe('mil reais');
    expect(valorPorExtenso(1500)).toBe('mil e quinhentos reais');
    expect(valorPorExtenso(1437.5)).toBe('mil quatrocentos e trinta e sete reais e cinquenta centavos');
    expect(valorPorExtenso(2019.01)).toBe('dois mil e dezenove reais e um centavo');
    expect(valorEmReais(1437.5)).toBe('1.437,50');
  });
  it('data e hora em Brasília', () => {
    expect(dataPorExtenso(QUANDO)).toBe('18 de novembro de 2026');
    expect(dataPorExtenso(new Date('2026-12-01T01:00:00Z'))).toBe('30 de novembro de 2026');
    expect(dataEHora(QUANDO)).toBe('18/11/2026 às 14h32');
  });
  it('o registro traz o que a Cláusula 15.2 pede, e o código muda se o texto muda', async () => {
    const texto = preencherContrato(CONTRATO, campos({ registro: '{{registro_aceite}}' }));
    const hash = await sha256(texto);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256(texto.replace('437,00', '438,00'))).not.toBe(hash);
    expect(registroDoAceite({ versao: 'v6', hash, quando: QUANDO, ip: '200.1.2.3', dispositivo: 'Mozilla/5.0 (iPhone)' }))
      .toBe(`versão v6; código de integridade (SHA-256) ${hash}; 18/11/2026 às 14h32; IP 200.1.2.3; dispositivo Mozilla/5.0 (iPhone)`);
  });
});
