-- Login em pop-up (23/11/2026): a credencial passa cifrada e some assim que o robô lê.
alter table dominio_robo add column if not exists credencial text;
alter table dominio_robo add column if not exists etapa text;
alter table dominio_robo add column if not exists tentativas integer not null default 0;
alter table dominio_robo drop constraint if exists dominio_robo_estado_check;
alter table dominio_robo add constraint dominio_robo_estado_check
  check (estado in ('abrindo', 'credenciais', 'codigo', 'janela', 'login', 'trabalhando', 'feito', 'falhou', 'parado'));
