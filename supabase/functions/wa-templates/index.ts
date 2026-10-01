import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { MODELOS, type Componente } from '../_shared/modelos.ts';
import { configYCloud, faltaNaYCloud, listarTemplates, criarTemplate, ycloudPelaMetade } from '../_shared/ycloud.ts';

/**
 * Recria os modelos aprovados numa WABA nova.
 *
 * Template pertence a uma conta do WhatsApp Business, não ao número: quando
 * a conta cai, os onze modelos caem com ela, e o número novo chega sem nada
 * para enviar. Esta função repõe todos de uma vez, com o texto exato que já
 * tinha sido aprovado — recriar à mão no Gerenciador é onde nasce a
 * divergência silenciosa entre o que o código manda e o que foi aprovado.
 *
 * Idempotente: modelo que já existe na conta é pulado, não duplicado. Pode
 * rodar de novo depois de uma reprovação isolada sem mexer nos aprovados.
 *
 * Funciona nos dois transportes. Na YCloud o cabeçalho de documento fica
 * mais simples: em vez do handle em duas etapas da Resumable Upload API,
 * basta a URL pública de um PDF — e a nossa é a do PDF em branco que esta
 * função guarda no Storage, para não mandar nota fiscal de cliente para a
 * revisão da Meta.
 *
 * NÃO ENVIA MENSAGEM. Criar modelo é escrever na conta; disparo é outra
 * função, com trava própria.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

/**
 * PDF de uma página em branco, montado aqui.
 *
 * O cabeçalho de DOCUMENTO exige um exemplo, e o exemplo é um arquivo
 * enviado para a conta. Usar uma nota fiscal de verdade mandaria o documento
 * de um cliente para a revisão da Meta — o exemplo é público dentro do
 * modelo. Os deslocamentos da xref são calculados, não chutados: PDF com
 * xref errada é recusado por leitor rigoroso.
 */
function pdfEmBranco(): Uint8Array {
  const objetos = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>',
  ];
  let corpo = '%PDF-1.4\n';
  const deslocamentos: number[] = [];
  objetos.forEach((o, i) => {
    deslocamentos.push(corpo.length);
    corpo += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const inicioXref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const d of deslocamentos) corpo += `${String(d).padStart(10, '0')} 00000 n \n`;
  corpo += `trailer\n<</Size ${objetos.length + 1}/Root 1 0 R>>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return new TextEncoder().encode(corpo);
}

/**
 * A URL pública do PDF de exemplo, para o cabeçalho de documento na
 * YCloud. Guardado no Storage do painel, e não gerado a cada chamada: a
 * Meta baixa o arquivo na hora da revisão, e um link que muda a cada
 * execução reprovaria o modelo depois.
 */
type Balde = {
  from: (b: string) => {
    getPublicUrl: (p: string) => { data: { publicUrl: string } };
    upload: (p: string, f: Blob, o: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

async function urlDoExemplo(db: { storage: Balde }): Promise<string> {
  const balde = 'logos';           // já existe e é público
  const caminho = 'wa/exemplo.pdf';
  const { data: pub } = db.storage.from(balde).getPublicUrl(caminho);

  /* Sobe só se ainda não estiver lá. `upsert: false` devolve erro de
     duplicado, que aqui é sucesso — o arquivo que interessa já existe. */
  const { error } = await db.storage.from(balde).upload(
    caminho,
    new Blob([pdfEmBranco().buffer as ArrayBuffer], { type: 'application/pdf' }),
    { contentType: 'application/pdf', upsert: false },
  );
  if (error && !/exists|duplicate/i.test(error.message)) {
    throw new Error(`não consegui guardar o PDF de exemplo: ${error.message}`);
  }
  return pub.publicUrl;
}

/**
 * Sobe o arquivo e devolve o handle que o modelo referencia.
 *
 * É a Resumable Upload API, em duas etapas: abrir a sessão no app e enviar
 * os bytes nela. Pertence ao APP, não à WABA — por isso exige META_APP_ID,
 * que é outro segredo.
 */
async function subirDocumento(token: string, appId: string): Promise<string> {
  const arquivo = pdfEmBranco();

  const sessao = await fetch(
    `${GRAPH}/${appId}/uploads?file_length=${arquivo.byteLength}&file_type=application/pdf&file_name=exemplo.pdf`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
  const s = await sessao.json();
  if (!sessao.ok || !s?.id) throw new Error(`abrir upload: ${s?.error?.message ?? sessao.status}`);

  const envio = await fetch(`${GRAPH}/${s.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_offset: '0', 'Content-Type': 'application/pdf' },
    /* `.buffer` e não o Uint8Array: o tipo de `body` não aceita a view. */
    body: arquivo.buffer as ArrayBuffer,
  });
  const e = await envio.json();
  if (!envio.ok || !e?.h) throw new Error(`enviar bytes: ${e?.error?.message ?? envio.status}`);
  return e.h as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  if (ycloudPelaMetade()) {
    return json(500, {
      error: 'A YCloud está configurada pela metade — não vou criar modelo na conta antiga por engano.',
      falta_na_ycloud: faltaNaYCloud(),
    });
  }

  const ycloud = configYCloud();
  const token = Deno.env.get('META_WABA_TOKEN');
  const waba = Deno.env.get('META_WABA_ID');
  if (!ycloud && !token) {
    return json(500, {
      error: 'Nenhum provedor de WhatsApp configurado.',
      falta_na_ycloud: faltaNaYCloud(),
    });
  }
  if (!ycloud && !waba) return json(500, { error: 'META_WABA_ID ausente' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    /* Criar modelo é escrever na conta da Meta em nome da Via Pesados. Só
       membro ativo da equipe, como em qualquer ação que sai daqui. */
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user } } = await db.auth.getUser(auth);
    if (!user) return json(401, { error: 'não autenticado' });
    const { data: membro } = await db.from('team_members')
      .select('id, is_active').eq('id', user.id).maybeSingle();
    if (!membro || membro.is_active === false) return json(403, { error: 'acesso negado' });

    const { action } = await req.json().catch(() => ({ action: 'listar' }));
    const provedor = ycloud ? 'ycloud' : 'meta';
    const conta = ycloud ? ycloud.waba : waba;

    // O que a conta já tem. Vale para as duas ações.
    const existentes = new Map<string, string>();
    if (ycloud) {
      try {
        for (const t of await listarTemplates(ycloud)) existentes.set(t.name, t.status);
      } catch (e) {
        return json(502, { provedor, conta, erro: e instanceof Error ? e.message : 'falha ao listar' });
      }
    } else {
      const r = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,status&limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const atual = await r.json();
      if (!r.ok) return json(502, { erro_meta: atual?.error ?? atual, waba });
      for (const t of (atual?.data ?? []) as { name: string; status: string }[]) {
        existentes.set(t.name, t.status);
      }
    }

    if (action !== 'criar') {
      return json(200, {
        provedor,
        conta,
        na_conta: [...existentes].map(([nome, status]) => ({ nome, status })),
        faltando: MODELOS.filter((m) => !existentes.has(m.name)).map((m) => m.name),
      });
    }

    /* O exemplo do cabeçalho de documento. Só é preparado se algum modelo
       precisar — na Graph é um handle de upload em duas etapas; na YCloud,
       a URL pública do mesmo PDF em branco. */
    let exemploDoc: { header_handle: string[] } | { header_url: string[] } | null = null;
    let erroDoc: string | null = null;
    if (MODELOS.some((m) => m.components.some((c) => c.__precisa_handle))) {
      try {
        if (ycloud) {
          exemploDoc = { header_url: [await urlDoExemplo(db)] };
        } else {
          const appId = Deno.env.get('META_APP_ID');
          if (!appId) throw new Error('META_APP_ID ausente');
          exemploDoc = { header_handle: [await subirDocumento(token!, appId)] };
        }
      } catch (e) {
        erroDoc = e instanceof Error ? e.message : 'falha ao preparar o documento de exemplo';
      }
    }

    const relatorio: { nome: string; resultado: string; detalhe?: string }[] = [];

    for (const m of MODELOS) {
      if (existentes.has(m.name)) {
        relatorio.push({ nome: m.name, resultado: 'já existe', detalhe: existentes.get(m.name) });
        continue;
      }

      const componentes: Componente[] = [];
      let bloqueado: string | null = null;
      for (const c of m.components) {
        const { __precisa_handle, ...limpo } = c;
        if (__precisa_handle) {
          if (!exemploDoc) { bloqueado = erroDoc ?? 'sem exemplo de documento'; break; }
          componentes.push({ ...limpo, example: exemploDoc } as Componente);
        } else {
          componentes.push(limpo as Componente);
        }
      }
      if (bloqueado) {
        relatorio.push({ nome: m.name, resultado: 'pulado', detalhe: bloqueado });
        continue;
      }

      if (ycloud) {
        try {
          const d = await criarTemplate(ycloud, {
            name: m.name, language: m.language, category: m.category, components: componentes,
          });
          relatorio.push({ nome: m.name, resultado: 'criado', detalhe: d?.status ?? 'PENDING' });
        } catch (e) {
          relatorio.push({ nome: m.name, resultado: 'erro', detalhe: e instanceof Error ? e.message : 'falha' });
        }
      } else {
        const res = await fetch(`${GRAPH}/${waba}/message_templates`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: m.name, language: m.language, category: m.category, components: componentes,
          }),
        });
        const d = await res.json();
        relatorio.push(
          res.ok && d?.id
            ? { nome: m.name, resultado: 'criado', detalhe: d.status ?? 'PENDING' }
            : { nome: m.name, resultado: 'erro', detalhe: d?.error?.message ?? `HTTP ${res.status}` },
        );
      }
    }

    const quantos = (r2: string) => relatorio.filter((x) => x.resultado === r2).length;
    return json(200, {
      provedor,
      conta,
      resumo: {
        criados: quantos('criado'), ja_existiam: quantos('já existe'),
        erros: quantos('erro'), pulados: quantos('pulado'),
      },
      relatorio,
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Erro' });
  }
});
