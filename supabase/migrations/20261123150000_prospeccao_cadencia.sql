-- Cadência da prospecção fria (playbook de 18/11/2026, ligada em 23/11/2026).
-- Os passos da cadência e a retomada são registrados como envios próprios.
alter table prospeccao_envios drop constraint if exists prospeccao_envios_tipo_check;
alter table prospeccao_envios add constraint prospeccao_envios_tipo_check
  check (tipo = any (array['contato', 'resposta', 'oferta', 'cta', 'cadencia', 'retomada']));

-- Quem só teve resposta do robô da loja volta para a cadência (o próximo passo já venceu).
update prospeccao_lojas
   set proximo_contato_em = now(), atualizada_em = now()
 where status = 'sem_resposta' and respondeu_em is null and proximo_contato_em is null
   and contatos >= 1 and motivo like 'Só a resposta automática%';
