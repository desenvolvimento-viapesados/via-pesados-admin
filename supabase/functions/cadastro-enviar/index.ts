import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  desfechoDaResposta, ehCadastroDeTeste, montarCadastro, proximaTentativa,
  type ExtrasDoCadastro, type OrigemDoCadastro, type RegistroDoCadastro,
} from '../_shared/cadastro-regras.ts';

/**
 * Envia cada cadastro novo à ferramenta de marketing da Escala SaaS (pedido do dono, 12/11/2026).
 *
 * O gatilho do banco põe na fila cadastro_envios todo lead e todo cliente novo, com 2 minutos de
 * folga: o teste grátis nasce logo depois do cliente, e o card do assistente ganha o nome do
 * contato nos primeiros minutos. O pg_cron chama esta função a cada minuto, e ela:
 *   - lê o cadastro na hora do envio (só as colunas de marketing, nunca senha, CPF ou token);
 *   - deixa de fora número de teste do dono e cadastro apagado antes do envio;
 *   - tenta de novo quando a agência está fora do ar (cerca de 2 dias) e para em cadastro recusado;
 *   - grava na própria fila o que foi enviado e o que a agência respondeu.
 *
 * Chamar à toa só adianta a fila: a URL mora no segredo ESCALA_SAAS_WEBHOOK_URL, e nada do
 * pedido (endereço ou conteúdo) é usado.
 */

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const POR_RODADA = 20;
const TRAVA_MS = 2 * 60_000;
/* O cron chama a cada minuto: a rodada para de pegar cadastro novo antes disso. */
const TEMPO_DA_RODADA_MS = 40_000;
/* Lead sem WhatsApp nem e-mail ("pode ficar para a reunião"): espera o número na fila. */
const ESPERA_SEM_CONTATO_MS = 6 * 3_600_000;
const DESISTE_SEM_CONTATO_MS = 60 * 86_400_000;
const ESPERA_CONFIGURACAO_MS = 15 * 60_000;

interface ItemDaFila { id: string; origem: OrigemDoCadastro; registro_id: string; tentativas: number | null; criado_em: string }

Deno.serve(async () => {
  const url = Deno.env.get('ESCALA_SAAS_WEBHOOK_URL');
  /* Sem a URL, inerte também no banco: nada é marcado, e a fila sai inteira quando ela existir. */
  if (!url) return json(200, { ok: true, inerte: 'sem o endereço da agência' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const inicio = Date.now();
    const agora = new Date().toISOString();
    const { data: fila, error } = await db.from('cadastro_envios')
      .select('id, origem, registro_id, tentativas, criado_em')
      .eq('status', 'pendente').lte('proxima_tentativa_em', agora)
      .or(`travado_ate.is.null,travado_ate.lt.${agora}`)
      .order('proxima_tentativa_em').limit(POR_RODADA);
    if (error) throw error;
    if (!fila?.length) return json(200, { ok: true, fila: 0 });

    /* Sem a lista de números de teste, não envia: o número de teste do dono iria para o marketing. */
    const { data: cfg, error: erroCfg } = await db.from('assistente_config').select('telefones_teste').eq('id', 1).maybeSingle();
    if (erroCfg) throw erroCfg;
    const resultado = [];
    for (const item of fila as ItemDaFila[]) {
      if (Date.now() - inicio > TEMPO_DA_RODADA_MS) break;
      const r = await enviar(db, url, item, cfg?.telefones_teste ?? []);
      resultado.push(r);
      /* Endereço ou token recusados: os outros dariam o mesmo erro. Ficam todos na fila. */
      if (r.desfecho === 'configuracao') break;
    }
    return json(200, { ok: true, resultado });
  } catch (e) {
    console.error('cadastro-enviar:', e);
    return json(200, { ok: false, erro: e instanceof Error ? e.message : String(e) });
  }
});

// deno-lint-ignore no-explicit-any
async function enviar(db: any, url: string, item: ItemDaFila, testes: string[]) {
  const agora = new Date();
  /* Pega a linha: duas rodadas ao mesmo tempo não mandam o mesmo cadastro. */
  const { data: pega } = await db.from('cadastro_envios')
    .update({ travado_ate: new Date(agora.getTime() + TRAVA_MS).toISOString() })
    .eq('id', item.id).eq('status', 'pendente')
    .or(`travado_ate.is.null,travado_ate.lt.${agora.toISOString()}`)
    .select('id').maybeSingle();
  if (!pega) return { id: item.id, ocupado: true };

  const fechar = (campos: Record<string, unknown>) =>
    db.from('cadastro_envios').update({ travado_ate: null, ...campos }).eq('id', item.id);

  const lido = await lerCadastro(db, item.origem, item.registro_id);
  if (!lido) {
    await fechar({ status: 'ignorado', erro: 'O cadastro foi apagado antes do envio.' });
    return { id: item.id, desfecho: 'ignorado' };
  }
  if (ehCadastroDeTeste(lido.registro.whatsapp, testes)) {
    await fechar({ status: 'ignorado', erro: 'Número de teste do dono: não vai para marketing.' });
    return { id: item.id, desfecho: 'ignorado' };
  }
  const corpo = montarCadastro(item.origem, lido.registro, lido.extras);
  if (!corpo) {
    await fechar({ status: 'falhou', erro: 'Cadastro sem nome e sem telefone.' });
    return { id: item.id, desfecho: 'falhou' };
  }
  /* Sem WhatsApp e sem e-mail a agência não tem como falar com a pessoa. O lead do painel pode
     nascer assim e ganhar o número dias depois (o gatilho do banco antecipa a vez quando ele
     chega): espera na fila sem gastar tentativa. */
  if (!corpo.phone && !corpo.email) {
    if (agora.getTime() - new Date(item.criado_em).getTime() > DESISTE_SEM_CONTATO_MS) {
      await fechar({ status: 'ignorado', erro: 'Ficou 60 dias sem WhatsApp nem e-mail: a agência não teria como falar.' });
      return { id: item.id, desfecho: 'ignorado' };
    }
    await fechar({ proxima_tentativa_em: new Date(agora.getTime() + ESPERA_SEM_CONTATO_MS).toISOString(), erro: 'Aguardando WhatsApp ou e-mail.' });
    return { id: item.id, desfecho: 'aguardando' };
  }

  const tentativas = (item.tentativas ?? 0) + 1;
  let status: number | null = null;
  let resposta: string | null = null;
  let erro: string | null = null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': item.id },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    });
    status = r.status;
    resposta = (await r.text()).slice(0, 400) || null;
  } catch (e) {
    /* A mensagem do erro de rede traz o endereço inteiro, com o token: só vai para o log da função. */
    console.error('cadastro-enviar: sem resposta da agência', item.id, e);
    erro = `Sem resposta da agência (${e instanceof Error ? e.name : 'erro'}).`;
  }

  const desfecho = desfechoDaResposta(status);
  if (desfecho === 'configuracao') {
    console.error(`cadastro-enviar: a agência recusou o endereço ou o token (${status}). Confira ESCALA_SAAS_WEBHOOK_URL.`);
    await fechar({
      http_status: status, resposta,
      erro: `A agência recusou o endereço ou o token (${status}). Nada saiu; o cadastro continua na fila.`,
      proxima_tentativa_em: new Date(Date.now() + ESPERA_CONFIGURACAO_MS).toISOString(),
    });
    return { id: item.id, desfecho: 'configuracao', http_status: status };
  }
  const depois = desfecho === 'tentar' ? proximaTentativa(tentativas, new Date()) : null;
  const final = desfecho === 'tentar' && !depois ? 'falhou' : desfecho;
  await fechar({
    payload: corpo,
    tentativas,
    http_status: status,
    resposta,
    erro: desfecho === 'enviado' ? null : erro ?? `A agência respondeu ${status}.`,
    ...(final === 'enviado' ? { status: 'enviado', enviado_em: new Date().toISOString() }
      : final === 'falhou' ? { status: 'falhou' }
      : { proxima_tentativa_em: depois!.toISOString() }),
  });
  return { id: item.id, desfecho: final, http_status: status };
}

/** Só as colunas que interessam a marketing. */
// deno-lint-ignore no-explicit-any
async function lerCadastro(db: any, origem: OrigemDoCadastro, id: string): Promise<{ registro: RegistroDoCadastro; extras: ExtrasDoCadastro } | null> {
  if (origem === 'lead') {
    const { data: p, error } = await db.from('prospects')
      .select('company_name, contact_name, whatsapp, email, city, state, frente, stage, proposal_value, plan, channel_id')
      .eq('id', id).maybeSingle();
    if (error) throw error;
    if (!p) return null;
    const { data: canal } = p.channel_id
      ? await db.from('acquisition_channels').select('name').eq('id', p.channel_id).maybeSingle()
      : { data: null };
    return { registro: p, extras: { canal: canal?.name ?? null } };
  }
  const { data: c, error } = await db.from('clients')
    .select('company_name, contact_name, whatsapp, email, city, state, frente, plan, plan_id, mrr')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!c) return null;
  const [{ data: plano }, { count }] = await Promise.all([
    c.plan_id ? db.from('plans').select('name').eq('id', c.plan_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('testes_gratis').select('id', { count: 'exact', head: true }).eq('client_id', id),
  ]);
  return { registro: c, extras: { plano: plano?.name ?? null, testeGratis: (count ?? 0) > 0 } };
}
