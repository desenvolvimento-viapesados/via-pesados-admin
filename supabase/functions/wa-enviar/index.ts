import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarTemplate } from '../_shared/wa.ts';

/**
 * Disparo de template para quem não é o projeto admin.
 *
 * O número oficial é ativo da Via Pesados, não das lojas — então o
 * META_WABA_TOKEN mora só aqui. O projeto do lojista, que sabe quando um
 * WhatsApp caiu ou um acesso foi criado, chama este endpoint em vez de ter
 * uma cópia do token. Um segredo a menos espalhado é um segredo a menos
 * para vazar.
 *
 * Não é público: exige WA_INTERNAL_SECRET no cabeçalho, comparado em tempo
 * constante. Sem isso, qualquer um mandaria mensagem como Via Pesados.
 */

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-interno', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Comparar com === vaza o prefixo correto pelo tempo de resposta. */
function confere(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

/* Só o que faz sentido vir de fora. Um endpoint que aceitasse qualquer nome
   de template deixaria o projeto lojista mandar cobrança em nome da Via
   Pesados — que é coisa do admin, não dele. */
const PERMITIDOS = new Set(['whatsapp_desconectado', 'acesso_equipe']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const segredo = Deno.env.get('WA_INTERNAL_SECRET');
  if (!segredo) return json(500, { error: 'WA_INTERNAL_SECRET não configurada.' });
  if (!confere(req.headers.get('x-interno') ?? '', segredo)) {
    return json(401, { error: 'não autorizado' });
  }

  try {
    const { para, template, chave, params } = await req.json();
    if (!template || !chave) return json(400, { error: 'template e chave são obrigatórios' });
    if (!PERMITIDOS.has(String(template))) {
      return json(403, { error: `template ${template} não é permitido por este endpoint` });
    }

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const r = await enviarTemplate(db, { para, template, chave, params });
    return json(200, r);
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
