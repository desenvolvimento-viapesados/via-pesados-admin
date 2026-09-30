import { describe, it, expect } from 'vitest';
import {
  etapasDoCliente, situacaoDoCliente, progresso,
  type FatosDoPainel, type FatosDoSistema,
} from './estadoDoCliente';

const HOJE = new Date('2026-09-30T12:00:00Z').getTime();
const diasAtras = (n: number) => new Date(HOJE - n * 86_400_000).toISOString();

/** A iTruck como estava quando o painel dizia que ela não tinha acessado. */
const ITRUCK_PAINEL: FatosDoPainel = {
  lojista_company_id: 'd46ce3db',
  domain: 'itruckcaminhoes.com.br',
  contract_signed_at: null,
  pagou: true,
  tarefas: [{ task_key: 'acesso_liberado', done: false }, { task_key: 'go_live', done: false }],
};
const ITRUCK_SISTEMA: FatosDoSistema = {
  marcos: {
    ja_acessou: true,
    ultimo_acesso_em: diasAtras(1),
    primeiro_veiculo_em: diasAtras(14),
    primeira_publicacao_em: diasAtras(14),
    primeira_venda_em: diasAtras(9),
    tem_canal_ligado: true,
    tem_anuncio_no_ar: true,
  },
  estoque: { total: 8 },
};

describe('o estado vem do fato, não da caixa marcada', () => {
  /* O caso que motivou tudo: o banco do painel dizia acesso_liberado=false
     e go_live=false para um cliente que publicava caminhão todo dia. */
  it('cliente que já entrou e anuncia não aparece como aguardando', () => {
    const e = etapasDoCliente(ITRUCK_PAINEL, ITRUCK_SISTEMA);
    const acesso = e.find((x) => x.chave === 'acesso_liberado')!;
    const noAr = e.find((x) => x.chave === 'go_live')!;
    expect(acesso.feito).toBe(true);
    expect(acesso.porque).toBe('alguém da loja já entrou');
    expect(noAr.feito).toBe(true);
    // e isso apesar de as tarefas à mão dizerem o contrário
    expect(ITRUCK_PAINEL.tarefas!.every((t) => !t.done)).toBe(true);
  });

  it('cada etapa diz o que o painel viu, não só sim ou não', () => {
    const e = etapasDoCliente(ITRUCK_PAINEL, ITRUCK_SISTEMA);
    expect(e.find((x) => x.chave === 'dados_importados')!.porque).toBe('8 veículos no sistema');
    expect(e.find((x) => x.chave === 'dominio_conectado')!.porque).toBe('aponta para itruckcaminhoes.com.br');
    expect(e.find((x) => x.chave === 'contrato_assinado')!.porque).toBe('sem data de assinatura');
  });

  /* Não saber e não ter são coisas diferentes: se a ponte não respondeu, a
     tela não pode afirmar que o cliente nunca entrou. */
  it('sem resposta da ponte, a etapa fica aberta com o motivo dito', () => {
    const e = etapasDoCliente(ITRUCK_PAINEL, null);
    const acesso = e.find((x) => x.chave === 'acesso_liberado')!;
    expect(acesso.feito).toBe(false);
    expect(acesso.porque).toContain('Ainda não li o sistema');
  });

  it('treinamento continua à mão, e a tela sabe disso', () => {
    const e = etapasDoCliente(
      { ...ITRUCK_PAINEL, tarefas: [{ task_key: 'treinamento_realizado', done: true }] },
      ITRUCK_SISTEMA,
    );
    const t = e.find((x) => x.chave === 'treinamento_realizado')!;
    expect(t.origem).toBe('mao');
    expect(t.feito).toBe(true);
    /* Quatro o painel já sabia (contrato, cobrança, sistema, domínio) e
       quatro ele foi buscar no sistema do cliente. Dizer "do sistema"
       sobre o contrato assinado seria mentira de rótulo. */
    expect(e.filter((x) => x.origem === 'painel').length).toBe(4);
    expect(e.filter((x) => x.origem === 'sistema').length).toBe(4);
  });

  it('pagamento: link criado não é pagamento recebido', () => {
    const e = etapasDoCliente(
      { ...ITRUCK_PAINEL, pagou: false, asaas_payment_link_url: 'https://asaas/x' },
      ITRUCK_SISTEMA,
    );
    const p = e.find((x) => x.chave === 'pagamento_recebido')!;
    expect(p.feito).toBe(false);
    expect(p.porque).toBe('link criado, pagamento não confirmado');
  });
});

describe('a situação em uma palavra', () => {
  const etapas = (s: FatosDoSistema, p: Partial<FatosDoPainel> = {}) =>
    etapasDoCliente({ ...ITRUCK_PAINEL, ...p }, s);

  it('quem anuncia e entrou ontem está usando', () => {
    expect(situacaoDoCliente(etapas(ITRUCK_SISTEMA), diasAtras(1), HOJE)).toBe('usando');
  });

  it('sem sistema é prospecto, mesmo com contrato', () => {
    expect(situacaoDoCliente(
      etapas(ITRUCK_SISTEMA, { lojista_company_id: null }), diasAtras(1), HOJE,
    )).toBe('prospecto');
  });

  it('tem sistema e ainda não anuncia: implantando', () => {
    const s = { ...ITRUCK_SISTEMA, marcos: { ...ITRUCK_SISTEMA!.marcos, tem_anuncio_no_ar: false } };
    expect(situacaoDoCliente(etapas(s), diasAtras(2), HOJE)).toBe('implantando');
  });

  /* Os dois que o painel não tinha como enxergar, e que são os que
     antecedem o cancelamento. */
  it('anuncia mas sumiu há mais de uma semana: ocioso', () => {
    expect(situacaoDoCliente(etapas(ITRUCK_SISTEMA), diasAtras(9), HOJE)).toBe('ocioso');
  });

  it('mais de um mês sem entrar: parado, mesmo anunciando', () => {
    expect(situacaoDoCliente(etapas(ITRUCK_SISTEMA), diasAtras(45), HOJE)).toBe('parado');
  });

  it('nunca entrou conta como parado, não como usando', () => {
    expect(situacaoDoCliente(etapas(ITRUCK_SISTEMA), null, HOJE)).toBe('parado');
  });
});

describe('progresso', () => {
  it('conta as etapas fechadas', () => {
    const p = progresso(etapasDoCliente(ITRUCK_PAINEL, ITRUCK_SISTEMA));
    expect(p.total).toBe(9);
    // fecharam sete: pagamento, sistema, domínio, acesso, estoque, canal e
    // anúncio no ar. Faltam contrato (sem data) e treinamento (não marcado).
    expect(p.feitas).toBe(7);
  });
});
