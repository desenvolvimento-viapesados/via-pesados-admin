/**
 * Validação de saque do Asaas (24/11/2026). O dono liga em Asaas > Integrações >
 * Mecanismos de segurança > "Validação de saque via webhook", com esta URL e o token que
 * aparece na tela do Financeiro. Daí em diante o Asaas pergunta aqui antes de cada saque
 * feito pela API, e só sai o que bate com um repasse pedido pela rotina das 18h: mesmo id
 * ou referência, mesmo valor, ainda aberto. Todo o resto é recusado.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const responder = (aprovado: boolean, motivo?: string) =>
  new Response(JSON.stringify(aprovado ? { status: 'APPROVED' } : { status: 'REFUSED', refuseReason: motivo ?? 'Não reconhecido' }), {
    headers: { 'Content-Type': 'application/json' },
  });

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Chave Pix comparável: sem espaço, pontuação de CPF/CNPJ/telefone nem maiúscula. */
function normalizarChave(v: unknown) {
  return String(v ?? '').trim().toLowerCase().replace(/[\s().\-\/]/g, '').replace(/^\+/, '');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const { data: cfg } = await db.from('repasse_config').select('token_validacao').eq('id', 1).maybeSingle();
  const token = req.headers.get('asaas-access-token') ?? '';
  if (!cfg?.token_validacao || !iguais(token, cfg.token_validacao)) return responder(false, 'Token inválido');

  const corpo = await req.json().catch(() => null);
  if (corpo?.type !== 'TRANSFER' || !corpo.transfer) return responder(false, 'Só repasses automáticos são aprovados');
  const t = corpo.transfer;

  /* O pedido é gravado antes de ir ao Asaas; se a validação chegar no meio, espera um pouco. */
  for (let i = 0; i < 3; i++) {
    const { data: r } = await db.from('repasses').select('id, valor, status, asaas_id, chave_pix')
      .or(`asaas_id.eq.${String(t.id).replace(/[^\w-]/g, '')},id.eq.${/^[0-9a-f-]{36}$/i.test(String(t.externalReference ?? '')) ? t.externalReference : '00000000-0000-0000-0000-000000000000'}`)
      .maybeSingle();
    if (r) {
      if (Math.abs(Number(r.valor) - Number(t.value)) > 0.001) return responder(false, 'Valor diferente do pedido');
      if (!['pedindo', 'PENDING'].includes(r.status)) return responder(false, 'Repasse já tratado');
      /* Auditoria 27/11: conferia só id e valor. Agora o destino tem de ser a chave
         gravada no pedido, e cada pedido aprova UMA transferência só. */
      if (!r.chave_pix || normalizarChave(t.pixAddressKey) !== normalizarChave(r.chave_pix)) {
        return responder(false, 'Chave Pix diferente da cadastrada');
      }
      if (r.asaas_id && r.asaas_id !== t.id) return responder(false, 'Este repasse já foi aprovado');
      await db.from('repasses').update({ asaas_id: t.id, atualizado_em: new Date().toISOString() }).eq('id', r.id);
      return responder(true);
    }
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  return responder(false, 'Saque não foi pedido pela rotina de repasse');
});
