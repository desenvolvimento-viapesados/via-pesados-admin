-- O WhatsApp que recebe o aviso de reunião marcada pelo Davi (dono, 09/11/2026).
-- Vazio = sem aviso. O envio é pelo modelo aviso_reuniao_marcada, no número oficial.
alter table public.assistente_config add column if not exists aviso_whatsapp text;
update public.assistente_config set aviso_whatsapp = '5533988144005' where id = 1 and aviso_whatsapp is null;
