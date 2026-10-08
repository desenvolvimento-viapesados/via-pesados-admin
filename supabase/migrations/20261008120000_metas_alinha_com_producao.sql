/* As Metas no banco já estavam assim em produção; o arquivo de 2026-10-01
   (20261001140000_metas_okr) não acompanhou e descrevia um esquema que o
   código não usa. Esta migration só deixa o repositório igual ao banco:
   - metas_ciclos aceita o tipo 'livre' (período livre);
   - metas_kr pode viver solto num ciclo (ciclo_id) ou como desdobramento
     de outro (pai_id), sem objetivo obrigatório.
   Tudo idempotente: rodar no banco atual não muda nada. */

alter table public.metas_ciclos drop constraint if exists metas_ciclos_tipo_check;
alter table public.metas_ciclos add constraint metas_ciclos_tipo_check
  check (tipo = any (array['mes', 'trimestre', 'ano', 'cinco_anos', 'livre']));

alter table public.metas_kr alter column objetivo_id drop not null;
alter table public.metas_kr add column if not exists ciclo_id uuid references public.metas_ciclos(id) on delete cascade;
alter table public.metas_kr add column if not exists pai_id uuid references public.metas_kr(id) on delete set null;
