/**
 * O gancho do agente de prospecção dentro do wa-receber.
 *
 * Leve de propósito (só banco e um fetch): o wa-receber atende TODA mensagem
 * de todos os números, e carregar o SDK da IA aqui deixaria a entrada mais
 * lenta para todo mundo. Quem pensa é a função prospeccao-responder.
 *
 * Loja da fila escreveu no número da prospecção:
 *   - em contato / sem resposta → vira "conversando" e para de receber lembrete;
 *   - recusou antes e voltou a escrever → é com o Xavier (fixada no topo);
 *   - já está com o Xavier → nada: a conversa é dele.
 * O token novo a cada mensagem é o que faz o agente responder uma vez só,
 * depois da última de uma sequência.
 */
import { FALHAS_QUE_DESLIGAM, lojaDepoisDaFalha, variantes } from './prospeccao-regras.ts';
import { dentroDaJanela } from './regua.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export async function aoChegarMensagem(db: Db, instanciaId: string, telefone: string, conversaId: string) {
  const { data: cfg } = await db.from('prospeccao_config').select('instancia_id, agente_responde').eq('id', 1).maybeSingle();
  if (!cfg || cfg.instancia_id !== instanciaId) return;

  const vs = variantes(String(telefone).replace(/\D/g, '')).join(',');
  const { data: loja } = await db.from('prospeccao_lojas')
    .select('id, status, humano_assumiu, respondeu_em')
    .or(`telefone.in.(${vs}),telefone_whatsapp.in.(${vs})`)
    .limit(1).maybeSingle();
  if (!loja) return;

  const agora = new Date().toISOString();
  if (loja.status === 'sem_interesse') {
    await db.from('wa_conversas').update({ fixada: true }).eq('id', conversaId);
    await db.from('prospeccao_lojas').update({
      status: 'com_voce', motivo: 'Voltou a escrever depois de recusar.', conversa_id: conversaId, atualizada_em: agora,
    }).eq('id', loja.id);
    return;
  }
  if (!['em_contato', 'sem_resposta', 'conversando'].includes(loja.status)) return;

  const token = crypto.randomUUID();
  await db.from('prospeccao_lojas').update({
    status: 'conversando', respondeu_em: loja.respondeu_em ?? agora, proximo_contato_em: null,
    conversa_id: conversaId, responder_token: token, atualizada_em: agora,
  }).eq('id', loja.id);

  if (!cfg.agente_responde || loja.humano_assumiu || !dentroDaJanela()) return;
  const chamada = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/prospeccao-responder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-interno': Deno.env.get('WA_INTERNAL_SECRET') ?? '' },
    body: JSON.stringify({ loja_id: loja.id, token }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => console.warn('prospeccao: não chamou o agente', e));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(chamada);
}

/**
 * A Meta avisou que uma mensagem que saiu não foi entregue. Se era um
 * contato da prospecção, a loja sai da fila com o motivo; e se o aviso é de
 * número em risco (muita gente bloqueando), a prospecção desliga na hora.
 */
export async function aoFalharEntrega(db: Db, ids: string[], codigo: string, motivo: string) {
  if (!ids.length) return;
  const { data: envio } = await db.from('prospeccao_envios')
    .select('id, loja_id').in('provider_message_id', ids).eq('tipo', 'contato').limit(1).maybeSingle();
  if (!envio) return;
  const agora = new Date().toISOString();
  await db.from('prospeccao_envios').update({ erro: `${codigo ? `[${codigo}] ` : ''}${motivo}`.slice(0, 400) }).eq('id', envio.id);
  const depois = lojaDepoisDaFalha(codigo);
  await db.from('prospeccao_lojas').update({ ...depois, proximo_contato_em: null, atualizada_em: agora })
    .eq('id', envio.loja_id).eq('status', 'em_contato');
  if (FALHAS_QUE_DESLIGAM.has(codigo)) {
    await db.from('prospeccao_config').update({
      ligado: false, atualizado_em: agora,
      pausado_motivo: `Desliguei sozinho: a Meta recusou uma entrega com o aviso "${motivo}" (código ${codigo}). Isso costuma vir de bloqueios e denúncias; insistir arrisca o número que manda cobrança, acesso e senha.`,
    }).eq('id', 1);
  }
}
