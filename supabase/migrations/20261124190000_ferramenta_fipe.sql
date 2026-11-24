-- Ferramenta FIPE grátis (dono, 24/11/2026): isca da campanha "comenta FIPE".
-- Quem libera a ferramenta (nome da loja + WhatsApp) vira lead no CRM, canal "Ferramenta FIPE".

insert into public.acquisition_channels (name, slug, color, sort)
values ('Ferramenta FIPE', 'ferramenta-fipe', '#E06100', 10)
on conflict do nothing;

-- Quem liberou a ferramenta. O id é o passe que a página guarda para as próximas consultas.
create table if not exists public.fipe_acessos (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects(id) on delete set null,
  loja text not null,
  whatsapp text not null,
  consultas_estoque int not null default 0,
  consultas_modelo int not null default 0,
  ultimo_site text,
  criado_em timestamptz not null default now(),
  usado_em timestamptz not null default now()
);
alter table public.fipe_acessos enable row level security;

-- O que já veio da FIPE oficial (marcas, modelos, anos, valores por mês de referência). A FIPE de um mês não muda.
create table if not exists public.fipe_cache (
  chave text primary key,
  valor jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.fipe_cache enable row level security;
