import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { evolution, criarInstancia, garantirWebhook, paraEnvio } from '../_shared/evolution.ts';
import { apagarWebhook, configYCloud, criarWebhook, enviarTextoPorYCloud, EVENTOS, listarWebhooks }
  from '../_shared/ycloud.ts';

/**
 * O que a tela de WhatsApp precisa fazer do lado do servidor.
 *
 *   enviar     manda mensagem — roteando pela origem da instância
 *   conectar   cria a instância na Evolution e devolve o QR
 *   estado     consulta a conexão e atualiza a linha
 *   nova       cadastra o número de alguém da equipe
 *   ler        zera o contador de não lidas
 *   ligar_eventos  aponta o webhook da YCloud para cá e guarda o segredo
 *
 * Envio é o único ponto onde as duas origens divergem de verdade, e a
 * divergência não é técnica, é de regra: pela Evolution mandamos texto livre
 * a qualquer hora; pela Cloud API, fora da janela de 24h, a Meta só aceita
 * template aprovado. Quem sabe disso é o servidor, não a tela.
 */

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const GRAPH = 'https://graph.facebook.com/v21.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user } } = await db.auth.getUser(auth);
    if (!user) return json(401, { error: 'não autenticado' });
    const { data: membro } = await db.from('team_members')
      .select('id, full_name, is_active').eq('id', user.id).maybeSingle();
    if (!membro || membro.is_active === false) return json(403, { error: 'acesso negado' });

    const corpo = await req.json();
    const acao = corpo?.acao;

    /* ── cadastrar número da equipe ──────────────────────────────── */
    if (acao === 'nova') {
      const nome = String(corpo.nome ?? '').trim();
      if (!nome) return json(400, { error: 'Informe o nome' });
      // O nome da instância na Evolution precisa ser estável e sem acento —
      // ele vira parte da URL do webhook.
      const slug = `vp-${nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36).slice(-4)}`;
      const { data, error } = await db.from('wa_instancias').insert({
        nome, origem: 'evolution', evolution_instance: slug,
        dono_id: corpo.dono_id ?? membro.id,
        dono_nome: corpo.dono_nome ?? membro.full_name,
        telefone: String(corpo.telefone ?? '').replace(/\D/g, '') || null,
      }).select('id, evolution_instance').maybeSingle();
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true, instancia: data });
    }

    /* ── QR de conexão ───────────────────────────────────────────── */
    if (acao === 'conectar') {
      const { data: inst } = await db.from('wa_instancias')
        .select('id, evolution_instance, origem').eq('id', corpo.instancia_id).maybeSingle();
      if (!inst) return json(404, { error: 'instância não encontrada' });
      if (inst.origem !== 'evolution') {
        return json(400, { error: 'O número da API oficial não conecta por QR — ele já está ligado pela Meta.' });
      }
      /* O QR é o que a pessoa está esperando na tela, e ele expira em
         segundos. Criar a instância e pedir o código vêm primeiro; o webhook
         é configurado DEPOIS, sem segurar a resposta — três saltos em série
         até a Evolution estouravam o tempo da função, e o Supabase devolve
         5xx sem corpo, que na tela virava "Unexpected end of JSON input". */
      await criarInstancia(inst.evolution_instance!);
      const c = await evolution('instance/connect', inst.evolution_instance!, 'GET') as
        { base64?: string; code?: string; pairingCode?: string } | null;
      garantirWebhook(inst.evolution_instance!).catch((e) => console.warn('webhook:', e));
      const precisaQr = !!(c?.base64 || c?.code);
      await db.from('wa_instancias').update({
        precisa_qr: precisaQr,
        connection_state: precisaQr ? 'close' : 'connecting',
        updated_at: new Date().toISOString(),
      }).eq('id', inst.id);
      return json(200, { ok: true, qr: c?.base64 ?? null, codigo: c?.pairingCode ?? c?.code ?? null });
    }

    /* ── estado da conexão ───────────────────────────────────────── */
    if (acao === 'estado') {
      const { data: inst } = await db.from('wa_instancias')
        .select('id, evolution_instance, origem').eq('id', corpo.instancia_id).maybeSingle();
      if (!inst) return json(404, { error: 'instância não encontrada' });
      if (inst.origem !== 'evolution') return json(200, { ok: true, estado: 'open' });
      const r = await evolution('instance/connectionState', inst.evolution_instance!, 'GET') as
        { instance?: { state?: string } } | null;
      const estado = r?.instance?.state ?? 'close';
      await db.from('wa_instancias').update({
        connection_state: estado,
        connected_at: estado === 'open' ? new Date().toISOString() : null,
        precisa_qr: estado === 'open' ? false : undefined,
        updated_at: new Date().toISOString(),
      }).eq('id', inst.id);
      return json(200, { ok: true, estado });
    }

    /* ── marcar como lida ────────────────────────────────────────── */
    if (acao === 'ler') {
      await db.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', corpo.conversa_id);
      return json(200, { ok: true });
    }

    /* ── enviar ──────────────────────────────────────────────────── */
    if (acao === 'enviar') {
      const texto = String(corpo.texto ?? '').trim();
      if (!texto) return json(400, { error: 'Mensagem vazia' });

      const { data: conversa } = await db.from('wa_conversas')
        .select('id, telefone, instancia_id').eq('id', corpo.conversa_id).maybeSingle();
      if (!conversa) return json(404, { error: 'conversa não encontrada' });
      const { data: inst } = await db.from('wa_instancias')
        .select('id, origem, evolution_instance, cloud_phone_number_id')
        .eq('id', conversa.instancia_id).maybeSingle();
      if (!inst) return json(404, { error: 'instância não encontrada' });

      let providerId: string | null = null;

      /* `!== 'evolution'` e não `=== 'cloud_api'`, igual às outras duas
         checagens deste arquivo. O CHECK do banco só aceita 'evolution' e
         'cloud_api', e esta linha comparava com 'cloud' — valor que nunca
         existiu. O ramo da Meta era código morto: TODO envio caía no
         Evolution, com instância nula, e o número oficial recebia sem nunca
         responder. Escrito assim, origem nova erra para o lado certo. */
      if (inst.origem === 'ycloud') {
        const cfg = configYCloud();
        if (!cfg) return json(500, { error: 'A YCloud não está configurada neste ambiente.' });
        try {
          const d = await enviarTextoPorYCloud(cfg, { para: conversa.telefone, texto });
          providerId = d.id || null;
        } catch (e) {
          /* A regra das 24h é da Meta e chega aqui como recusa do BSP.
             Dizer isso em português evita a pergunta "por que não enviou?". */
          const msg = e instanceof Error ? e.message : 'A YCloud recusou o envio.';
          const foraDaJanela = /24|re-?engagement|outside|session/i.test(msg);
          return json(400, {
            error: foraDaJanela
              ? 'Passaram 24h desde a última mensagem dele. Nesse número só dá para retomar com um template aprovado.'
              : msg,
          });
        }
      } else if (inst.origem !== 'evolution') {
        const token = Deno.env.get('META_WABA_TOKEN');
        if (!token) return json(500, { error: 'META_WABA_TOKEN ausente' });
        const r = await fetch(`${GRAPH}/${inst.cloud_phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp', to: conversa.telefone,
            type: 'text', text: { body: texto },
          }),
        });
        const d = await r.json().catch(() => null);
        if (!r.ok) {
          /* Fora da janela de 24h a Meta recusa texto livre. Dizer isso em
             português evita a pergunta "por que não enviou?" — a resposta é
             regra da Meta, não defeito nosso. */
          const msg = String(d?.error?.message ?? '');
          const foraDaJanela = /24|re-?engagement|outside/i.test(msg);
          return json(400, {
            error: foraDaJanela
              ? 'Passaram 24h desde a última mensagem dele. Nesse número só dá para retomar com um template aprovado.'
              : msg || 'A Meta recusou o envio.',
          });
        }
        providerId = d?.messages?.[0]?.id ?? null;
      } else {
        /* Sem esta guarda o bug acima era silencioso: chamávamos o Evolution
           com instância nula e a falha não dizia o que estava errado. */
        if (!inst.evolution_instance) {
          return json(400, { error: 'Este número não tem instância do Evolution ligada.' });
        }
        const d = await evolution('message/sendText', inst.evolution_instance, 'POST', {
          number: paraEnvio(conversa.telefone), text: texto,
        }) as { key?: { id?: string } };
        providerId = d?.key?.id ?? null;
      }

      const agora = new Date().toISOString();
      await db.from('wa_mensagens').insert({
        conversa_id: conversa.id, instancia_id: inst.id,
        direcao: 'saida', tipo: 'texto', conteudo: texto,
        provider_message_id: providerId, status: 'enviada',
        enviada_por: membro.id, enviada_por_nome: membro.full_name, created_at: agora,
      });
      await db.from('wa_conversas').update({
        ultima_mensagem: texto, ultima_mensagem_em: agora,
        ultima_direcao: 'saida', updated_at: agora,
      }).eq('id', conversa.id);

      return json(200, { ok: true, provider_message_id: providerId });
    }

    /* ── ligar a entrega de eventos da YCloud ────────────────────── */
    if (acao === 'ligar_eventos') {
      const cfg = configYCloud();
      if (!cfg) return json(400, { error: 'A YCloud não está configurada neste ambiente.' });

      const destino = `${Deno.env.get('SUPABASE_URL')}/functions/v1/wa-receber?origem=ycloud`;
      const { data: guardado } = await db.from('wa_webhook')
        .select('endpoint_id, url').eq('provedor', 'ycloud').maybeSingle();

      const existentes = await listarWebhooks(cfg);
      const mesmo = existentes.find((w) => w.url === destino);

      /* Se já existe endpoint para esta URL mas o segredo dele não está
         guardado, não há como validar assinatura nenhuma: a YCloud mostra
         o segredo uma única vez, na criação. Apagar e recriar é o único
         caminho — e o que se apaga é um endpoint nosso, para a nossa
         própria URL. */
      if (mesmo && guardado?.endpoint_id === mesmo.id) {
        return json(200, { ok: true, ja_ligado: true, endpoint: mesmo.id });
      }
      if (mesmo) await apagarWebhook(cfg, mesmo.id);

      const criado = await criarWebhook(cfg, destino);
      if (!criado?.secret) {
        return json(502, { error: 'A YCloud criou o endpoint sem devolver o segredo. Sem ele nada pode ser validado.' });
      }
      await db.from('wa_webhook').upsert({
        provedor: 'ycloud',
        endpoint_id: criado.id,
        url: destino,
        segredo: criado.secret,
        eventos: criado.enabledEvents ?? [],
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'provedor' });

      /* A caixa do número oficial. Sem instância, mensagem que chega não
         tem onde cair — e o webhook ficaria verde sem nada aparecer. */
      const { data: tem } = await db.from('wa_instancias')
        .select('id').eq('telefone', cfg.numero).maybeSingle();
      if (!tem) {
        await db.from('wa_instancias').insert({
          nome: 'Via Pesados · Oficial (YCloud)', telefone: cfg.numero,
          origem: 'ycloud', is_active: true, connection_state: 'open',
          connected_at: new Date().toISOString(),
        });
      }

      /* A YCloud pode aceitar a criação e ignorar a lista de eventos. Sem
         esta conferência, o painel diria "ligado" e nada chegaria. */
      const faltando = EVENTOS.filter((e) => !(criado.enabledEvents ?? []).includes(e));
      return json(200, { ok: true, endpoint: criado.id, eventos: criado.enabledEvents ?? [], faltando });
    }

    return json(400, { error: 'ação desconhecida' });
  } catch (e) {
    console.error('wa-acao:', e);
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
