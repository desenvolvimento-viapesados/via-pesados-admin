-- Prospecção pelo número oficial (03/11/2026): a fila recebe as lojas da lista
-- do portal Caminhões e Carretas, montada em 29/10 (~/Documents/Prospecção).
alter table public.prospeccao_lojas drop constraint prospeccao_lojas_fonte_check;
alter table public.prospeccao_lojas add constraint prospeccao_lojas_fonte_check
  check (fonte = any (array['google_maps'::text, 'manual'::text, 'portal'::text]));
