-- O Conselho da Via Pesados.
--
-- Uma diretoria de IA (cada diretor é uma skill do Claude) que se reúne toda
-- semana, e quando algo grande acontece, para levar a empresa às metas de
-- /metas. O CEO (Claude) conduz e decide; o dono decide acima dele.
--
-- As reuniões rodam no Claude do dono (sem custo de API) e gravam aqui; o
-- painel só mostra e recolhe as decisões do dono. Nada disto age fora da
-- empresa sozinho: gastar, mexer em campanha ou mandar mensagem passa por
-- uma decisão com status 'aprovada' pelo dono.

-- Uma reunião: semanal, extraordinária (um número saiu da linha) ou uma
-- pergunta que o dono trouxe.
create table if not exists public.conselho_reunioes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('semanal', 'extraordinaria', 'pergunta')),
  titulo text not null,
  -- Por que ela aconteceu: a semana, o alerta que disparou, ou a pergunta.
  gatilho text,
  pauta jsonb not null default '[]',
  status text not null default 'aguardando'
    check (status in ('aguardando', 'em_andamento', 'concluida', 'cancelada')),
  -- O que o conselho viu: o retrato dos números naquele dia, como foi lido.
  retrato jsonb,
  -- A resposta para o dono, curta: a conclusão em uma frase e o resto em
  -- markdown enxuto (o que fazer, quem, até quando, quem discordou).
  conclusao text,
  ata text,
  participantes text[] not null default '{}',
  pergunta_id uuid,
  iniciada_em timestamptz,
  concluida_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Cada fala, na ordem: proposta, réplica, tréplica, decisão do CEO.
create table if not exists public.conselho_falas (
  id uuid primary key default gen_random_uuid(),
  reuniao_id uuid not null references public.conselho_reunioes(id) on delete cascade,
  ordem int not null,
  rodada text not null check (rodada in ('abertura', 'proposta', 'replica', 'treplica', 'decisao', 'dono')),
  diretor text not null,          -- slug: ceo, helena, rafael, marta…
  nome text not null,
  cargo text,
  texto text not null,
  em_resposta_a uuid references public.conselho_falas(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists conselho_falas_reuniao on public.conselho_falas (reuniao_id, ordem);

-- O que sai da reunião. O CEO aprova o que cabe na alçada dele; o resto
-- espera o dono. Uma decisão pode virar experimento (abaixo).
create table if not exists public.conselho_decisoes (
  id uuid primary key default gen_random_uuid(),
  reuniao_id uuid references public.conselho_reunioes(id) on delete set null,
  titulo text not null,
  descricao text,
  responsavel text,               -- slug do diretor dono da execução
  prazo date,
  -- Quem precisa dizer sim.
  alcada text not null default 'dono' check (alcada in ('ceo', 'dono')),
  status text not null default 'aguardando_dono'
    check (status in ('aguardando_dono', 'aprovada', 'vetada', 'em_execucao', 'concluida', 'abandonada')),
  recomendacao_ceo text,          -- "aprovar" / "vetar", com o porquê, em uma linha
  divergencias text,              -- quem foi contra e por quê
  comentario_dono text,
  decidido_por uuid references public.team_members(id) on delete set null,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);

-- O laço que faz o conselho aprender: toda decisão que muda o jeito de
-- vender, anunciar ou atender vira hipótese com número de partida e data de
-- revisão. A reunião seguinte lê o número de novo e diz se funcionou.
create table if not exists public.conselho_experimentos (
  id uuid primary key default gen_random_uuid(),
  decisao_id uuid references public.conselho_decisoes(id) on delete cascade,
  hipotese text not null,
  -- Chave de src/lib/metricas.ts quando o painel já mede; senão 'manual'.
  metrica text not null,
  descricao_metrica text,
  linha_base numeric,
  meta numeric,
  inicio date not null default current_date,
  revisar_em date not null,
  status text not null default 'rodando'
    check (status in ('rodando', 'funcionou', 'nao_funcionou', 'inconclusivo', 'parado')),
  -- Cada leitura: {"data": "AAAA-MM-DD", "valor": n, "nota": "..."}
  leituras jsonb not null default '[]',
  conclusao text,
  criado_em timestamptz not null default now()
);

-- O chat do dono com o conselho: a pergunta entra aqui, a próxima rodada
-- do conselho convoca quem precisa, e a resposta volta na reunião.
create table if not exists public.conselho_perguntas (
  id uuid primary key default gen_random_uuid(),
  pergunta text not null,
  -- Opcional: quem o dono quer ouvir. Vazio = o CEO decide quem convoca.
  diretores text[] not null default '{}',
  status text not null default 'aguardando'
    check (status in ('aguardando', 'em_reuniao', 'respondida', 'cancelada')),
  reuniao_id uuid references public.conselho_reunioes(id) on delete set null,
  feita_por uuid references public.team_members(id) on delete set null,
  criado_em timestamptz not null default now(),
  respondida_em timestamptz
);

alter table public.conselho_reunioes
  drop constraint if exists conselho_reunioes_pergunta_fk,
  add constraint conselho_reunioes_pergunta_fk foreign key (pergunta_id)
    references public.conselho_perguntas(id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['conselho_reunioes','conselho_falas','conselho_decisoes','conselho_experimentos','conselho_perguntas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_equipe on public.%1$I', t);
    execute format('create policy %1$s_equipe on public.%1$I for all using (public.is_team_member()) with check (public.is_team_member())', t);
  end loop;
end $$;
