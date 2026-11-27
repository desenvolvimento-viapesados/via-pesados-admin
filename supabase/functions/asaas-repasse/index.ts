/**
 * Repasse diário do Asaas para o Santander (24/11/2026, pedido do dono).
 *
 * Todo dia às 18h (cron asaas-repasse): se o repasse está ligado e o saldo do Asaas passa
 * da reserva (R$ 100), manda a diferença por Pix para a chave gravada pelo dono na tela do
 * Financeiro. Uma vez por dia no máximo (repasses.dia é único). O destino só vem do banco;
 * nada que chega na requisição muda valor nem chave.
 *
 * Cada saque passa ainda pelo asaas-saque-validar, que só aprova o que foi pedido aqui.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { exigir } from '../_shared/acesso.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

function asaas() {
  const chave = Deno.env.get('ASAAS_API_KEY')!;
  const base = chave.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
  return async (caminho: string, init: RequestInit = {}) => {
    const r = await fetch(`${base}${caminho}`, {
      ...init,
      headers: { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'ViaPesados/1.0' },
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error((d?.errors ?? [])[0]?.description ?? `Asaas respondeu ${r.status}`);
    return d;
  };
}

/** Dia de hoje em Brasília. */
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  /* Só a rotina das 18h (ou a equipe pelo terminal). Era aberta: auditoria 27/11. */
  const recusa = await exigir(req, ['cron', 'servico']);
  if (recusa) return recusa;
  const api = asaas();

  /* 1. Atualiza os repasses que ainda estavam em andamento. */
  const { data: abertos } = await db.from('repasses').select('id, asaas_id').in('status', ['PENDING', 'BANK_PROCESSING']).not('asaas_id', 'is', null);
  for (const r of abertos ?? []) {
    try {
      const t = await api(`/transfers/${r.asaas_id}`);
      await db.from('repasses').update({ status: t.status, erro: t.failReason ?? null, atualizado_em: new Date().toISOString() }).eq('id', r.id);
    } catch { /* tenta de novo amanhã */ }
  }

  /* 2. O repasse de hoje. */
  const { data: cfg } = await db.from('repasse_config').select('ligado, chave_pix, tipo_chave, reserva').eq('id', 1).maybeSingle();
  if (!cfg?.ligado || !cfg.chave_pix || !cfg.tipo_chave) return json({ ok: true, feito: 'desligado' });

  const dia = hojeBR();
  const { data: ja } = await db.from('repasses').select('id').eq('dia', dia).maybeSingle();
  if (ja) return json({ ok: true, feito: 'já rodou hoje' });

  const { balance } = await api('/finance/balance');
  const saldo = Number(balance ?? 0);
  const valor = Math.floor((saldo - Number(cfg.reserva)) * 100) / 100;

  if (valor < 1) {
    await db.from('repasses').insert({ dia, saldo, valor: 0, status: 'sem_saldo' });
    return json({ ok: true, feito: 'sem saldo acima da reserva', saldo });
  }

  /* Grava ANTES de pedir: o validador do Asaas chega uns 5 s depois e precisa achar o pedido. */
  const { data: linha, error } = await db.from('repasses')
    .insert({ dia, saldo, valor, chave_pix: cfg.chave_pix, status: 'pedindo' })
    .select('id').single();
  if (error) return json({ ok: true, feito: 'já rodou hoje' }); // corrida: outro disparo ganhou o dia

  try {
    const t = await api('/transfers', {
      method: 'POST',
      body: JSON.stringify({
        value: valor,
        pixAddressKey: cfg.chave_pix,
        pixAddressKeyType: cfg.tipo_chave,
        description: 'Repasse diário Via Pesados',
        externalReference: linha.id,
      }),
    });
    await db.from('repasses').update({ asaas_id: t.id, status: t.status ?? 'PENDING', atualizado_em: new Date().toISOString() }).eq('id', linha.id);
    return json({ ok: true, feito: 'pedido', valor, status: t.status });
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'falha';
    await db.from('repasses').update({ status: 'falhou', erro, atualizado_em: new Date().toISOString() }).eq('id', linha.id);
    return json({ ok: false, erro }, 500);
  }
});
