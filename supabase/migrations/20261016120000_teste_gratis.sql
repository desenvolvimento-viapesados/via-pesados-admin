-- Teste grátis de 30 dias contados da implantação (decisão do dono, 16/10/2026).
--
-- O teste é uma linha à parte, e não um status a mais em `clients`: o
-- status do cliente alimenta MRR, coorte, inadimplência e relatórios, e um
-- valor novo ali teria de ser lembrado em cada conta. Aqui a pergunta
-- "esta loja veio de teste?" vira um join, e "com × sem teste" sai sozinho.
--
-- As regras de data moram em supabase/functions/_shared/teste.ts.

create table if not exists public.testes_gratis (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  -- Quem acompanha. Nasce do responsável da venda.
  owner_id uuid references public.team_members(id) on delete set null,
  status text not null default 'aguardando_implantacao'
    check (status in ('aguardando_implantacao', 'em_teste', 'convertido', 'encerrado', 'cancelado')),
  -- O relógio começa na implantação (aviso de acesso), não na venda.
  inicio date,
  -- Último dia com acesso; o corte é no dia seguinte.
  fim date,
  dias_extras integer not null default 0,
  convertido_em timestamptz,
  encerrado_em timestamptz,
  -- Por que não assinou — o que o vendedor ouviu.
  motivo text,
  criado_por uuid references public.team_members(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.testes_gratis enable row level security;
drop policy if exists testes_gratis_equipe on public.testes_gratis;
create policy testes_gratis_equipe on public.testes_gratis
  for all using (public.is_team_member()) with check (public.is_team_member());

-- Tarefas da agenda: o que o vendedor faz num dia, sem ser reunião.
-- Separado de `meetings` de propósito: reunião conta em relatórios, metas
-- e no funil, e aviso de reunião sai para o cliente por WhatsApp — uma
-- ligação de acompanhamento não pode virar "reunião marcada" nem lembrete.
create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  owner_id uuid references public.team_members(id) on delete set null,
  titulo text not null,
  detalhe text,
  quando timestamptz not null,
  origem text not null default 'manual' check (origem in ('manual', 'teste_gratis')),
  -- Para não duplicar quando a rotina roda de novo: um marco por cliente.
  marco text,
  feito_em timestamptz,
  feito_por uuid references public.team_members(id) on delete set null,
  resultado text,
  criado_em timestamptz not null default now()
);

-- Índice comum, sem WHERE: marco nulo não colide (NULL ≠ NULL).
create unique index if not exists tarefas_cliente_marco_key on public.tarefas (client_id, marco);
create index if not exists tarefas_quando_idx on public.tarefas (quando);

alter table public.tarefas enable row level security;
drop policy if exists tarefas_equipe on public.tarefas;
create policy tarefas_equipe on public.tarefas
  for all using (public.is_team_member()) with check (public.is_team_member());

-- A rotina do teste: todo dia às 09h05 de Brasília, logo depois da régua
-- da mensalidade. Manda o aviso do dia, começa os testes implantados,
-- corta no dia seguinte ao fim e reconhece quem assinou.
select cron.unschedule('teste-gratis') where exists (select 1 from cron.job where jobname = 'teste-gratis');
select cron.schedule('teste-gratis', '5 12 * * *', $$
  select net.http_post(
    url     := 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/teste-gratis',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
