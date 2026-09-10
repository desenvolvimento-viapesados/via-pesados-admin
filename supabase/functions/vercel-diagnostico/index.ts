/**
 * O token da Vercel funciona, e em qual escopo?
 *
 * Só leitura, e devolve só identificadores — nunca o token. Existe para
 * responder de uma vez o que a conexão de domínio precisa saber: se o token
 * vale, qual é o time e qual projeto recebe os domínios dos clientes.
 */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async () => {
  const token = Deno.env.get('VERCEL_TOKEN');
  if (!token) return json(500, { error: 'VERCEL_TOKEN ausente' });
  const h = { Authorization: `Bearer ${token}` };
  const time = Deno.env.get('VERCEL_TEAM_ID') ?? '';

  const pegar = async (c: string) => {
    const r = await fetch(`https://api.vercel.com${c}`, { headers: h });
    return { http: r.status, dados: await r.json().catch(() => null) };
  };

  const times = await pegar('/v2/teams');
  const q = time ? `?teamId=${time}` : '';
  const projetos = await pegar(`/v9/projects${q}`);

  /* Prova de que o token alcança o endpoint de DOMÍNIOS do projeto — que é
     a permissão que a conexão de cliente usa. Listar projetos não garante
     isso; este GET garante. */
  const proj = Deno.env.get('VERCEL_PROJECT_ID') ?? '';
  const dominios = proj ? await pegar(`/v9/projects/${proj}/domains${q}`) : { http: 0, dados: null };

  return json(200, {
    token: projetos.http === 200 ? 'válido' : 'sem acesso',
    escopo: times.http === 403 ? 'projeto (não vê o time — é o esperado)' : 'time',
    projeto_fixado: proj || null,
    dominios_do_projeto: dominios.http === 200
      ? (dominios.dados?.domains ?? []).map((d: Record<string, unknown>) => ({ nome: d.name, verificado: d.verified }))
      : { http: dominios.http, erro: dominios.dados?.error?.message },
    team_id_configurado: time || null,
    times: (times.dados?.teams ?? []).map((t: Record<string, string>) => ({ id: t.id, nome: t.name, slug: t.slug })),
    projetos: (projetos.dados?.projects ?? []).map((p: Record<string, unknown>) => ({
      id: p.id, nome: p.name,
      dominios: ((p.alias ?? []) as Array<{ domain: string }>).map((a) => a.domain).slice(0, 4),
    })),
    erro: projetos.dados?.error ?? undefined,
  });
});
