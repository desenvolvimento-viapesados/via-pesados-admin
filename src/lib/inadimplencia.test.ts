import { describe, expect, it } from 'vitest';
import { aVencer, inadimplentes, numeroParaWhatsapp } from './inadimplencia';

const clientes = [
  { id: 'a', company_name: 'Loja A', whatsapp: '(33) 98814-4005' },
  { id: 'b', company_name: 'Loja B', whatsapp: null },
];
const f = (id: string, client_id: string, due_date: string, status: string, amount = 100) =>
  ({ id, client_id, description: 'Mensalidade', amount, due_date, status });

describe('inadimplência', () => {
  const hoje = '2026-10-08';

  it('atraso é fatura atrasada ou pendente vencida; paga e cancelada não entram', () => {
    const linhas = inadimplentes([
      f('1', 'a', '2026-09-28', 'pendente'),
      f('2', 'a', '2026-10-01', 'atrasado'),
      f('3', 'a', '2026-09-01', 'pago'),
      f('4', 'b', '2026-09-20', 'cancelado'),
      f('5', 'b', '2026-10-10', 'pendente'),
    ], clientes, [], hoje);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].cliente.id).toBe('a');
    expect(linhas[0].total).toBe(200);
    expect(linhas[0].diasDeAtraso).toBe(10);
    expect(linhas[0].faturas.map((x) => x.id)).toEqual(['1', '2']);
  });

  it('mais atrasado primeiro, e o último aviso de cobrança enviado', () => {
    const linhas = inadimplentes(
      [f('1', 'a', '2026-10-05', 'pendente'), f('2', 'b', '2026-09-01', 'atrasado')],
      clientes,
      [
        { client_id: 'a', template: 'cobranca_vence_amanha', enviado_em: '2026-10-04T12:00:00Z' },
        { client_id: 'a', template: 'acesso_equipe', enviado_em: '2026-10-07T12:00:00Z' },
        { client_id: 'a', template: 'cobranca_em_atraso', enviado_em: null },
      ],
      hoje,
    );
    expect(linhas.map((l) => l.cliente.id)).toEqual(['b', 'a']);
    expect(linhas[1].ultimoAviso).toEqual({ template: 'cobranca_vence_amanha', em: '2026-10-04T12:00:00Z' });
    expect(linhas[0].ultimoAviso).toBeNull();
  });

  it('a vencer: pendentes de hoje até 7 dias', () => {
    const r = aVencer([f('1', 'a', '2026-10-08', 'pendente'), f('2', 'a', '2026-10-15', 'pendente'),
      f('3', 'a', '2026-10-16', 'pendente'), f('4', 'a', '2026-10-09', 'pago')], hoje);
    expect(r.map((x) => x.id)).toEqual(['1', '2']);
  });

  it('número do WhatsApp', () => {
    expect(numeroParaWhatsapp('(33) 98814-4005')).toBe('5533988144005');
    expect(numeroParaWhatsapp('5533988144005')).toBe('5533988144005');
    expect(numeroParaWhatsapp('123')).toBeNull();
  });
});
