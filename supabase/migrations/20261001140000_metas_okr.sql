-- Metas: do horizonte de cinco anos ao check-in da semana.
--
-- Quatro camadas, e cada uma existe por um motivo diferente:
--
--   NSM          a métrica-norte. UMA só, e ela não muda de trimestre em
--                trimestre — é a que diz se a empresa está entregando
--                valor, não se a equipe andou ocupada.
--   cinco_anos   onde se quer chegar. Não tem check-in semanal: serve
--                para dizer "não" ao que não leva para lá.
--   ano          o pedaço do caminho que cabe num ano.
--   trimestre    o OKR de verdade: objetivo curto, 3 a 5 resultados-chave
--                medidos em número, com dono e confiança.
--   mes          quando o trimestre é longo demais para o que se quer ver.
--
-- O que faz este módulo não virar planilha esquecida é o KR que se mede
-- sozinho: `fonte` diz de qual número do painel ele sai (MRR, clientes
-- pagando, caminhões vendidos pela base), e o valor atual vem de lá a
-- cada abertura da tela. O manual continua existindo para o que não é
-- medido pelo sistema — contratação, certificação, lançamento.

create table if not exists public.metas_ciclos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('mes', 'trimestre', 'ano', 'cinco_anos')),
  /** "2026 · T4", "2026", "2026–2030". É o que aparece na tela. */
  rotulo text not null,
  inicio date not null,
  fim date not null,
  /** O foco do ciclo, em uma frase. Ajuda a recusar objetivo que não cabe. */
  tema text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo, inicio, fim)
);

create table if not exists public.metas_objetivos (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references public.metas_ciclos(id) on delete cascade,
  titulo text not null,
  /** Por que isso importa. Objetivo sem porquê vira tarefa. */
  porque text,
  dono_id uuid references public.team_members(id) on delete set null,
  nivel text not null default 'empresa' check (nivel in ('empresa', 'time', 'pessoa')),
  /* A cascata: o objetivo do trimestre aponta para o do ano, e o do ano
     para o de cinco anos. É o que mostra se o trimestre está servindo ao
     longo prazo ou só apagando incêndio. */
  pai_id uuid references public.metas_objetivos(id) on delete set null,
  status text not null default 'ativo' check (status in ('rascunho', 'ativo', 'concluido', 'abandonado')),
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists metas_objetivos_ciclo on public.metas_objetivos (ciclo_id);
create index if not exists metas_objetivos_pai on public.metas_objetivos (pai_id);

create table if not exists public.metas_kr (
  id uuid primary key default gen_random_uuid(),
  objetivo_id uuid not null references public.metas_objetivos(id) on delete cascade,
  titulo text not null,
  unidade text not null default 'numero' check (unidade in ('numero', 'moeda', 'percentual', 'marco')),
  /* De onde se partiu e onde se quer chegar. A partida importa: sair de
     8 para 10 não é o mesmo trabalho que sair de 0 para 10, e progresso
     medido sobre o alvo sozinho mente nos dois casos. */
  partida numeric not null default 0,
  alvo numeric not null,
  /* 'manual' ou o nome de uma métrica do painel (ver src/lib/metricas.ts).
     Métrica que o sistema sabe não se digita — digitada, ela atrasa. */
  fonte text not null default 'manual',
  valor_manual numeric,
  /* Nem todo KR sobe: inadimplência e churn são para descer. */
  direcao text not null default 'subir' check (direcao in ('subir', 'descer')),
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists metas_kr_objetivo on public.metas_kr (objetivo_id);

/* O check-in é o que separa OKR de lista de desejos: toda semana alguém
   diz onde está e com quanta confiança. O histórico fica — é nele que se
   vê a meta que virou vermelha em junho e ninguém mexeu até setembro. */
create table if not exists public.metas_checkins (
  id uuid primary key default gen_random_uuid(),
  kr_id uuid not null references public.metas_kr(id) on delete cascade,
  valor numeric,
  confianca text not null default 'media' check (confianca in ('alta', 'media', 'baixa')),
  comentario text,
  autor_id uuid references public.team_members(id) on delete set null,
  autor_nome text,
  created_at timestamptz not null default now()
);
create index if not exists metas_checkins_kr on public.metas_checkins (kr_id, created_at desc);

/* A métrica-norte. Uma linha só, de propósito: duas estrelas-norte são
   zero estrelas-norte. */
create table if not exists public.metas_nsm (
  id boolean primary key default true check (id),
  metrica text not null default 'veiculos_vendidos_base',
  rotulo text not null default 'Caminhões vendidos pelos lojistas',
  /** Por que esta e não outra. */
  porque text,
  unidade text not null default 'numero' check (unidade in ('numero', 'moeda', 'percentual')),
  meta_ano numeric,
  atualizado_em timestamptz not null default now()
);

/* A série da NSM. Um ponto por dia, gravado quando alguém abre a tela —
   sem isso o gráfico começa no dia em que alguém lembrar de exportar. */
create table if not exists public.metas_nsm_serie (
  dia date primary key,
  valor numeric not null,
  created_at timestamptz not null default now()
);

alter table public.metas_ciclos enable row level security;
alter table public.metas_objetivos enable row level security;
alter table public.metas_kr enable row level security;
alter table public.metas_checkins enable row level security;
alter table public.metas_nsm enable row level security;
alter table public.metas_nsm_serie enable row level security;

create policy metas_ciclos_equipe on public.metas_ciclos for all
  using (is_team_member()) with check (is_team_member());
create policy metas_objetivos_equipe on public.metas_objetivos for all
  using (is_team_member()) with check (is_team_member());
create policy metas_kr_equipe on public.metas_kr for all
  using (is_team_member()) with check (is_team_member());
create policy metas_checkins_equipe on public.metas_checkins for all
  using (is_team_member()) with check (is_team_member());
create policy metas_nsm_equipe on public.metas_nsm for all
  using (is_team_member()) with check (is_team_member());
create policy metas_nsm_serie_equipe on public.metas_nsm_serie for all
  using (is_team_member()) with check (is_team_member());
