import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  conferirWhatsApp, enviarEGravar, enviarSequenciaEGravar, escreverContato, instanciaDoAgente, mensagensDaProspeccao,
  situacaoDoOficial, type Loja,
} from '../_shared/prospeccao.ts';
import {
  canalDa, ehCelular, intervaloSorteado, limiteDoDia, MODELOS_DA_PROSPECCAO, NOME_DA_MENSAGEM, podeEnviarAgora, proximoContato,
  STATUS_NA_META,
  REGRAS_DO_CANAL, variantes,
} from '../_shared/prospeccao-regras.ts';
import { modeloAprovado, statusDoModelo } from '../_shared/wa.ts';
import { precoDeHoje } from '../_shared/assistente-regras.ts';

/**
 * A rotina do agente de prospecção. O pg_cron chama de 5 em 5 minutos; cada
 * chamada aborda NO MÁXIMO UMA loja (pelo oficial, as três mensagens da sequência), e só se tudo isto for verdade:
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
 *
 * Pelo número oficial (03/11/2026) muda o seguinte: a mensagem é o modelo
 * aprovado pela Meta, um contato só por loja, e antes de cada envio o
 * número é lido na Meta — qualidade amarela ou vermelha desliga.
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

    /* Quem respondeu é atendido pelo assistente de vendas: as respostas que ficaram
       para depois das 08h saem pela rotina assistente-pendentes, não daqui. */
    if (!cfg.ligado) return json(200, { ok: true, desligado: true });

    const { data: escolhido } = await db.from('wa_instancias').select('origem').eq('id', cfg.instancia_id).maybeSingle();
    const canal = canalDa(escolhido?.origem);
    const { maxContatos } = REGRAS_DO_CANAL[canal];

    /* Quem recebeu todos os contatos do canal e não respondeu sai da fila de envio. */
    await db.from('prospeccao_lojas')
      .update({ status: 'sem_resposta', proximo_contato_em: null, atualizada_em: agora.toISOString() })
      .eq('status', 'em_contato').gte('contatos', maxContatos).lte('proximo_contato_em', agora.toISOString());

    if (!podeEnviarAgora(agora)) return json(200, { ok: true, fora_do_horario: true });

    const { inst, motivo } = await instanciaDoAgente(db, cfg.instancia_id);
    if (!inst) {
      await db.from('prospeccao_config').update({ pausado_motivo: motivo, atualizado_em: agora.toISOString() }).eq('id', 1);
      return json(200, { ok: true, sem_numero: motivo });
    }

    /* Confere o WhatsApp de um lote pequeno das lojas novas a cada rodada. O
       oficial não tem como perguntar: celular vai para a fila, e quem não tem
       WhatsApp volta como falha de entrega (que a Meta não cobra). */
    const { data: novas } = await db.from('prospeccao_lojas').select('id, telefone').eq('status', 'nova').order('criada_em').limit(10);
    if (novas?.length && canal === 'oficial') {
      for (const n of novas) {
        await db.from('prospeccao_lojas').update({
          status: ehCelular(n.telefone) ? 'pronta' : 'sem_whatsapp', atualizada_em: agora.toISOString(),
        }).eq('id', n.id).eq('status', 'nova');
      }
    } else if (novas?.length) {
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
    const teto = limiteDoDia(cfg.limite_dia, cfg.ligado_desde ? new Date(cfg.ligado_desde) : null, agora, canal);
    if ((hoje ?? 0) >= teto) return json(200, { ok: true, teto_do_dia: teto });

    /* O oficial só manda com o número verde na Meta e o modelo aprovado. */
    if (canal === 'oficial') {
      const situacao = await situacaoDoOficial();
      if (!situacao.ok) {
        await db.from('prospeccao_config').update({
          ...(situacao.desligar ? { ligado: false } : {}), pausado_motivo: situacao.motivo, atualizado_em: agora.toISOString(),
        }).eq('id', 1);
        return json(200, { ok: true, oficial: situacao.motivo });
      }
      const travando: string[] = [];
      for (const m of MODELOS_DA_PROSPECCAO) {
        if (await modeloAprovado(m)) continue;
        travando.push(`${NOME_DA_MENSAGEM[m]}: ${STATUS_NA_META[await statusDoModelo(m) ?? ''] ?? 'não está na Meta'}`);
      }
      if (travando.length) {
        await db.from('prospeccao_config').update({
          pausado_motivo: `Nada sai até a Meta aprovar as mensagens da prospecção. ${travando.join('; ')}.`, atualizado_em: agora.toISOString(),
        }).eq('id', 1);
        return json(200, { ok: true, modelo_em_analise: travando });
      }
      /* A 2ª mensagem fala da "oferta especial de lançamento": sem a oferta valendo, não sai. */
      const { data: cfgPreco } = await db.from('assistente_config').select('preco_mensal, preco_cheio, oferta_ate').eq('id', 1).maybeSingle();
      if (!precoDeHoje(cfgPreco, agora)?.cheio) {
        await db.from('prospeccao_config').update({
          pausado_motivo: 'A mensagem da prospecção fala da oferta de lançamento, e ela não está valendo (passou da data ou foi tirada na aba Assistente). Troque o texto antes de ligar de novo.',
          atualizado_em: agora.toISOString(),
        }).eq('id', 1);
        return json(200, { ok: true, oferta: 'fora do prazo' });
      }
    }

    /* A vez: lembrete vencido primeiro, depois loja nova pronta. */
    let { data: loja } = await db.from('prospeccao_lojas').select('*')
      .eq('status', 'em_contato').lt('contatos', maxContatos).lte('proximo_contato_em', agora.toISOString())
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
    let texto: string, por: string;
    if (canal === 'oficial') {
      ({ texto } = mensagensDaProspeccao(loja));
      por = 'modelo';
    } else {
      const { data: anteriores } = await db.from('prospeccao_envios').select('texto')
        .eq('loja_id', loja.id).eq('tipo', 'contato').is('erro', null).order('enviada_em');
      ({ texto, por } = await escreverContato(loja as Loja, numero, (anteriores ?? []).map((a) => a.texto)));
    }

    try {
      let conversa_id: string, provider_id: string | null;
      const emContato = (conversaId: string | null) => ({
        status: 'em_contato', contatos: numero,
        primeiro_contato_em: loja.primeiro_contato_em ?? agora.toISOString(),
        ultimo_contato_em: agora.toISOString(),
        proximo_contato_em: proximoContato(numero, agora).toISOString(),
        conversa_id: conversaId ?? loja.conversa_id, travada_ate: null, atualizada_em: agora.toISOString(),
      });
      if (canal === 'oficial') {
        const { count: tentativas } = await db.from('prospeccao_envios').select('id', { count: 'exact', head: true })
          .eq('loja_id', loja.id).eq('tipo', 'contato');
        /* Cada mensagem é registrada assim que sai (e a loja vira "em contato" com a abertura),
           para o aviso de falha de entrega da Meta achar a loja. */
        ({ conversa_id, provider_id } = await enviarSequenciaEGravar(db, inst, tel, loja, `prospeccao:${loja.id}:${(tentativas ?? 0) + 1}`,
          async (e) => {
            await db.from('prospeccao_envios').insert({
              loja_id: loja.id, tipo: e.tipo, numero, texto: e.texto, provider_message_id: e.provider_id, erro: e.erro?.slice(0, 400) ?? null,
            });
            if (e.tipo === 'contato') await db.from('prospeccao_lojas').update(emContato(e.conversa_id)).eq('id', loja.id);
          }));
      } else {
        ({ conversa_id, provider_id } = await enviarEGravar(db, inst, tel, texto, loja.nome));
        await db.from('prospeccao_envios').insert({ loja_id: loja.id, tipo: 'contato', numero, texto, provider_message_id: provider_id });
        await db.from('prospeccao_lojas').update(emContato(conversa_id)).eq('id', loja.id);
      }
      await db.from('prospeccao_config').update({
        proximo_envio_em: new Date(agora.getTime() + intervaloSorteado(cfg.intervalo_min, cfg.intervalo_max) * 60_000).toISOString(),
        erros_seguidos: 0, pausado_motivo: null, atualizado_em: agora.toISOString(),
      }).eq('id', 1);
      return json(200, { ok: true, enviada: loja.id, contato: numero, texto_por: por });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      await db.from('prospeccao_envios').insert({ loja_id: loja.id, tipo: 'contato', numero, texto, erro: erro.slice(0, 400) });
      /* No oficial a loja que falhou sai da fila (reativar devolve): sem
         isso, um número inválido seria tentado de novo a cada rodada até
         somar três erros e desligar tudo. */
      await db.from('prospeccao_lojas').update({
        travada_ate: null,
        ...(canal === 'oficial' ? { status: 'sem_whatsapp', motivo: `O envio falhou: ${erro.slice(0, 200)}`, atualizada_em: agora.toISOString() } : {}),
      }).eq('id', loja.id);
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
