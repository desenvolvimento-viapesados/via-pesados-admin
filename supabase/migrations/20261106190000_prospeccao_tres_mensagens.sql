-- A prospecção pelo número oficial passou a mandar três mensagens por loja (dono, 06/11/2026):
-- a abertura com o vídeo (tipo 'contato'), a oferta ('oferta') e o convite para a
-- qualificação curta ('cta'). Cada uma tem o próprio registro, para a falha de entrega achar a
-- loja; só 'contato' conta no teto do dia.
alter table public.prospeccao_envios drop constraint if exists prospeccao_envios_tipo_check;
alter table public.prospeccao_envios
  add constraint prospeccao_envios_tipo_check check (tipo in ('contato', 'resposta', 'oferta', 'cta'));
