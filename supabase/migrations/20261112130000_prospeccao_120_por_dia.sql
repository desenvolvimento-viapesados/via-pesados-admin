-- Mais disparos (dono, 12/11/2026: "está muito lento, a gente está mandando pouco, a gente precisa
-- abordar muitos clientes"). 120 lojas por dia útil, das 08h às 20h, para a fila inteira do portal
-- (cerca de 1.200 lojas) receber antes do fim da oferta do vídeo, 30/11.
--
-- O número oficial está no limite de 250 conversas iniciadas por dia na Meta: o teto da tela vai
-- até 200, e o resto fica para cobrança, senha e avisos. As travas continuam: qualidade amarela,
-- 3 erros seguidos, falta de saldo, modelo não aprovado e oferta vencida desligam.

alter table public.prospeccao_config drop constraint if exists prospeccao_config_limite_dia_check;
alter table public.prospeccao_config add constraint prospeccao_config_limite_dia_check check (limite_dia between 1 and 200);

-- Um envio a cada 3 a 7 minutos (cerca de 130 possíveis em 12 horas).
update public.prospeccao_config set limite_dia = 120, intervalo_min = 3, intervalo_max = 7, atualizado_em = now() where id = 1;

-- Com mais respostas por dia, o teto de gasto da IA do Davi sobe de US$ 10 para US$ 20.
update public.assistente_config set teto_usd_dia = 20 where id = 1 and teto_usd_dia < 20;

-- A rotina olha de minuto em minuto (cada chamada continua mandando no máximo uma loja).
select cron.unschedule('prospeccao-enviar') where exists (select 1 from cron.job where jobname = 'prospeccao-enviar');
select cron.schedule('prospeccao-enviar', '* * * * *', $$
  select net.http_post(
    url     := 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/prospeccao-enviar',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
