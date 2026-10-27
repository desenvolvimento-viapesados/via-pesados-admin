import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buscarNoGoogle, claudeConfigurado, escreverContato, googleConfigurado, instanciaDoAgente, telefonesConhecidos, type Loja,
} from '../_shared/prospeccao.ts';
import { limiteDoDia, MAX_CONTATOS, podeEnviarAgora, variantes } from '../_shared/prospeccao-regras.ts';

/**
 * O que a aba Prospecção do CRM faz do lado do servidor.
 *
 *   estado     painel: ligado?, número, teto do dia, contagens, o que falta configurar
 *   config     liga/desliga, escolhe o número, o teto do dia e se o agente responde
 *   buscar     acha lojas numa cidade (Google Maps) e põe na fila
 *   previa     escreve a próxima mensagem de uma loja, SEM mandar
 *   descartar  tira uma loja da fila / reativar devolve
 *
 * Ligar é sempre gesto de alguém da equipe na tela — o código nunca liga.
 */

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const inicioDoDiaBRT = (agora = new Date()) => {
  const b = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3, 0, 0)).toISOString();
};

const STATUS = ['nova', 'pronta', 'sem_whatsapp', 'ja_conhecida', 'em_contato', 'sem_resposta', 'conversando', 'com_voce', 'sem_interesse', 'descartada'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user } } = await db.auth.getUser(auth);
    if (!user) return json(401, { error: 'não autenticado' });
    const { data: membro } = await db.from('team_members').select('id, is_active').eq('id', user.id).maybeSingle();
    if (!membro || membro.is_active === false) return json(403, { error: 'acesso negado' });

    const corpo = await req.json();
    const acao = corpo?.acao;
    const agora = new Date();

    /* ── estado ───────────────────────────────────────────────── */
    if (acao === 'estado') {
      const { data: cfg } = await db.from('prospeccao_config').select('*').eq('id', 1).maybeSingle();
      const { data: numeros } = await db.from('wa_instancias')
        .select('id, nome, telefone, connection_state').eq('origem', 'evolution').eq('is_active', true).order('nome');
      const contagens: Record<string, number> = {};
      await Promise.all(STATUS.map(async (s) => {
        const { count } = await db.from('prospeccao_lojas').select('id', { count: 'exact', head: true }).eq('status', s);
        contagens[s] = count ?? 0;
      }));
      const { count: hoje } = await db.from('prospeccao_envios').select('id', { count: 'exact', head: true })
        .eq('tipo', 'contato').is('erro', null).gte('enviada_em', inicioDoDiaBRT(agora));
      const { count: respostasHoje } = await db.from('prospeccao_envios').select('id', { count: 'exact', head: true })
        .eq('tipo', 'resposta').gte('enviada_em', inicioDoDiaBRT(agora));
      const { inst, motivo } = await instanciaDoAgente(db, cfg?.instancia_id ?? null);
      return json(200, {
        config: cfg, numeros: numeros ?? [], contagens,
        hoje: hoje ?? 0, respostas_hoje: respostasHoje ?? 0,
        teto: limiteDoDia(cfg?.limite_dia ?? 15, cfg?.ligado_desde ? new Date(cfg.ligado_desde) : null, agora),
        horario_de_envio: podeEnviarAgora(agora),
        numero_ok: !!inst, numero_motivo: motivo,
        google: googleConfigurado(), ia: claudeConfigurado(),
      });
    }

    /* ── config ───────────────────────────────────────────────── */
    if (acao === 'config') {
      const { data: cfg } = await db.from('prospeccao_config').select('*').eq('id', 1).maybeSingle();
      const mudar: Record<string, unknown> = { atualizado_em: agora.toISOString(), atualizado_por: membro.id };
      if (corpo.instancia_id !== undefined) mudar.instancia_id = corpo.instancia_id || null;
      if (corpo.limite_dia !== undefined) {
        const n = Math.round(Number(corpo.limite_dia));
        if (!(n >= 1 && n <= 60)) return json(400, { error: 'O teto do dia vai de 1 a 60.' });
        mudar.limite_dia = n;
      }
      if (corpo.agente_responde !== undefined) mudar.agente_responde = !!corpo.agente_responde;
      if (corpo.ligado !== undefined) {
        if (corpo.ligado) {
          const { inst, motivo } = await instanciaDoAgente(db, (mudar.instancia_id as string | null | undefined) ?? cfg?.instancia_id ?? null);
          if (!inst) return json(400, { error: motivo });
          mudar.ligado = true;
          mudar.ligado_desde = cfg?.ligado_desde ?? agora.toISOString();
          mudar.erros_seguidos = 0;
          mudar.pausado_motivo = null;
        } else {
          mudar.ligado = false;
        }
      }
      const { error } = await db.from('prospeccao_config').update(mudar).eq('id', 1);
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    /* ── buscar ───────────────────────────────────────────────── */
    if (acao === 'buscar') {
      const cidade = String(corpo.cidade ?? '').trim();
      const uf = String(corpo.uf ?? '').trim().toUpperCase();
      if (!cidade || !/^[A-Z]{2}$/.test(uf)) return json(400, { error: 'Escolha a cidade e o estado.' });
      if (!googleConfigurado()) return json(400, { error: 'Falta cadastrar a chave do Google Maps (GOOGLE_MAPS_API_KEY).' });

      const { achadas, descartadas } = await buscarNoGoogle(cidade, uf);
      const conhecidos = await telefonesConhecidos(db);
      const { data: naFila } = await db.from('prospeccao_lojas').select('telefone')
        .in('telefone', achadas.flatMap((a) => variantes(a.telefone)));
      const jaNaFila = new Set((naFila ?? []).flatMap((f: { telefone: string }) => variantes(f.telefone)));

      /* A mesma loja cadastrada duas vezes no Google (ou com e sem o 9) vira uma linha. */
      const vistos = new Set<string>();
      const unicas = achadas.filter((a) => {
        if (jaNaFila.has(a.telefone) || vistos.has(a.telefone)) return false;
        variantes(a.telefone).forEach((v) => vistos.add(v));
        return true;
      });
      const linhas = unicas.map((a) => ({
        ...a, fonte: 'google_maps', criada_por: membro.id,
        status: variantes(a.telefone).some((v) => conhecidos.has(v)) ? 'ja_conhecida' : 'nova',
      }));
      if (linhas.length) {
        const { error } = await db.from('prospeccao_lojas').upsert(linhas, { onConflict: 'telefone', ignoreDuplicates: true });
        if (error) return json(400, { error: error.message });
      }
      return json(200, {
        ok: true, achadas: achadas.length, novas: linhas.filter((l) => l.status === 'nova').length,
        ja_conhecidas: linhas.filter((l) => l.status === 'ja_conhecida').length,
        ja_na_fila: achadas.length - linhas.length, descartadas,
      });
    }

    /* ── prévia ───────────────────────────────────────────────── */
    if (acao === 'previa') {
      const { data: loja } = await db.from('prospeccao_lojas').select('*').eq('id', corpo.loja_id).maybeSingle();
      if (!loja) return json(404, { error: 'Loja não encontrada.' });
      const numero = Math.min((loja.contatos ?? 0) + 1, MAX_CONTATOS);
      const { data: anteriores } = await db.from('prospeccao_envios').select('texto')
        .eq('loja_id', loja.id).eq('tipo', 'contato').is('erro', null).order('enviada_em');
      const r = await escreverContato(loja as Loja, numero, (anteriores ?? []).map((a: { texto: string }) => a.texto));
      return json(200, { ok: true, contato: numero, ...r });
    }

    /* ── descartar / reativar ─────────────────────────────────── */
    if (acao === 'descartar' || acao === 'reativar') {
      const { data: loja } = await db.from('prospeccao_lojas').select('id, status, contatos').eq('id', corpo.loja_id).maybeSingle();
      if (!loja) return json(404, { error: 'Loja não encontrada.' });
      const status = acao === 'descartar' ? 'descartada' : (loja.contatos > 0 ? 'sem_resposta' : 'nova');
      await db.from('prospeccao_lojas').update({ status, proximo_contato_em: null, atualizada_em: agora.toISOString() }).eq('id', loja.id);
      return json(200, { ok: true, status });
    }

    return json(400, { error: 'ação desconhecida' });
  } catch (e) {
    console.error('prospeccao:', e);
    return json(500, { error: e instanceof Error ? e.message : 'erro' });
  }
});
