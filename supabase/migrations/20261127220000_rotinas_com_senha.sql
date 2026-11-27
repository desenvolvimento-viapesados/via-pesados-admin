-- Auditoria de segurança de 27/11/2026: as rotinas agendadas chamavam as funções sem
-- nenhuma prova, e as funções aceitavam qualquer um. Agora cada rotina manda o cabeçalho
-- x-cron com a senha guardada no cofre (vault, nome 'cron_secret'), e a função confere
-- contra CRON_SECRET (_shared/acesso.ts). A senha nunca fica no repositório.
--
-- Pré-requisito (feito à parte, fora do repositório):
--   select vault.create_secret('<senha>', 'cron_secret', '...');
--   supabase secrets set CRON_SECRET=<a mesma senha>

create or replace function public.chamar_rotina(funcao text, corpo jsonb default '{}'::jsonb)
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url := 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/' || funcao,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := corpo,
    timeout_milliseconds := 55000
  );
$$;

revoke all on function public.chamar_rotina(text, jsonb) from public, anon, authenticated;

do $$
declare
  j record;
begin
  for j in
    select * from (values
      ('cobranca-lembrete',    'cobranca-lembrete',    '{}'),
      ('reuniao-lembretes',    'reuniao-avisos',       '{"acao":"lembretes"}'),
      ('wa-fila',              'wa-fila',              '{}'),
      ('teste-gratis',         'teste-gratis',         '{}'),
      ('assistente-pendentes', 'assistente-pendentes', '{}'),
      ('cadastro-enviar',      'cadastro-enviar',      '{}'),
      ('prospeccao-enviar',    'prospeccao-enviar',    '{}'),
      ('asaas-repasse',        'asaas-repasse',        '{}')
    ) as t(rotina, funcao, corpo)
  loop
    perform cron.alter_job(
      job_id := (select jobid from cron.job where jobname = j.rotina),
      command := format('select public.chamar_rotina(%L, %L::jsonb);', j.funcao, j.corpo)
    )
    where exists (select 1 from cron.job where jobname = j.rotina);
  end loop;
end $$;
