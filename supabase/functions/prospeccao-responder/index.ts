import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  decidirResposta, enviarEGravar, instanciaDoAgente, REMETENTE_AGENTE, type Loja,
} from '../_shared/prospeccao.ts';
import { pediuParaSair } from '../_shared/prospeccao-regras.ts';
import { dentroDaJanela } from '../_shared/regua.ts';

/**
 * O agente responde quem respondeu a prospecção.
 *
 * Chamado por dentro (wa-receber quando a loja escreve, prospeccao-enviar
 * quando abre a janela das 08h), com o segredo interno. Devolve na hora e
 * trabalha em segundo plano:
 *
 *   1. espera ~40 s — a pessoa que manda três mensagens seguidas recebe UMA
 *      resposta, depois da última (o token muda a cada mensagem que chega);
 *   2. sai se alguém da equipe já escreveu na conversa (do CRM ou do
 *      celular): a partir daí a conversa é de gente, e o agente não volta;
 *   3. pediu para sair → agradece uma vez e encerra;
 *   4. senão, a IA lê a conversa e decide: responder, passar para o Xavier
 *      (amostra topada, preço, reunião, áudio, dúvida fora do roteiro) ou
 *      encerrar. Passou para o Xavier, a conversa fica fixada no topo.
 *
 * Nunca cria card no funil: a porta única continua sendo o cadastro breve
 * feito pela equipe a partir da conversa (portaDoFunil.test.ts).
 */

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const MAX_RESPOSTAS = 5;
const ESPERA_MS = 40_000;

function confere(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

const AGRADECE = [
  'Tranquilo, obrigado pelo retorno! Não te chamo mais por aqui. Boas vendas!',
  'Entendido, obrigado por responder. Não vou mais te incomodar. Abraço!',
  'Sem problema, obrigado! Não te mando mais mensagem. Grande abraço!',
];

// deno-lint-ignore no-explicit-any
async function trabalhar(db: any, lojaId: string, token: string, esperar: boolean) {
  if (esperar) await new Promise((r) => setTimeout(r, ESPERA_MS));
  const agora = () => new Date().toISOString();

  const { data: loja } = await db.from('prospeccao_lojas').select('*').eq('id', lojaId).maybeSingle() as { data: Loja & { motivo: string | null } | null };
  if (!loja || loja.responder_token !== token) return 'outra mensagem chegou depois';
  const limpa = () => db.from('prospeccao_lojas').update({ responder_token: null, atualizada_em: agora() }).eq('id', lojaId).eq('responder_token', token);
  if (loja.status !== 'conversando' || loja.humano_assumiu || !loja.conversa_id) { await limpa(); return 'conversa não é mais do agente'; }
  if (!dentroDaJanela()) return 'fora do horário — a rotina das 08h responde';

  const { data: cfg } = await db.from('prospeccao_config').select('agente_responde, instancia_id').eq('id', 1).maybeSingle();
  if (!cfg?.agente_responde) { await limpa(); return 'agente não responde (desligado na tela)'; }
  const { inst, motivo } = await instanciaDoAgente(db, cfg.instancia_id);
  if (!inst) return motivo;

  const { data: msgs } = await db.from('wa_mensagens')
    .select('direcao, conteudo, tipo, enviada_por_nome, created_at')
    .eq('conversa_id', loja.conversa_id).order('created_at', { ascending: false }).limit(30);
  const conversa = (msgs ?? []).reverse();
  const { data: nossos } = await db.from('prospeccao_envios').select('texto').eq('loja_id', lojaId);
  const textosDoAgente = new Set((nossos ?? []).map((n: { texto: string }) => n.texto.trim()));
  const doAgente = (m: { direcao: string; conteudo: string | null; enviada_por_nome: string | null }) =>
    m.direcao === 'saida' && (m.enviada_por_nome === REMETENTE_AGENTE || textosDoAgente.has(String(m.conteudo ?? '').trim()));

  /* Alguém da equipe escreveu? A conversa é dele. */
  if (conversa.some((m: { direcao: string }) => m.direcao === 'saida' && !doAgente(m as never))) {
    await db.from('prospeccao_lojas').update({ humano_assumiu: true, responder_token: null, atualizada_em: agora() }).eq('id', lojaId);
    return 'a equipe assumiu';
  }

  const fixar = async (motivoEquipe: string) => {
    await db.from('wa_conversas').update({ fixada: true, updated_at: agora() }).eq('id', loja.conversa_id);
    await db.from('prospeccao_lojas').update({ status: 'com_voce', motivo: motivoEquipe, responder_token: null, atualizada_em: agora() }).eq('id', lojaId);
  };

  if (loja.respostas_do_agente >= MAX_RESPOSTAS) {
    await fixar('A conversa passou de 5 respostas do agente: melhor seguir com gente.');
    return 'limite de respostas';
  }

  const ultimaEntrada = [...conversa].reverse().find((m: { direcao: string }) => m.direcao === 'entrada') as { conteudo: string | null } | undefined;
  let acao: 'responder' | 'passar_para_xavier' | 'encerrar';
  let texto: string;
  let motivoEquipe: string;
  if (pediuParaSair(ultimaEntrada?.conteudo)) {
    acao = 'encerrar';
    texto = AGRADECE[Math.floor(Math.random() * AGRADECE.length)];
    motivoEquipe = 'Pediu para não receber mais mensagens.';
  } else {
    const d = await decidirResposta(loja, conversa.map((m: { direcao: string; conteudo: string | null; tipo: string }) => ({
      direcao: m.direcao, conteudo: m.conteudo, tipo: m.tipo, por_agente: doAgente(m as never),
    })));
    if (!d) {
      /* Sem IA (chave ausente, recusa, erro): ninguém fica sem resposta —
         a conversa vai para o Xavier, sem mensagem automática. */
      await fixar('O agente não conseguiu responder: precisa de alguém da equipe.');
      return 'sem decisão da IA';
    }
    ({ acao, texto, motivo: motivoEquipe } = d);
  }

  /* Releitura final: chegou mensagem nova enquanto a IA pensava? Quem responde é a próxima rodada. */
  const { data: ainda } = await db.from('prospeccao_lojas').select('responder_token, humano_assumiu').eq('id', lojaId).maybeSingle();
  if (!ainda || ainda.responder_token !== token || ainda.humano_assumiu) return 'mudou enquanto pensava';

  const tel = loja.telefone_whatsapp ?? loja.telefone;
  const { provider_id } = await enviarEGravar(db, inst, tel, texto, loja.nome);
  await db.from('prospeccao_envios').insert({ loja_id: lojaId, tipo: 'resposta', texto, provider_message_id: provider_id });
  await db.from('prospeccao_lojas').update({ respostas_do_agente: loja.respostas_do_agente + 1, atualizada_em: agora() }).eq('id', lojaId);

  if (acao === 'passar_para_xavier') await fixar(motivoEquipe);
  else if (acao === 'encerrar') {
    await db.from('prospeccao_lojas').update({ status: 'sem_interesse', motivo: motivoEquipe, responder_token: null }).eq('id', lojaId);
  } else await limpa();
  return acao;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const segredo = Deno.env.get('WA_INTERNAL_SECRET') ?? '';
  if (!segredo || !confere(req.headers.get('x-interno') ?? '', segredo)) return json(401, { error: 'não autorizado' });

  const { loja_id, token, esperar = true } = await req.json().catch(() => ({}));
  if (!loja_id || !token) return json(400, { error: 'loja_id e token' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const tarefa = trabalhar(db, loja_id, token, esperar)
    .then((r) => console.log('prospeccao-responder:', loja_id, r))
    .catch((e) => console.error('prospeccao-responder:', loja_id, e));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(tarefa);
  return json(202, { ok: true });
});
