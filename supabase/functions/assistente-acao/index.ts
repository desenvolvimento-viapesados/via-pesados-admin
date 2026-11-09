import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type AcaoDoTurno, type AssistenteConversa, type Modo,
  dentroDoHorario, ehNumeroDeTeste, ETAPAS_SEM_RESPOSTA, janelaAberta, MODOS, proximaEtapa, tetoDoDiaAtingido,
} from '../_shared/assistente-regras.ts';
import {
  carregarConversa, chamarMotor, chaveDaIA, concluirTurno, lerConfig, lerEstado, salvarEstado, transcritor, ultimaEntradaEm,
} from '../_shared/assistente.ts';
import { statusDoModelo } from '../_shared/wa.ts';

/**
 * Os botões do assistente de vendas na tela (CRM › WhatsApp e aba Assistente).
 * Só membro ativo da equipe. Ações (POST, corpo JSON com `acao`):
 *
 *   situacao/status  o que falta para o assistente funcionar (chaves existem? link? quem
 *                    recebe as reuniões?), gasto de hoje e teto — nunca mostra chave
 *   modo             liga/desliga o assistente numa conversa (desligado/sugere/sozinho)
 *   aprovar          manda o rascunho (editado ou não) e executa as ações pendentes
 *   descartar        joga o rascunho fora
 *   devolver         a conversa estava com o Xavier: volta para o assistente
 *   responder_agora  pede uma resposta já (a última mensagem é do lead)
 *   recomecar        só número de teste no oficial: o assistente esquece a conversa (etapa,
 *                    memória, dores, horários) e lê só o que vier depois; a reunião de teste é
 *                    cancelada e o card volta para Contato
 *
 * O que sai para o lead sai daqui ou do motor, sempre dentro das 08h–20h e da janela
 * de 24h da Meta.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-frente',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Se a última mensagem é do lead e o assistente pode falar, pede uma resposta: já (dentro
 * das 08h–20h) ou deixa pendente para a rotina. Devolve o que aconteceu.
 */
async function pedirResposta(db: Db, conversaId: string): Promise<'pensando' | 'pendente' | null> {
  const cfg = await lerConfig(db);
  const e = await lerEstado(db, conversaId);
  if (!cfg || !e || e.modo === 'desligado' || ETAPAS_SEM_RESPOSTA.includes(e.etapa)) return null;
  const c = await carregarConversa(db, conversaId);
  const ultima = c?.msgs[c.msgs.length - 1];
  if (!c || !ultima || ultima.direcao !== 'entrada' || !janelaAberta(ultimaEntradaEm(c.msgs))) return null;
  const token = crypto.randomUUID();
  await salvarEstado(db, conversaId, { token, pendente_desde: e.pendente_desde ?? new Date().toISOString() });
  if (!cfg.ligado || !dentroDoHorario()) return 'pendente';
  await chamarMotor(conversaId, token, false);
  return 'pensando';
}

/** Cria a linha do assistente na conversa, se ainda não existe (ligada à loja da prospecção, se houver). */
async function garantirEstado(db: Db, conversaId: string): Promise<AssistenteConversa | null> {
  const atual = await lerEstado(db, conversaId);
  if (atual) return atual;
  const { data: conversa } = await db.from('wa_conversas').select('id').eq('id', conversaId).maybeSingle();
  if (!conversa) return null;
  const { data: loja } = await db.from('prospeccao_lojas').select('id').eq('conversa_id', conversaId).limit(1).maybeSingle();
  await db.from('assistente_conversas')
    .upsert({ conversa_id: conversaId, modo: 'desligado', loja_id: loja?.id ?? null }, { onConflict: 'conversa_id', ignoreDuplicates: true });
  return await lerEstado(db, conversaId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user } } = await db.auth.getUser(auth);
    if (!user) return json(401, { error: 'não autenticado' });
    const { data: membro } = await db.from('team_members').select('id, full_name, is_active').eq('id', user.id).maybeSingle();
    if (!membro || membro.is_active === false) return json(403, { error: 'acesso negado' });

    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo?.acao ?? '');

    /* ── o que falta para funcionar ─────────────────────────────── */
    if (acao === 'situacao' || acao === 'status') {
      const cfg = await lerConfig(db);
      const { data: gasto } = await db.rpc('assistente_gasto_hoje');
      const t = transcritor();
      const avisos: string[] = [];
      if (!chaveDaIA()) avisos.push('Falta a chave da IA no painel: o assistente não responde ninguém.');
      if (!t) avisos.push('Falta a chave de transcrição: áudio não será entendido.');
      if (!cfg?.link_reuniao) avisos.push('Falta o link da reunião: o assistente não marca horário.');
      if (!cfg?.responsavel_id) avisos.push('Falta escolher quem recebe as reuniões: o assistente não marca horário.');
      if (cfg?.aviso_whatsapp && (await statusDoModelo('aviso_reuniao_marcada')) !== 'APPROVED') {
        avisos.push('O aviso de reunião marcada ainda não foi aprovado pela Meta: a reunião entra na Agenda, mas o aviso no WhatsApp não sai.');
      }
      if (cfg && tetoDoDiaAtingido(Number(gasto ?? 0), Number(cfg.teto_usd_dia))) avisos.push('O gasto de hoje chegou ao teto: o assistente para até alguém ligar de novo.');
      return json(200, {
        ok: true,
        ia: chaveDaIA(),
        transcricao: t?.nome ?? null,
        chave_ia: chaveDaIA(),
        chave_transcricao: !!t,
        link_reuniao: !!cfg?.link_reuniao,
        responsavel: !!cfg?.responsavel_id,
        ligado: !!cfg?.ligado,
        pausado_motivo: cfg?.pausado_motivo ?? null,
        gasto_hoje_usd: Number(gasto ?? 0),
        teto_usd_dia: Number(cfg?.teto_usd_dia ?? 0),
        dentro_do_horario: dentroDoHorario(),
        avisos,
      });
    }

    /* ── ligar/desligar numa conversa ───────────────────────────── */
    if (acao === 'modo') {
      const conversaId = String(corpo.conversa_id ?? '');
      const modo = corpo.modo as Modo;
      if (!conversaId || !MODOS.includes(modo)) return json(400, { error: 'Informe a conversa e o modo (desligado, sugere ou sozinho).' });
      const e = await garantirEstado(db, conversaId);
      if (!e) return json(404, { error: 'conversa não encontrada' });
      const patch: Partial<AssistenteConversa> = { modo };
      if (modo === 'desligado') {
        Object.assign(patch, { token: null, pendente_desde: null });
      } else {
        /* A partir de agora o que a equipe escreve volta a contar como "você assumiu". */
        Object.assign(patch, { ultimo_turno_em: new Date().toISOString(), pausado_motivo: e.pausado_motivo === 'voce_assumiu' ? null : e.pausado_motivo });
      }
      await salvarEstado(db, conversaId, patch);
      if (modo === 'desligado') {
        await db.from('assistente_turnos').update({ status: 'descartado', erro: 'assistente desligado na conversa', decidido_por: membro.id, decidido_em: new Date().toISOString() })
          .eq('conversa_id', conversaId).eq('status', 'rascunho');
      }
      const pensando = modo === 'desligado' ? null : await pedirResposta(db, conversaId);
      return json(200, { ok: true, estado: await lerEstado(db, conversaId), pensando });
    }

    /* ── aprovar o rascunho ─────────────────────────────────────── */
    if (acao === 'aprovar') {
      const { data: turno } = await db.from('assistente_turnos').select('*').eq('id', String(corpo.turno_id ?? '')).maybeSingle();
      if (!turno) return json(404, { error: 'rascunho não encontrado' });
      if (turno.status !== 'rascunho') {
        return json(409, { error: turno.status === 'descartado' ? 'Esse rascunho ficou velho (chegou mensagem nova ou foi descartado).' : 'Esse rascunho já foi decidido.' });
      }
      const e = await lerEstado(db, turno.conversa_id);
      /* Pediu para sair: só a despedida (o rascunho que encerrou) ainda pode sair. */
      const despedida = ((turno.acoes ?? []) as AcaoDoTurno[]).some((a) => a.tipo === 'encerrar');
      if (e?.etapa === 'saiu' && !despedida) return json(409, { error: 'Ele pediu para não receber mais mensagens: nada sai mais nesta conversa.' });
      let mensagens: string[] = Array.isArray(turno.mensagens) ? turno.mensagens : [];
      if (corpo.mensagens !== undefined) {
        if (!Array.isArray(corpo.mensagens) || corpo.mensagens.some((m: unknown) => typeof m !== 'string')) {
          return json(400, { error: 'mensagens tem de ser uma lista de textos' });
        }
        mensagens = corpo.mensagens.map((m: string) => m.trim()).filter(Boolean);
        if (mensagens.length > 5 || mensagens.some((m) => m.length > 1000)) return json(400, { error: 'No máximo 5 mensagens de até 1000 caracteres.' });
      }
      const cfg = await lerConfig(db);
      if (!cfg) return json(500, { error: 'configuração do assistente não encontrada' });
      /* Reserva o rascunho antes de mandar: dois cliques, duas abas ou mensagem nova do lead
         (o motor descarta só o que ainda é 'rascunho') nunca mandam a mesma resposta duas vezes. */
      const { data: reservado } = await db.from('assistente_turnos')
        .update({ status: 'aprovado', decidido_por: membro.id, decidido_em: new Date().toISOString() })
        .eq('id', turno.id).eq('status', 'rascunho').select('id').maybeSingle();
      if (!reservado) return json(409, { error: 'Esse rascunho já foi decidido ou ficou velho (chegou mensagem nova).' });
      const r = await concluirTurno(db, {
        turnoId: turno.id, conversaId: turno.conversa_id, mensagens, acoes: (turno.acoes ?? []) as AcaoDoTurno[], cfg,
        status: 'aprovado', decididoPor: membro.id, rascunhoSeNadaSair: true,
      });
      if (!r.ok && r.enviadas === 0) {
        /* Nada saiu: o rascunho volta de pé, a não ser que já exista um turno mais novo. */
        const { data: novo } = await db.from('assistente_turnos').select('id')
          .eq('conversa_id', turno.conversa_id).gt('criado_em', turno.criado_em).limit(1).maybeSingle();
        await db.from('assistente_turnos')
          .update(novo ? { status: 'descartado' } : { status: 'rascunho', decidido_por: null, decidido_em: null })
          .eq('id', turno.id).eq('status', 'aprovado');
        return json(409, { error: r.motivo });
      }
      return json(200, { ok: r.ok, enviadas: r.enviadas, acoes: r.acoes, aviso: r.ok ? null : r.motivo });
    }

    /* ── descartar o rascunho ───────────────────────────────────── */
    if (acao === 'descartar') {
      const { data: turno } = await db.from('assistente_turnos').select('id, status, acoes').eq('id', String(corpo.turno_id ?? '')).maybeSingle();
      if (!turno) return json(404, { error: 'rascunho não encontrado' });
      if (turno.status !== 'rascunho') return json(409, { error: 'Esse rascunho já foi decidido.' });
      const acoes = ((turno.acoes ?? []) as AcaoDoTurno[]).map((a) => (a.estado === 'pendente' ? { ...a, estado: 'descartada' as const } : a));
      await db.from('assistente_turnos').update({ status: 'descartado', acoes, decidido_por: membro.id, decidido_em: new Date().toISOString() }).eq('id', turno.id);
      return json(200, { ok: true });
    }

    /* ── devolver ao assistente ─────────────────────────────────── */
    if (acao === 'devolver') {
      const conversaId = String(corpo.conversa_id ?? '');
      const e = await garantirEstado(db, conversaId);
      if (!e) return json(404, { error: 'conversa não encontrada' });
      if (e.etapa === 'saiu') return json(409, { error: 'Ele pediu para não receber mais mensagens: o assistente não volta a escrever.' });
      if (e.etapa === 'perdido' && (e.pausado_motivo === 'nao_quer' || e.pausado_motivo === 'xingou')) {
        return json(409, { error: 'Ele disse que não quer: o assistente não volta a escrever. Se quiser retomar, escreva você.' });
      }
      const cfg = await lerConfig(db);
      const pedido = MODOS.includes(corpo.modo) && corpo.modo !== 'desligado' ? corpo.modo as Modo : null;
      const modo: Modo = pedido ?? (e.modo !== 'desligado' ? e.modo : (cfg?.modo_prospeccao && cfg.modo_prospeccao !== 'desligado' ? cfg.modo_prospeccao : 'sugere'));
      await salvarEstado(db, conversaId, {
        modo,
        etapa: proximaEtapa({ ...e, etapa: 'conversa' }),
        pausado_motivo: null,
        ultimo_turno_em: new Date().toISOString(),
        token: null,
        pendente_desde: null,
      });
      await db.from('wa_conversas').update({ fixada: false }).eq('id', conversaId);
      if (e.loja_id) {
        await db.from('prospeccao_lojas').update({ status: 'conversando', motivo: null, atualizada_em: new Date().toISOString() })
          .eq('id', e.loja_id).eq('status', 'com_voce');
      }
      const pensando = await pedirResposta(db, conversaId);
      return json(200, { ok: true, estado: await lerEstado(db, conversaId), pensando });
    }

    /* ── responder agora ────────────────────────────────────────── */
    if (acao === 'responder_agora') {
      const conversaId = String(corpo.conversa_id ?? '');
      const e = await lerEstado(db, conversaId);
      if (!e || e.modo === 'desligado') return json(409, { error: 'O assistente está desligado nesta conversa.' });
      if (ETAPAS_SEM_RESPOSTA.includes(e.etapa)) return json(409, { error: 'Nesta etapa o assistente não escreve (devolva ao assistente antes).' });
      const pensando = await pedirResposta(db, conversaId);
      if (!pensando) return json(409, { error: 'Não há mensagem do lead esperando resposta (ou já passaram 24h).' });
      return json(200, { ok: true, pensando });
    }

    /* ── recomeçar do zero (número de teste) ─────────────────────── */
    if (acao === 'recomecar') {
      const conversaId = String(corpo.conversa_id ?? '');
      const { data: conversa } = await db.from('wa_conversas').select('id, telefone, instancia_id, prospect_id').eq('id', conversaId).maybeSingle();
      if (!conversa) return json(404, { error: 'conversa não encontrada' });
      const { data: inst } = await db.from('wa_instancias').select('origem').eq('id', conversa.instancia_id).maybeSingle();
      const cfg = await lerConfig(db);
      if (inst?.origem !== 'ycloud' || !ehNumeroDeTeste(conversa.telefone, cfg?.telefones_teste)) {
        return json(403, { error: 'Só a conversa de um número de teste, no WhatsApp oficial, pode recomeçar do zero.' });
      }
      const e = await garantirEstado(db, conversaId);
      if (!e) return json(404, { error: 'conversa não encontrada' });
      /* Rodada pensando agora gravaria o estado velho por cima do zerado: espera ela acabar. */
      const pensando = /^em:(\d+):/.exec(e.token ?? '');
      if (pensando && Date.now() - Number(pensando[1]) < 5 * 60_000) {
        return json(409, { error: 'Ele está pensando numa resposta agora. Espere ela sair e recomece.' });
      }
      const agora = new Date().toISOString();
      const card = e.prospect_id ?? conversa.prospect_id ?? null;
      if (card) {
        /* O card do teste volta ao começo do funil (perdido também), para o próximo teste andar
           de novo. Teste grátis e venda são da equipe: esses não mexe. */
        await db.from('prospects').update({ stage: 'contato', lost_reason: null })
          .eq('id', card).in('stage', ['contato', 'amostra', 'oportunidade', 'reuniao', 'perdido']);
      }
      if (e.reuniao_id) {
        /* A reunião do teste sai da Agenda: libera o horário e não manda lembrete. */
        await db.from('meetings').update({ status: 'cancelada', notes: 'Cancelada: teste do assistente recomeçado do zero.' })
          .eq('id', e.reuniao_id).in('status', ['agendada', 'remarcada']);
      }
      await db.from('assistente_turnos')
        .update({ status: 'descartado', erro: 'teste recomeçado do zero', decidido_por: membro.id, decidido_em: agora })
        .eq('conversa_id', conversaId).eq('status', 'rascunho');
      await salvarEstado(db, conversaId, {
        modo: e.modo === 'desligado' ? 'sozinho' : e.modo,
        etapa: 'conversa', memoria: null, dores: [], objecoes: [], situacao: {},
        decisor_vem: null, decisor_citacao: null, quem_vem: null, pedidos_preco: 0, prova_enviada: false,
        horarios_oferecidos: [], reuniao_id: null, prospect_id: null, dossie: null, apresentou: false,
        token: null, pendente_desde: null, mensagens_enviadas: 0, pausado_motivo: null,
        historico_desde: agora, ultimo_turno_em: agora,
      });
      await db.from('wa_conversas').update({ fixada: false, prospect_id: null }).eq('id', conversaId);
      return json(200, { ok: true, estado: await lerEstado(db, conversaId) });
    }

    return json(400, { error: 'ação desconhecida' });
  } catch (e) {
    console.error('assistente-acao:', e);
    return json(500, { error: 'Algo deu errado do nosso lado. Tente de novo em instantes.' });
  }
});
