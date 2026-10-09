-- Régua da mensalidade (regras do dono, 09/10/2026):
--   * nenhuma mensagem automática fora das 08h–20h de Brasília → wa_fila;
--   * o ciclo conta da data de implantação → clients.implantado_em;
--   * 2 dias de tolerância e o acesso é suspenso → clients.acesso_suspenso_em
--     (espelho; quem trava a tela é o projeto do lojista).

create table if not exists public.wa_fila (
  id            uuid primary key default gen_random_uuid(),
  template      text not null,
  chave         text not null,
  client_id     uuid references public.clients(id) on delete cascade,
  para          text not null,
  params        jsonb not null default '{}'::jsonb,
  enviar_apos   timestamptz not null,
  valido_ate    timestamptz,
  condicao      jsonb,
  criado_em     timestamptz not null default now(),
  processado_em timestamptz,
  resultado     text,
  unique (template, chave)
);
create index if not exists wa_fila_pendentes on public.wa_fila (enviar_apos) where processado_em is null;

alter table public.wa_fila enable row level security;
drop policy if exists wa_fila_equipe_le on public.wa_fila;
create policy wa_fila_equipe_le on public.wa_fila for select
  using (exists (select 1 from public.team_members t where t.id = auth.uid() and t.is_active));

alter table public.clients
  add column if not exists implantado_em date,
  add column if not exists acesso_suspenso_em timestamptz,
  add column if not exists acesso_liberado_ate date;

comment on column public.clients.implantado_em is
  'Data de implantação: o ciclo da mensalidade conta daqui (implantou dia 14 → vence todo dia 14).';
comment on column public.clients.acesso_liberado_ate is
  'Liberação manual da equipe: até esta data a rotina não corta de novo, mesmo com mensalidade vencida.';
comment on column public.clients.acesso_suspenso_em is
  'Acesso ao sistema suspenso por mensalidade vencida além da tolerância. Espelho do companies.acesso_suspenso_em do lojista.';

-- Quem já está ativo: a implantação foi o dia da ativação. activated_at vem
-- do paymentDate do Asaas, que é só DATA (gravada à meia-noite UTC) — lida
-- em Brasília ela recua um dia (a iTruck viraria 13/09).
update public.clients
   set implantado_em = (activated_at at time zone 'UTC')::date
 where implantado_em is null and activated_at is not null;

-- Solta a fila a cada 10 minutos (a própria função não faz nada fora da janela).
select cron.unschedule('wa-fila') where exists (select 1 from cron.job where jobname = 'wa-fila');
select cron.schedule('wa-fila', '*/10 * * * *', $$
  select net.http_post(
    url     := 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/wa-fila',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
