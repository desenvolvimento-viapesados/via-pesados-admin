-- Dono, 17/11/2026: "se só robô respondeu, ninguém respondeu". Sem status próprio: volta a ser
-- "sem resposta" (a resposta automática se reconhece no código, resposta-automatica.ts).
update prospeccao_lojas set status = 'sem_resposta', proximo_contato_em = null where status = 'automatica';
alter table prospeccao_lojas drop constraint if exists prospeccao_lojas_status_check;
alter table prospeccao_lojas add constraint prospeccao_lojas_status_check check (status = any (array[
  'nova','pronta','sem_whatsapp','ja_conhecida','em_contato','sem_resposta','conversando',
  'com_voce','sem_interesse','descartada']));
