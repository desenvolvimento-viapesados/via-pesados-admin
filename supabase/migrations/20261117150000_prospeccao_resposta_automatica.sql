-- Resposta automática da loja (dono, 17/11/2026): a loja em que só o robô (saudação do
-- WhatsApp Business, menu, pré-atendimento) respondeu não conta como "respondeu".
alter table prospeccao_lojas drop constraint if exists prospeccao_lojas_status_check;
alter table prospeccao_lojas add constraint prospeccao_lojas_status_check check (status = any (array[
  'nova','pronta','sem_whatsapp','ja_conhecida','em_contato','sem_resposta','conversando','automatica',
  'com_voce','sem_interesse','descartada']));
