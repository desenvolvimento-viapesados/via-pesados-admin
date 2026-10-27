-- Agente de prospecção (pedido do dono, 27/10/2026).
--
-- O agente acha lojas de pesados (Google Maps, pela API oficial), confere se
-- o número tem WhatsApp, manda a primeira mensagem pelo WhatsApp de vendas e
-- insiste no máximo duas vezes (3 contatos em ~10 dias). Respondeu, para de
-- insistir: o agente conversa até oferecer a amostra e passa para o Xavier.
--
-- A fila mora aqui, e não em `prospects`: loja achada no Google ainda não é
-- prospect. A porta única do funil continua sendo a conversa do WhatsApp com
-- o cadastro breve (portaDoFunil.test.ts) — quem responde aparece no CRM e o
-- vendedor cadastra dali.
--
-- As regras (janela, cadência, limite do dia, quem pediu para sair) moram em
-- supabase/functions/_shared/prospeccao-regras.ts.

create table if not exists public.prospeccao_lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text,
  uf text,
  endereco text,
  -- Só dígitos, com 55. É a chave: a mesma loja achada por duas buscas é uma linha.
  telefone text not null unique,
  -- O número como o WhatsApp o conhece (alguns celulares antigos ficam sem o 9).
  telefone_whatsapp text,
  site text,
  fonte text not null default 'google_maps' check (fonte in ('google_maps', 'manual')),
  fonte_ref text,
  -- Nota e avaliações no Google, tipo, link do mapa: o que a mensagem pode citar sem inventar.
  dados jsonb not null default '{}'::jsonb,
  status text not null default 'nova' check (status in (
    'nova',          -- achada, número ainda não conferido
    'pronta',        -- tem WhatsApp, esperando a vez
    'sem_whatsapp',  -- número sem WhatsApp (fixo, desligado)
    'ja_conhecida',  -- já é cliente, prospect ou já conversou com a gente
    'em_contato',    -- recebeu 1, 2 ou 3 mensagens e não respondeu
    'sem_resposta',  -- 3 contatos e nada: o agente não insiste mais
    'conversando',   -- respondeu; o agente está na conversa
    'com_voce',      -- quer amostra, pediu preço, reunião ou humano: é com o Xavier
    'sem_interesse', -- pediu para sair ou disse que não quer
    'descartada'     -- tirada da fila por alguém da equipe
  )),
  contatos smallint not null default 0 check (contatos between 0 and 3),
  primeiro_contato_em timestamptz,
  ultimo_contato_em timestamptz,
  proximo_contato_em timestamptz,
  respondeu_em timestamptz,
  -- Alguém da equipe escreveu na conversa: o agente sai e não volta.
  humano_assumiu boolean not null default false,
  respostas_do_agente smallint not null default 0,
  -- Espera de alguns segundos antes de responder: se a pessoa manda três
  -- mensagens seguidas, o agente responde uma vez, depois da última.
  responder_token uuid,
  -- Duas rodadas ao mesmo tempo não pegam a mesma loja.
  travada_ate timestamptz,
  conversa_id uuid references public.wa_conversas(id) on delete set null,
  motivo text,
  criada_por uuid references public.team_members(id) on delete set null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index if not exists prospeccao_lojas_status_idx on public.prospeccao_lojas (status, proximo_contato_em);
create index if not exists prospeccao_lojas_cidade_idx on public.prospeccao_lojas (uf, cidade);

-- Toda mensagem que o agente mandou: a de prospecção (1, 2, 3) e as respostas.
create table if not exists public.prospeccao_envios (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.prospeccao_lojas(id) on delete cascade,
  tipo text not null check (tipo in ('contato', 'resposta')),
  numero smallint,
  texto text not null,
  provider_message_id text,
  erro text,
  enviada_em timestamptz not null default now()
);
create index if not exists prospeccao_envios_dia_idx on public.prospeccao_envios (enviada_em);
create index if not exists prospeccao_envios_loja_idx on public.prospeccao_envios (loja_id, enviada_em);

-- O painel do agente: uma linha só.
create table if not exists public.prospeccao_config (
  id smallint primary key default 1 check (id = 1),
  -- Desligado até o dono ligar. Quem liga é ele, nunca o código.
  ligado boolean not null default false,
  ligado_desde timestamptz,
  instancia_id uuid references public.wa_instancias(id) on delete set null,
  -- Teto de PRIMEIRAS mensagens + lembretes por dia. Começa baixo de propósito:
  -- número que de repente manda para muita gente desconhecida é o que a Meta derruba.
  limite_dia smallint not null default 15 check (limite_dia between 1 and 60),
  agente_responde boolean not null default true,
  -- Intervalo aleatório entre dois envios, em minutos.
  intervalo_min smallint not null default 7,
  intervalo_max smallint not null default 18,
  proximo_envio_em timestamptz,
  erros_seguidos smallint not null default 0,
  pausado_motivo text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.team_members(id) on delete set null
);
insert into public.prospeccao_config (id) values (1) on conflict (id) do nothing;

alter table public.prospeccao_lojas enable row level security;
alter table public.prospeccao_envios enable row level security;
alter table public.prospeccao_config enable row level security;

drop policy if exists prospeccao_lojas_equipe on public.prospeccao_lojas;
create policy prospeccao_lojas_equipe on public.prospeccao_lojas
  for all using (public.is_team_member()) with check (public.is_team_member());
drop policy if exists prospeccao_envios_equipe on public.prospeccao_envios;
create policy prospeccao_envios_equipe on public.prospeccao_envios
  for select using (public.is_team_member());
drop policy if exists prospeccao_config_equipe on public.prospeccao_config;
create policy prospeccao_config_equipe on public.prospeccao_config
  for select using (public.is_team_member());

-- A rotina: de 5 em 5 minutos. Ela mesma confere se está ligada, se é dia
-- útil entre 08h e 20h, o limite do dia e o intervalo sorteado — chamada à
-- toa não manda nada.
select cron.unschedule('prospeccao-enviar') where exists (select 1 from cron.job where jobname = 'prospeccao-enviar');
select cron.schedule('prospeccao-enviar', '*/5 * * * *', $$
  select net.http_post(
    url     := 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/prospeccao-enviar',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
