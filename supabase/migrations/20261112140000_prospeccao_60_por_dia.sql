-- Dono, 12/11/2026, logo depois dos 120: "vamos fazer pelo menos uns 60 por dia" (o saldo da YCloud
-- recarregado em 11/11 foi de US$ 20). 60 por dia útil, um envio a cada 7 a 15 minutos, espalhados
-- das 08h às 20h. A rotina continua de minuto em minuto e a tela continua aceitando até 200.
update public.prospeccao_config set limite_dia = 60, intervalo_min = 7, intervalo_max = 15, atualizado_em = now() where id = 1;

-- Com 60 por dia o Davi volta ao teto de gasto que o dono tinha definido.
update public.assistente_config set teto_usd_dia = 10 where id = 1;
