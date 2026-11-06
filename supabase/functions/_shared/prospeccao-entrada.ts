/**
 * A parte da prospecção no wa-receber: a loja da fila escreveu no número da prospecção.
 *
 *   - em contato / sem resposta / conversando → vira "conversando" e para de receber
 *     lembrete (não é mais varrida para "sem resposta"); devolve a loja para o gancho do
 *     assistente de vendas, que decide quem atende (assistente-entrada.ts);
 *   - recusou antes e voltou a escrever → é com o Xavier (fixada no topo);
 *   - já está com o Xavier ou fora da fila → nada aqui (devolve null).
 *
 * Desde 03/11/2026 vale para TODA origem (o número oficial também), e quem responde é
 * o assistente de vendas — não existe mais resposta pronta nem limite de 5 respostas.
 */
import { FALHAS_QUE_DESLIGAM, lojaDepoisDaFalha, variantes } from './prospeccao-regras.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export type LojaQueRespondeu = { id: string; nome: string };

export async function aoChegarMensagem(db: Db, instanciaId: string, telefone: string, conversaId: string): Promise<LojaQueRespondeu | null> {
  const { data: cfg } = await db.from('prospeccao_config').select('instancia_id').eq('id', 1).maybeSingle();
  if (!cfg || cfg.instancia_id !== instanciaId) return null;

  const vs = variantes(String(telefone).replace(/\D/g, '')).join(',');
  const { data: loja } = await db.from('prospeccao_lojas')
    .select('id, nome, status, respondeu_em')
    .or(`telefone.in.(${vs}),telefone_whatsapp.in.(${vs})`)
    .limit(1).maybeSingle();
  if (!loja) return null;

  const agora = new Date().toISOString();
  if (loja.status === 'sem_interesse') {
    await db.from('wa_conversas').update({ fixada: true }).eq('id', conversaId);
    await db.from('prospeccao_lojas').update({
      status: 'com_voce', motivo: 'Voltou a escrever depois de recusar.', conversa_id: conversaId, atualizada_em: agora,
    }).eq('id', loja.id);
    return null;
  }
  if (!['em_contato', 'sem_resposta', 'conversando'].includes(loja.status)) return null;

  await db.from('prospeccao_lojas').update({
    status: 'conversando', respondeu_em: loja.respondeu_em ?? agora, proximo_contato_em: null,
    conversa_id: conversaId, atualizada_em: agora,
  }).eq('id', loja.id);
  return { id: loja.id, nome: loja.nome };
}

/**
 * A Meta avisou que uma mensagem que saiu não foi entregue. Se era um
 * contato da prospecção, a loja sai da fila com o motivo; e se o aviso é de
 * número em risco (muita gente bloqueando), a prospecção desliga na hora.
 */
export async function aoFalharEntrega(db: Db, ids: string[], codigo: string, motivo: string) {
  if (!ids.length) return;
  const { data: envio } = await db.from('prospeccao_envios')
    .select('id, loja_id, tipo').in('provider_message_id', ids).in('tipo', ['contato', 'oferta', 'cta']).limit(1).maybeSingle();
  if (!envio) return;
  const agora = new Date().toISOString();
  await db.from('prospeccao_envios').update({ erro: `${codigo ? `[${codigo}] ` : ''}${motivo}`.slice(0, 400) }).eq('id', envio.id);
  /* Só a abertura decide a loja: se a oferta ou o convite não chegou, a abertura chegou. */
  if (envio.tipo === 'contato') {
    const depois = lojaDepoisDaFalha(codigo);
    await db.from('prospeccao_lojas').update({ ...depois, proximo_contato_em: null, atualizada_em: agora })
      .eq('id', envio.loja_id).eq('status', 'em_contato');
  }
  if (FALHAS_QUE_DESLIGAM.has(codigo)) {
    await db.from('prospeccao_config').update({
      ligado: false, atualizado_em: agora,
      pausado_motivo: `Desliguei sozinho: a Meta recusou uma entrega com o aviso "${motivo}" (código ${codigo}). Isso costuma vir de bloqueios e denúncias; insistir arrisca o número que manda cobrança, acesso e senha.`,
    }).eq('id', 1);
  }
}
