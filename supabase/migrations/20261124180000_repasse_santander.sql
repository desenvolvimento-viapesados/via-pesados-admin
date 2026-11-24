-- Repasse diário do Asaas para o Santander (24/11/2026, pedido do dono: "qualquer saldo
-- acima de R$ 100, transfere todos os dias, às 18h").
--
-- Quem grava a chave Pix de destino e liga é o dono, pela tela do Financeiro: o sistema
-- só manda para essa chave, e trocar a chave desliga o repasse até ele ligar de novo.
-- O Asaas confere cada saque no asaas-saque-validar, que só aprova o que esta rotina pediu.

create table if not exists public.repasse_config (
  id            int primary key default 1 check (id = 1),
  ligado        boolean not null default false,
  chave_pix     text,
  tipo_chave    text check (tipo_chave in ('CNPJ','CPF','EMAIL','PHONE','EVP')),
  reserva       numeric(12,2) not null default 100 check (reserva >= 0),
  token_validacao text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
insert into public.repasse_config (id) values (1) on conflict do nothing;

create table if not exists public.repasses (
  id          uuid primary key default gen_random_uuid(),
  dia         date not null unique,
  saldo       numeric(12,2),
  valor       numeric(12,2),
  chave_pix   text,
  asaas_id    text,
  status      text not null default 'pedindo',
  erro        text,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Trocar o destino desliga: nada vai para uma chave nova sem o dono ligar de novo.
create or replace function public.repasse_config_trava() returns trigger
language plpgsql as $$
begin
  if new.chave_pix is distinct from old.chave_pix or new.tipo_chave is distinct from old.tipo_chave then
    new.ligado := false;
  end if;
  if new.ligado and (coalesce(new.chave_pix, '') = '' or new.tipo_chave is null) then
    raise exception 'Grave a chave Pix antes de ligar.';
  end if;
  new.token_validacao := old.token_validacao;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists repasse_config_trava on public.repasse_config;
create trigger repasse_config_trava before update on public.repasse_config
  for each row execute function public.repasse_config_trava();

alter table public.repasse_config enable row level security;
alter table public.repasses enable row level security;

-- Só administrador vê e mexe. A rotina usa a chave de serviço.
drop policy if exists repasse_config_admin on public.repasse_config;
create policy repasse_config_admin on public.repasse_config for select
  using (exists (select 1 from public.team_members m where m.id = auth.uid() and m.role = 'admin' and m.is_active));
drop policy if exists repasse_config_admin_up on public.repasse_config;
create policy repasse_config_admin_up on public.repasse_config for update
  using (exists (select 1 from public.team_members m where m.id = auth.uid() and m.role = 'admin' and m.is_active))
  with check (exists (select 1 from public.team_members m where m.id = auth.uid() and m.role = 'admin' and m.is_active));
drop policy if exists repasses_admin on public.repasses;
create policy repasses_admin on public.repasses for select
  using (exists (select 1 from public.team_members m where m.id = auth.uid() and m.role = 'admin' and m.is_active));

-- Todo dia às 18h de Brasília (21h UTC).
select cron.unschedule('asaas-repasse') where exists (select 1 from cron.job where jobname = 'asaas-repasse');
select cron.schedule('asaas-repasse', '0 21 * * *', $$
  select net.http_post(
    url     := 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/asaas-repasse',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
