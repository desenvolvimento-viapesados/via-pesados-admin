-- Aplicada em produção em 2026-09-10.
--
-- Dois buracos que faziam a régua de avisos não sair do lugar:
--
-- 1) O webhook do Asaas NUNCA EXISTIU. Todo o código estava correto, mas o
--    Asaas não tinha para onde chamar — falha silenciosa clássica. Criado
--    pela função asaas-webhook-setup, com os 10 eventos que o webhook sabe
--    tratar e com authToken (o ASAAS_WEBHOOK_TOKEN), que o endpoint agora
--    exige. Sem o token, o endpoint aceitava qualquer POST — inclusive um
--    PAYMENT_RECEIVED forjado marcando cobrança como paga.
--
-- 2) reuniao_confirmada e reuniao_lembrete estavam aprovados mas órfãos.
--    A confirmação sai do próprio diálogo de agendamento; o lembrete é este
--    cron, de 15 em 15 minutos, pegando o que começa daqui a ~2h.
--
-- Por que 15 em 15 e não de hora em hora: a janela de disparo é 1h45–2h15
-- antes da reunião, e um cron horário deixaria buraco. A unique de
-- wa_envios garante um lembrete por reunião, para sempre.
select cron.schedule(
  'reuniao-lembretes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/reuniao-avisos',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"acao":"lembretes"}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
) where not exists (select 1 from cron.job where jobname = 'reuniao-lembretes');
