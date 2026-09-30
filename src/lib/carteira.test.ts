import { describe, it, expect } from 'vitest';
import { alarmesDoCliente, montarCarteira, totaisDaCarteira, ordemDeAtencao } from './carteira';
import type { Client, SaudeDaEmpresa } from '@/hooks/useAdmin';

const HOJE = new Date('2026-09-30T12:00:00Z').getTime();
const atras = (d: number) => new Date(HOJE - d * 86_400_000).toISOString();

const cliente = (p: Partial<Client> = {}): Client => ({
  id: 'c1', company_name: 'Revenda', status: 'ativo', mrr: 500,
  lojista_company_id: 'e1', domain: 'revenda.com.br',
  ...p,
} as Client);

const saude = (p: Partial<SaudeDaEmpresa> = {}): SaudeDaEmpresa => ({
  company_id: 'e1', nome: 'Revenda', slug: 'revenda',
  veiculos: 20, veiculos_parados_60d: 0, valor_estoque: 5_000_000,
  anuncios_no_ar: 40, canais_ligados: 2, canais_caidos: 0,
  usuarios: 4, usuarios_que_nunca_entraram: 0, ultimo_acesso_em: atras(1),
  vendas_30d: 3, faturamento_30d: 900_000, ultima_venda_em: atras(5),
  ultimo_veiculo_em: atras(2), pedidos_abertos: 2, ...p,
});

describe('os alarmes que fazem alguém agir hoje', () => {
  it('conta saudável não gera alarme nenhum', () => {
    expect(alarmesDoCliente(cliente(), saude(), HOJE)).toEqual([]);
  });

  /* O pior caso silencioso: o cliente paga a mensalidade e não tem um
     anúncio no ar. Ninguém reclama, e ele cancela no terceiro mês. */
  it('estoque cheio e nenhum anúncio é grave', () => {
    const a = alarmesDoCliente(cliente(), saude({ anuncios_no_ar: 0 }), HOJE);
    expect(a.find((x) => x.chave === 'sem_anuncio')?.peso).toBe('grave');
  });

  it('canal desconectado é grave — o anúncio para de atualizar', () => {
    const a = alarmesDoCliente(cliente(), saude({ canais_caidos: 1 }), HOJE);
    expect(a.find((x) => x.chave === 'canal_caido')?.texto).toBe('Um canal desconectado');
  });

  it('separa sumido de ocioso pelo tempo, e diz quantos dias', () => {
    expect(alarmesDoCliente(cliente(), saude({ ultimo_acesso_em: atras(9) }), HOJE)[0])
      .toMatchObject({ chave: 'ocioso', peso: 'atencao', texto: 'Sem entrar há 9 dias' });
    expect(alarmesDoCliente(cliente(), saude({ ultimo_acesso_em: atras(40) }), HOJE)[0])
      .toMatchObject({ chave: 'parado', peso: 'grave' });
  });

  it('ninguém nunca entrou é o alarme mais grave de todos', () => {
    const a = alarmesDoCliente(cliente(), saude({ ultimo_acesso_em: null }), HOJE);
    expect(a[0]).toMatchObject({ chave: 'nunca_entrou', peso: 'grave' });
  });

  it('cancelado não gera alarme — não há o que fazer', () => {
    const a = alarmesDoCliente(
      cliente({ status: 'cancelado' }), saude({ ultimo_acesso_em: atras(90), canais_caidos: 2 }), HOJE,
    );
    expect(a).toEqual([]);
  });

  it('cobrança em atraso vale mesmo sem conseguir ler o sistema', () => {
    const a = alarmesDoCliente(cliente({ status: 'inadimplente' }), null, HOJE);
    expect(a).toEqual([{ chave: 'inadimplente', texto: 'Cobrança em atraso', peso: 'grave' }]);
  });
});

describe('a carteira inteira', () => {
  const linhas = () => montarCarteira(
    [
      cliente({ id: 'a', company_name: 'Boa', lojista_company_id: 'e1' }),
      cliente({ id: 'b', company_name: 'Sumida', lojista_company_id: 'e2', mrr: 800 }),
      cliente({ id: 'c', company_name: 'Cancelada', status: 'cancelado', lojista_company_id: 'e3', mrr: 900 }),
    ],
    [
      saude(),
      saude({ company_id: 'e2', ultimo_acesso_em: atras(45), anuncios_no_ar: 0, veiculos: 12, valor_estoque: 3_000_000 }),
      saude({ company_id: 'e3', veiculos: 1, valor_estoque: 100_000 }),
    ],
    HOJE,
  );

  it('soma só quem não cancelou', () => {
    const t = totaisDaCarteira(linhas());
    expect(t.clientes).toBe(2);
    expect(t.mrr).toBe(1300);
    expect(t.veiculos).toBe(32);
    expect(t.valorEstoque).toBe(8_000_000);
  });

  it('conta as contas que precisam de alguém hoje', () => {
    const t = totaisDaCarteira(linhas());
    expect(t.comAlarmeGrave).toBe(1);
    expect(t.usando).toBe(1);
    expect(t.sumidos).toBe(1);
  });

  it('quem precisa de atenção vem primeiro', () => {
    const ordenado = [...linhas()].sort(ordemDeAtencao);
    expect(ordenado[0].cliente.company_name).toBe('Sumida');
  });

  it('cliente sem sistema entra na carteira sem saúde, e não quebra', () => {
    const l = montarCarteira([cliente({ id: 'x', lojista_company_id: null })], [], HOJE);
    expect(l[0].saude).toBeNull();
    expect(l[0].situacao).toBe('prospecto');
    expect(totaisDaCarteira(l).veiculos).toBe(0);
  });
});
