import { describe, it, expect } from 'vitest';
import { montarCarteiraDeTransportadoras, totaisDaCarteira } from './carteira';
import { pendenciasDaTransportadora, type Financeiro } from './fichaDoCliente';
import type { Client } from '@/hooks/useAdmin';
import type { FichaTransportadora } from '@/hooks/useTransportadoras';

const AGORA = Date.parse('2026-10-29T12:00:00Z');
const atras = (d: number) => new Date(AGORA - d * 86_400_000).toISOString();

const ficha = (p: Partial<FichaTransportadora> = {}): FichaTransportadora => ({
  nome: 'X', ativo: true, bloqueada_em: null, criada_em: atras(30), certificado_ok: true, certificado_validade: null,
  pessoas: [{ nome: 'Ana', email: 'ana@x.test', papel: 'dono', ultimo_acesso: atras(1), definiu_senha_em: atras(20) }],
  ultimo_acesso: atras(1), primeiro_acesso: atras(20), veiculos: 6, caminhoes: 4, motoristas: 4, clientes: 3,
  viagens: 12, viagens_30d: 7, primeira_viagem_em: atras(18), ultima_viagem_em: atras(2), frete_30d: 50_000, documentos_30d: 10, ...p,
});
const cli = (id: string, p: Partial<Client> = {}) =>
  ({ id, frente: 'transportadora', status: 'ativo', mrr: 1000, company_name: id, transportes_empresa_id: `e-${id}`, ...p }) as Client;
const emDia: Financeiro = { estado: 'em_dia', diasAtraso: 0, valorEmAberto: 0, proximoVencimento: null, ultimoPagamentoEm: null, texto: 'Em dia' };

describe('carteira das transportadoras', () => {
  it('usa a ficha de cada uma para situação, alarmes e números', () => {
    const linhas = montarCarteiraDeTransportadoras(
      [cli('a'), cli('b'), cli('c', { transportes_empresa_id: null, status: 'onboarding' })],
      { 'e-a': ficha(), 'e-b': ficha({ ultimo_acesso: null, primeiro_acesso: null, viagens: 0, viagens_30d: 0, motoristas: 0 }) },
      AGORA,
    );
    const [a, b, c] = linhas;
    expect(a.situacao).toBe('usando');
    expect(a.alarmes).toEqual([]);
    expect(b.alarmes.map((x) => x.chave)).toEqual(['nunca_entrou', 'sem_motorista']);
    expect(c.situacao).toBe('prospecto');
    const t = totaisDaCarteira(linhas, []);
    expect(t.caminhoes).toBe(8);
    expect(t.viagens30d).toBe(7);
    expect(t.usuarios).toBe(2);
  });
});

describe('pendências da transportadora', () => {
  it('nada a fazer quando está em dia e rodando', () => {
    expect(pendenciasDaTransportadora(cli('a'), ficha(), emDia, AGORA)).toEqual([]);
  });

  it('desligada é o único aviso: o resto não importa enquanto ninguém entra', () => {
    expect(pendenciasDaTransportadora(cli('a'), ficha({ ativo: false, motoristas: 0 }), emDia, AGORA).map((p) => p.chave)).toEqual(['desligada']);
  });

  it('bloqueio, conta parada e viagem sem certificado', () => {
    const p = pendenciasDaTransportadora(cli('a'), ficha({ bloqueada_em: atras(2), ultimo_acesso: atras(40), certificado_ok: false }), emDia, AGORA);
    expect(p.map((x) => x.chave)).toEqual(['bloqueada', 'parado', 'sem_certificado']);
  });
});
