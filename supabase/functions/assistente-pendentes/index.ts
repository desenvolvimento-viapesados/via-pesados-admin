import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dentroDoHorario, ETAPAS_SEM_RESPOSTA, filaDasPendentes, tetoDoDiaAtingido, type AssistenteConfig } from '../_shared/assistente-regras.ts';
import { carregarConversa, chamarMotor, chaveDaIA, concluirTurno, dossiesPendentes, fixarParaOXavier, lerConfig } from '../_shared/assistente.ts';
import { horaDoLembrete, LEMBRETE_PARA_A_EQUIPE, lerRespostasAutomaticas } from '../_shared/resposta-automatica.ts';
import { exigir } from '../_shared/acesso.ts';

/**
 * A rotina das pendentes do assistente de vendas (pg_cron, de 5 em 5 minutos; o SQL está
 * na migration 20261103190000_assistente_de_vendas). Chamada à toa não manda nada:
 *
 *   - fora das 08h–20h, com o assistente desligado no painel ou sem a chave da IA, não
 *     responde ninguém (as pendentes esperam);
 *   - quem escreveu de madrugada é respondido a partir das 08h, MAIS ANTIGA PRIMEIRO,
 *     até 5 por rodada, e só se a última mensagem do lead foi há menos de 24h;
 *   - passou das 24h: não responde (só modelo aprovado poderia) e a conversa fica
 *     fixada para o Xavier, com o motivo;
 *   - também pega rodada que morreu no meio (pendente há mais de 2 minutos, ou presa
 *     "pensando" há mais de 5);
 *   - loja em que só o robô respondeu: horas depois do recado do Davi, sem ninguém responder e
 *     ainda dentro das 24h do WhatsApp, UM lembrete curto (resposta-automatica.ts);
 *   - DEPOIS de disparar as pendentes, faz o dossiê de UMA reunião marcada ou remarcada
 *     por rodada (não é mensagem, então vale a qualquer hora, mas respeita o teto de gasto
 *     do dia); dossiê que falha fica marcado e não volta em toda rodada.
 *
 * É pública como a prospeccao-enviar (o cron chama sem chave): chamada repetida não gera
 * nada novo — pendente só é disparada uma vez (a vez fica "pensando" por 5 min) e dossiê
 * feito não se refaz.
 */

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const POR_RODADA = 5;

// deno-lint-ignore no-explicit-any
type Db = any;

/** O lembrete para a loja em que só o robô respondeu (dono, 17/11/2026). Texto fixo, sem IA. */
async function lembretesDoRobo(db: Db, cfg: AssistenteConfig, agora: Date): Promise<number> {
  const { data: lojas } = await db.from('prospeccao_lojas').select('id, conversa_id')
    .eq('status', 'sem_resposta').not('conversa_id', 'is', null)
    .gte('atualizada_em', new Date(agora.getTime() - 24 * 3_600_000).toISOString()).limit(50);
  let mandados = 0;
  for (const loja of lojas ?? []) {
    if (mandados >= POR_RODADA) break;
    const { data: ac } = await db.from('assistente_conversas').select('modo, etapa, token')
      .eq('conversa_id', loja.conversa_id).maybeSingle();
    if (!ac || ac.modo !== 'sozinho' || ac.token || (ETAPAS_SEM_RESPOSTA as readonly string[]).includes(ac.etapa)) continue;
    const c = await carregarConversa(db, loja.conversa_id);
    if (!c || !horaDoLembrete(lerRespostasAutomaticas(c.msgs), agora)) continue;
    const { data: turno } = await db.from('assistente_turnos').insert({
      conversa_id: loja.conversa_id, entrada_ids: [], mensagens: [LEMBRETE_PARA_A_EQUIPE], acoes: [], ferramentas: [],
      modelo: null, usage: null, custo_usd: 0, fiscal: { ok: true, violacoes: [], tentativas: 0 }, status: 'enviado',
    }).select('id').single();
    if (!turno) continue;
    const r = await concluirTurno(db, {
      turnoId: turno.id, conversaId: loja.conversa_id, mensagens: [LEMBRETE_PARA_A_EQUIPE], acoes: [], cfg, status: 'enviado',
      equipeDesde: agora.toISOString(),
    });
    if (r.ok) mandados++;
    else console.warn('assistente-pendentes: lembrete não saiu', loja.conversa_id, r.motivo);
  }
  return mandados;
}

Deno.serve(async (req) => {
  /* Só a rotina agendada (x-cron) ou a equipe pelo terminal. Era aberta: auditoria 27/11. */
  const recusa = await exigir(req, ['cron', 'servico']);
  if (recusa) return recusa;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const agora = new Date();
  try {
    const cfg = await lerConfig(db);
    if (!cfg) return json(200, { ok: true, sem_config: true });

    /** O dossiê vem depois das respostas: elas não podem esperar pela IA do resumo. */
    const fazerDossie = async () => {
      const { data: gasto } = await db.rpc('assistente_gasto_hoje');
      if (!chaveDaIA() || tetoDoDiaAtingido(Number(gasto ?? 0), Number(cfg.teto_usd_dia))) return 0;
      return await dossiesPendentes(db, cfg, 1).catch((e) => { console.warn('assistente-pendentes: dossiê', e); return 0; });
    };

    if (!dentroDoHorario(agora)) return json(200, { ok: true, fora_do_horario: true, dossies: await fazerDossie() });
    if (!cfg.ligado) return json(200, { ok: true, desligado: true, dossies: await fazerDossie() });
    const lembretes = await lembretesDoRobo(db, cfg, agora).catch((e) => { console.warn('assistente-pendentes: lembretes', e); return 0; });
    if (lembretes) console.log(`assistente-pendentes: ${lembretes} lembrete(s) para loja que só o robô respondeu`);
    /* Sem a chave da IA ninguém é respondido: as pendentes esperam, e saem na primeira
       rodada depois que a chave for cadastrada. */
    if (!chaveDaIA()) return json(200, { ok: true, sem_chave_da_ia: true });

    const { data: linhas } = await db.from('assistente_conversas')
      .select('conversa_id, token, pendente_desde, etapa, modo, loja_id')
      .not('pendente_desde', 'is', null)
      .neq('modo', 'desligado')
      .lt('pendente_desde', new Date(agora.getTime() - 2 * 60_000).toISOString())
      .order('pendente_desde', { ascending: true })
      .limit(50);

    /* Rodada "pensando" há menos de 5 min ainda está viva: não atropela. */
    const livres = (linhas ?? []).filter((l: { token: string | null; etapa: string }) => {
      if ((ETAPAS_SEM_RESPOSTA as readonly string[]).includes(l.etapa)) return false;
      const m = /^em:(\d+):/.exec(l.token ?? '');
      return !m || agora.getTime() - Number(m[1]) > 5 * 60_000;
    });
    if (!livres.length) return json(200, { ok: true, pendentes: 0, dossies: await fazerDossie() });

    /* A última mensagem do lead em cada conversa (para a janela de 24h da Meta). */
    const ids = livres.map((l: { conversa_id: string }) => l.conversa_id);
    const ultimas = new Map<string, string>();
    for (const id of ids) {
      const { data } = await db.from('wa_mensagens').select('created_at')
        .eq('conversa_id', id).eq('direcao', 'entrada').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) ultimas.set(id, data.created_at);
    }
    const fila = filaDasPendentes(
      livres.map((l: { conversa_id: string; pendente_desde: string; loja_id: string | null }) =>
        ({ ...l, ultima_entrada_em: ultimas.get(l.conversa_id) ?? null })),
      agora,
    );

    for (const x of fila.expiradas) {
      await db.from('assistente_conversas').update({ pendente_desde: null, token: null, pausado_motivo: 'janela_fechada' })
        .eq('conversa_id', x.conversa_id);
      await fixarParaOXavier(db, x.conversa_id, x.loja_id, 'Passaram 24h desde a última mensagem dele: só modelo aprovado pode sair.');
    }

    const chamadas: string[] = [];
    for (const x of fila.responder.slice(0, POR_RODADA)) {
      const token = crypto.randomUUID();
      await db.from('assistente_conversas').update({ token }).eq('conversa_id', x.conversa_id);
      await chamarMotor(x.conversa_id, token, false);
      chamadas.push(x.conversa_id);
    }
    return json(200, { ok: true, respondendo: chamadas.length, expiradas: fila.expiradas.length, dossies: await fazerDossie() });
  } catch (e) {
    console.error('assistente-pendentes:', e);
    return json(200, { ok: false, erro: e instanceof Error ? e.message : 'erro' });
  }
});
