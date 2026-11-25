import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dormir, segredoConfere } from '../_shared/assistente.ts';
import { turnoDoGestor } from '../_shared/gestor.ts';

/**
 * O gestor do dono (dono, 25/11/2026): o dono escreve para o número oficial e este motor
 * responde, a qualquer hora (aviso ao próprio dono não segue a janela das 08h–20h).
 *
 * Chamado pelo wa-receber, com o segredo interno, a cada mensagem do dono. Devolve 202
 * na hora e trabalha em segundo plano:
 *   1. espera 12 s para juntar a rajada ("você passou o site?" + "qual o nome dele?");
 *      se chegou mensagem mais nova, esta rodada desiste (a da mais nova responde);
 *   2. trava pela mensagem (wa_envios, template gestor_turno): nunca responde duas vezes;
 *   3. pensa com as ferramentas e responde (gestor.ts).
 */
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
async function trabalhar(db: any, conversaId: string, mensagemId: string): Promise<string> {
  await dormir(12_000);
  const { data: ultima } = await db.from('wa_mensagens').select('id').eq('conversa_id', conversaId)
    .eq('direcao', 'entrada').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (ultima?.id && ultima.id !== mensagemId) return 'chegou mensagem mais nova: ela responde';
  const { error: trava } = await db.from('wa_envios').insert({ template: 'gestor_turno', chave: mensagemId, destino: conversaId });
  if (trava) return 'já respondida';
  const r = await turnoDoGestor(db, conversaId);
  return r.ok ? `respondeu (${(r.resposta ?? '').length} caracteres)` : `não respondeu: ${r.motivo}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const segredo = Deno.env.get('WA_INTERNAL_SECRET') ?? '';
  /* Pelo wa-receber (segredo interno) ou pela chave mestra do projeto (teste da equipe). */
  const mestra = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const interno = !!segredo && segredoConfere(req.headers.get('x-interno') ?? '', segredo);
  if (!interno && !(mestra && segredoConfere(bearer, mestra))) return json(401, { error: 'não autorizado' });
  const { conversa_id, mensagem_id } = await req.json().catch(() => ({}));
  if (!conversa_id || !mensagem_id) return json(400, { error: 'conversa_id e mensagem_id' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const tarefa = trabalhar(db, String(conversa_id), String(mensagem_id))
    .then((r) => console.log('gestor-responder:', conversa_id, r))
    .catch((err) => console.error('gestor-responder:', conversa_id, err));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(tarefa);
  return json(202, { ok: true });
});
