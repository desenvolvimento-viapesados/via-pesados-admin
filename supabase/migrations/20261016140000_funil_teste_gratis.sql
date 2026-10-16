-- Funil: Contato → Envio de Amostra → Oportunidade → Reunião → Teste grátis → Fechado.
--
-- 'teste' é a etapa nova (decisão do dono, 16/10/2026): arrastar a loja para
-- lá abre o cadastro do teste, e ela vai para a implantação de teste. Quando
-- assina, a rotina do teste (converterTeste) a leva para 'vendido' (Fechado).
-- Antes o teste registrado caía direto em Fechado, como venda.
alter table public.prospects drop constraint if exists prospects_stage_check;
alter table public.prospects add constraint prospects_stage_check
  check (stage = any (array['contato','amostra','oportunidade','reuniao','teste','vendido','perdido']));
