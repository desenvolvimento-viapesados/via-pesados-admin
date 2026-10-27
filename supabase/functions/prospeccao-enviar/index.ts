import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  conferirWhatsApp, enviarEGravar, escreverContato, instanciaDoAgente, type Loja,
} from '../_shared/prospeccao.ts';
import {
  intervaloSorteado, limiteDoDia, MAX_CONTATOS, podeEnviarAgora, proximoContato, variantes,
} from '../_shared/prospeccao-regras.ts';
import { dentroDaJanela } from '../_shared/regua.ts';

/**
 * A rotina do agente de prospecção. O pg_cron chama de 5 em 5 minutos; cada
 * chamada manda NO MÁXIMO UMA mensagem, e só se tudo isto for verdade:
 *
 *   - o dono ligou o agente na tela (desligado por padrão);
 *   - é dia útil, entre 08h e 20h de Brasília;
 *   - o número escolhido está conectado;
 *   - o teto do dia não foi atingido;
 *   - já passou o intervalo sorteado desde o último envio (7 a 18 min).
 *
 * Lembretes vencidos saem antes de lojas novas: quem já recebeu o primeiro
 * contato não pode ficar esperando a fila de novas andar.
 *
 * Três erros de envio seguidos desligam o agente com o motivo na tela —
 * número caindo é o primeiro sinal de bloqueio, e insistir piora.
 */

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const inicioDoDiaBRT = (agora = new Date()) => {
  const b = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3, 0, 0)).toISOString();
};

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const agora = new Date();

  try {
    const { data: cfg } = await db.from('prospeccao_config').select('*').eq('id', 1).maybeSingle();
    if (!cfg) return json(200, { ok: true, sem_config: true });

    /* Quem escreveu fora do horário ficou esperando: abriu a janela, o agente
       responde (vale mesmo com o ENVIO desligado — é conversa, não prospecção). */
    if (cfg.agente_responde && dentroDaJanela(agora)) {
      const { data: pendentes } = await db.from('prospeccao_lojas').select('id, responder_token')
        .eq('status', 'conversando').eq('humano_assumiu', false).not('responder_token', 'is', null)
        .lt('atualizada_em', new Date(agora.getTime() - 2 * 60_000).toISOString()).limit(5);
      for (const p of pendentes ?? []) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/prospeccao-responder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-interno': Deno.env.get('WA_INTERNAL_SECRET') ?? '' },
          body: JSON.stringify({ loja_id: p.id, token: p.responder_token, esperar: false }),
          signal: AbortSignal.timeout(10_000),
        }).catch((e) => console.warn('prospeccao-enviar: resposta pendente', e));
      }
    }

    if (!cfg.ligado) return json(200, { ok: true, desligado: true });

    /* Quem recebeu os 3 contatos e não respondeu sai da fila de envio. */
    await db.from('prospeccao_lojas')
      .update({ status: 'sem_resposta', proximo_contato_em: null, atualizada_em: agora.toISOString() })
      .eq('status', 'em_contato').gte('contatos', MAX_CONTATOS).lte('proximo_contato_em', agora.toISOString());

    if (!podeEnviarAgora(agora)) return json(200, { ok: true, fora_do_horario: true });

    const { inst, motivo } = await instanciaDoAgente(db, cfg.instancia_id);
    if (!inst) {
      await db.from('prospeccao_config').update({ pausado_motivo: motivo, atualizado_em: agora.toISOString() }).eq('id', 1);
      return json(200, { ok: true, sem_numero: motivo });
    }

    /* Confere o WhatsApp de um lote pequeno das lojas novas a cada rodada. */
    const { data: novas } = await db.from('prospeccao_lojas').select('id, telefone').eq('status', 'nova').order('criada_em').limit(10);
    if (novas?.length) {
      try {
        const r = await conferirWhatsApp(inst.evolution_instance, novas.map((n) => n.telefone));
        for (const n of novas) {
          const wa = r.get(n.telefone) ?? null;
          await db.from('prospeccao_lojas').update({
            status: wa ? 'pronta' : 'sem_whatsapp', telefone_whatsapp: wa, atualizada_em: agora.toISOString(),
          }).eq('id', n.id).eq('status', 'nova');
        }
      } catch (e) {
        console.warn('prospeccao-enviar: conferência do WhatsApp falhou', e);
      }
    }

    if (cfg.proximo_envio_em && new Date(cfg.proximo_envio_em) > agora) return json(200, { ok: true, aguardando: cfg.proximo_envio_em });

    const { count: hoje } = await db.from('prospeccao_envios').select('id', { count: 'exact', head: true })
      .eq('tipo', 'contato').is('erro', null).gte('enviada_em', inicioDoDiaBRT(agora));
    const teto = limiteDoDia(cfg.limite_dia, cfg.ligado_desde ? new Date(cfg.ligado_desde) : null, agora);
    if ((hoje ?? 0) >= teto) return json(200, { ok: true, teto_do_dia: teto });

    /* A vez: lembrete vencido primeiro, depois loja nova pronta. */
    let { data: loja } = await db.from('prospeccao_lojas').select('*')
      .eq('status', 'em_contato').lt('contatos', MAX_CONTATOS).lte('proximo_contato_em', agora.toISOString())
      .order('proximo_contato_em').limit(1).maybeSingle();
    if (!loja) {
      ({ data: loja } = await db.from('prospeccao_lojas').select('*')
        .eq('status', 'pronta').order('criada_em').limit(1).maybeSingle());
    }
    if (!loja) return json(200, { ok: true, fila_vazia: true });

    /* Pega a loja: duas rodadas ao mesmo tempo não mandam para a mesma. */
    const { data: pega } = await db.from('prospeccao_lojas')
      .update({ travada_ate: new Date(agora.getTime() + 3 * 60_000).toISOString() })
      .eq('id', loja.id).or(`travada_ate.is.null,travada_ate.lt.${agora.toISOString()}`)
      .select('id').maybeSingle();
    if (!pega) return json(200, { ok: true, ocupada: loja.id });

    /* Na hora de mandar, confere de novo: se a pessoa escreveu para qualquer
       número nosso desde que entrou na fila, não é mais prospecção fria. */
    const tel = loja.telefone_whatsapp ?? loja.telefone;
    const { data: conversas } = await db.from('wa_conversas').select('id').in('telefone', [...variantes(tel), ...variantes(loja.telefone)]);
    if (conversas?.length) {
      const { count: entrou } = await db.from('wa_mensagens').select('id', { count: 'exact', head: true })
        .in('conversa_id', conversas.map((c) => c.id)).eq('direcao', 'entrada').gte('created_at', loja.criada_em);
      if ((entrou ?? 0) > 0) {
        await db.from('prospeccao_lojas').update({
          status: 'conversando', respondeu_em: agora.toISOString(), proximo_contato_em: null, travada_ate: null,
        }).eq('id', loja.id);
        return json(200, { ok: true, ja_respondeu: loja.id });
      }
    }

    const numero = (loja.contatos ?? 0) + 1;
    const { data: anteriores } = await db.from('prospeccao_envios').select('texto')
      .eq('loja_id', loja.id).eq('tipo', 'contato').is('erro', null).order('enviada_em');
    const { texto, por } = await escreverContato(loja as Loja, numero, (anteriores ?? []).map((a) => a.texto));

    try {
      const { conversa_id, provider_id } = await enviarEGravar(db, inst, tel, texto, loja.nome);
      await db.from('prospeccao_envios').insert({ loja_id: loja.id, tipo: 'contato', numero, texto, provider_message_id: provider_id });
      await db.from('prospeccao_lojas').update({
        status: 'em_contato', contatos: numero,
        primeiro_contato_em: loja.primeiro_contato_em ?? agora.toISOString(),
        ultimo_contato_em: agora.toISOString(),
        proximo_contato_em: proximoContato(numero, agora).toISOString(),
        conversa_id: conversa_id ?? loja.conversa_id, travada_ate: null, atualizada_em: agora.toISOString(),
      }).eq('id', loja.id);
      await db.from('prospeccao_config').update({
        proximo_envio_em: new Date(agora.getTime() + intervaloSorteado(cfg.intervalo_min, cfg.intervalo_max) * 60_000).toISOString(),
        erros_seguidos: 0, pausado_motivo: null, atualizado_em: agora.toISOString(),
      }).eq('id', 1);
      return json(200, { ok: true, enviada: loja.id, contato: numero, texto_por: por });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      await db.from('prospeccao_envios').insert({ loja_id: loja.id, tipo: 'contato', numero, texto, erro: erro.slice(0, 400) });
      await db.from('prospeccao_lojas').update({ travada_ate: null }).eq('id', loja.id);
      const erros = (cfg.erros_seguidos ?? 0) + 1;
      await db.from('prospeccao_config').update({
        erros_seguidos: erros,
        ...(erros >= 3 ? { ligado: false, pausado_motivo: `Desliguei sozinho depois de 3 erros seguidos ao enviar. Último: ${erro.slice(0, 200)}` } : {}),
        proximo_envio_em: new Date(agora.getTime() + 15 * 60_000).toISOString(),
        atualizado_em: agora.toISOString(),
      }).eq('id', 1);
      return json(200, { ok: false, erro });
    }
  } catch (e) {
    console.error('prospeccao-enviar:', e);
    return json(200, { ok: false, erro: e instanceof Error ? e.message : 'erro' });
  }
});
