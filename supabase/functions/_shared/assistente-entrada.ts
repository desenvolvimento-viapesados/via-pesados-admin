/**
 * O gancho do assistente de vendas dentro do wa-receber, para TODA mensagem de entrada
 * (número oficial, API antiga e números da equipe).
 *
 * Leve de propósito (banco e um fetch): o wa-receber atende toda mensagem de todos os
 * números, e carregar a IA aqui deixaria a entrada lenta para todo mundo. Quem pensa é
 * a função assistente-responder.
 *
 *   - conversa com o assistente ligado (Sugere ou Atende sozinho) → token novo, marca a
 *     pendência e chama o motor (que espera 40 s para juntar a rajada);
 *   - loja da prospecção respondendo e conversa ainda sem assistente → entra no modo da
 *     configuração (modo_prospeccao);
 *   - loja da prospecção com o assistente desligado (no painel ou na conversa) → a
 *     conversa fica fixada para o Xavier, sem mensagem automática nenhuma;
 *   - etapa em que o assistente não fala (com você, encerrado) → só fixa para o Xavier ver;
 *   - número de teste do dono (assistente_config.telefones_teste) e conversa ainda sem
 *     assistente → entra atendendo sozinho, para ele testar sem mexer em nada.
 * Fora das 08h–20h, ou com o botão geral desligado, fica pendente: a rotina
 * assistente-pendentes responde quando puder (mais antiga primeiro, janela de 24h aberta).
 */
import { ETAPAS_SEM_RESPOSTA, dentroDoHorario, ehNumeroDeTeste, numerosDoAviso, type Etapa, type Modo } from './assistente-regras.ts';
import type { LojaQueRespondeu } from './prospeccao-entrada.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

async function fixar(db: Db, conversaId: string, lojaId: string | null, motivo: string) {
  const agora = new Date().toISOString();
  await db.from('wa_conversas').update({ fixada: true, updated_at: agora }).eq('id', conversaId);
  if (lojaId) {
    await db.from('prospeccao_lojas').update({ status: 'com_voce', motivo, atualizada_em: agora })
      .eq('id', lojaId).in('status', ['em_contato', 'sem_resposta', 'conversando']);
  }
}

/**
 * A equipe já está nesta conversa? (a loja ficou com alguém no agente antigo, ou alguém
 * escreveu nos últimos 14 dias — pela tela, com remetente; ou do celular, no número da
 * Evolution, sem remetente). Se está, o assistente não entra por conta própria.
 */
async function equipeJaEstaNaConversa(db: Db, conversaId: string, lojaId: string): Promise<boolean> {
  const { data: loja } = await db.from('prospeccao_lojas').select('humano_assumiu').eq('id', lojaId).maybeSingle();
  if (loja?.humano_assumiu) return true;
  const { data: conversa } = await db.from('wa_conversas').select('instancia_id').eq('id', conversaId).maybeSingle();
  const { data: inst } = conversa
    ? await db.from('wa_instancias').select('origem').eq('id', conversa.instancia_id).maybeSingle()
    : { data: null };
  const { data: saidas } = await db.from('wa_mensagens').select('enviada_por, enviada_por_nome, turno_id')
    .eq('conversa_id', conversaId).eq('direcao', 'saida')
    .gte('created_at', new Date(Date.now() - 14 * 86_400_000).toISOString()).limit(200);
  return (saidas ?? []).some((m: { enviada_por: string | null; enviada_por_nome: string | null; turno_id: string | null }) =>
    !m.turno_id && (!!m.enviada_por || (inst?.origem === 'evolution' && !m.enviada_por_nome)));
}

export async function aoChegarParaOAssistente(db: Db, conversaId: string, loja: LojaQueRespondeu | null, telefone?: string) {
  const { data: cfg } = await db.from('assistente_config').select('ligado, modo_prospeccao, telefones_teste, aviso_whatsapp').eq('id', 1).maybeSingle();
  let { data: ac } = await db.from('assistente_conversas')
    .select('modo, etapa, loja_id, pendente_desde').eq('conversa_id', conversaId).maybeSingle() as
    { data: { modo: Modo; etapa: Etapa; loja_id: string | null; pendente_desde: string | null } | null };

  if (!ac && loja) {
    const modo: Modo = cfg?.modo_prospeccao ?? 'desligado';
    if (!cfg?.ligado || modo === 'desligado') {
      await fixar(db, conversaId, loja.id, 'Respondeu à prospecção (o assistente está desligado).');
      return;
    }
    if (await equipeJaEstaNaConversa(db, conversaId, loja.id)) {
      await fixar(db, conversaId, loja.id, 'Respondeu à prospecção (você já estava na conversa: o assistente não entrou).');
      return;
    }
    await db.from('assistente_conversas')
      .upsert({ conversa_id: conversaId, modo, loja_id: loja.id }, { onConflict: 'conversa_id', ignoreDuplicates: true });
    ({ data: ac } = await db.from('assistente_conversas')
      .select('modo, etapa, loja_id, pendente_desde').eq('conversa_id', conversaId).maybeSingle());
  }
  /* O número que recebe o aviso de reunião: responder ou reagir ao aviso não é conversa de teste.
     Compara nas duas grafias (com e sem o 9): o WhatsApp entrega o 33 98814-4005 sem o 9 (11/11/2026). */
  const doAviso = ehNumeroDeTeste(telefone, numerosDoAviso(cfg?.aviso_whatsapp));
  if (!ac && !loja && !doAviso && ehNumeroDeTeste(telefone, cfg?.telefones_teste)) {
    /* Número de teste: entra atendendo sozinho. Se o dono desligar na conversa, a linha
       existe e fica como ele deixou. */
    await db.from('assistente_conversas')
      .upsert({ conversa_id: conversaId, modo: 'sozinho' }, { onConflict: 'conversa_id', ignoreDuplicates: true });
    ({ data: ac } = await db.from('assistente_conversas')
      .select('modo, etapa, loja_id, pendente_desde').eq('conversa_id', conversaId).maybeSingle());
  }
  if (!ac) return;
  if (loja && !ac.loja_id) await db.from('assistente_conversas').update({ loja_id: loja.id }).eq('conversa_id', conversaId);

  if (ac.modo === 'desligado') {
    if (loja) await fixar(db, conversaId, loja.id, 'Respondeu à prospecção (o assistente está desligado nesta conversa).');
    return;
  }
  if (ETAPAS_SEM_RESPOSTA.includes(ac.etapa)) {
    /* Com você, encerrado ou entregue: o assistente não escreve, mas o Xavier precisa ver. */
    await db.from('wa_conversas').update({ fixada: true }).eq('id', conversaId);
    return;
  }

  const token = crypto.randomUUID();
  await db.from('assistente_conversas').update({ token }).eq('conversa_id', conversaId);
  await db.from('assistente_conversas').update({ pendente_desde: new Date().toISOString() })
    .eq('conversa_id', conversaId).is('pendente_desde', null);

  if (!cfg?.ligado) {
    /* Botão geral desligado: a loja da prospecção não fica sem ninguém. */
    if (loja) await fixar(db, conversaId, loja.id, 'Respondeu à prospecção (o assistente está desligado no painel).');
    return;
  }
  if (!dentroDoHorario()) return; // a rotina das 08h responde

  const chamada = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/assistente-responder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-interno': Deno.env.get('WA_INTERNAL_SECRET') ?? '' },
    body: JSON.stringify({ conversa_id: conversaId, token, esperar: true }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => console.warn('assistente: não chamou o motor', e));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(chamada);
}
