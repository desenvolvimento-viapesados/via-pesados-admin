-- Aplicada em produção em 2026-09-10.
--
-- Liga os avisos de cobrança ao número oficial e conserta dois defeitos que
-- impediam o webhook do Asaas de funcionar desde que foi escrito.

-- 1) Histórico de disparo, e a trava anti-duplicata que ele existe para ser.
--    O Asaas entrega "pelo menos uma vez": sem a unique, o mesmo
--    PAYMENT_CREATED manda a mesma cobrança duas vezes, que é justamente o
--    que derruba a qualidade de um número novo.
create table if not exists public.wa_envios (
  id uuid primary key default gen_random_uuid(),
  template text not null,
  chave text not null,
  client_id uuid references public.clients(id) on delete set null,
  destino text not null,
  message_id text,
  erro text,
  enviado_em timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists wa_envios_template_chave_key on public.wa_envios (template, chave);
create index if not exists wa_envios_client_idx on public.wa_envios (client_id, created_at desc);
alter table public.wa_envios enable row level security;
drop policy if exists wa_envios_equipe_le on public.wa_envios;
create policy wa_envios_equipe_le on public.wa_envios
  for select to authenticated
  using (exists (select 1 from public.team_members t where t.id = auth.uid() and t.is_active));
comment on table public.wa_envios is 'Um registro por template disparado. A unique (template, chave) é a trava anti-duplicata dos webhooks.';

-- 2) O índice único de asaas_payment_id era PARCIAL, e `on conflict
--    (asaas_payment_id)` não casa com índice que tem WHERE — o Postgres
--    recusava a instrução inteira. Efeito: nenhuma cobrança do Asaas jamais
--    entrou em `payments`, e o erro voltava como "Erro" porque o catch
--    tratava o objeto do PostgREST como Error.
--
--    Único simples resolve sem perder nada: NULLs continuam distintos entre
--    si, então cobrança lançada à mão segue podendo repetir.
drop index if exists public.payments_asaas_payment_idx;
create unique index if not exists payments_asaas_payment_idx on public.payments (asaas_payment_id);

-- 3) Lembrete de vencimento, 9h de Brasília. Sem header de autenticação, no
--    mesmo formato dos outros crons do grupo: o que protege esta rotina é a
--    forma dela — só alcança cobrança que vence amanhã E segue pendente, e a
--    unique acima garante um disparo por cobrança, para sempre.
select cron.schedule(
  'cobranca-lembrete',
  '0 12 * * *',
  $$
  select net.http_post(
    url     := 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/cobranca-lembrete',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
) where not exists (select 1 from cron.job where jobname = 'cobranca-lembrete');
