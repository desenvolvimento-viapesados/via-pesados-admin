-- Funil de prospecção: Contato → Envio de Amostra → Oportunidade → Reunião → Fechado.
--
-- 'amostra' é a etapa nova. "Fechado" é só o rótulo novo de 'vendido': a chave
-- fica, porque metas, relatórios e o histórico de eventos contam por ela.
alter table public.prospects drop constraint if exists prospects_stage_check;
alter table public.prospects add constraint prospects_stage_check
  check (stage = any (array['contato','amostra','oportunidade','reuniao','vendido','perdido']));

-- Quem foi para Oportunidade só porque a amostra foi criada (era o que a tela
-- de amostras fazia) volta para a etapa certa: Envio de Amostra.
update public.prospects p set stage = 'amostra'
where p.stage = 'oportunidade'
  and exists (select 1 from public.demos d where d.prospect_id = p.id and d.status <> 'descartada');
