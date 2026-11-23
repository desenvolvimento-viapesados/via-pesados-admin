-- O robô da conexão de domínio (23/11/2026): uma linha por tentativa, que a página
-- pública lê para mostrar a janela ao vivo e o que o robô está fazendo.
create table if not exists dominio_robo (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  dominio text not null,
  provedor text,
  estado text not null default 'abrindo' check (estado in ('abrindo', 'login', 'trabalhando', 'feito', 'falhou', 'parado')),
  mensagem text,
  live_url text,
  sessao text,
  cliente_pronto boolean not null default false,
  parar boolean not null default false,
  passos jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists dominio_robo_cliente on dominio_robo (client_id, criado_em desc);
-- Só as funções (chave de serviço) leem e gravam: a página passa pelo token do link.
alter table dominio_robo enable row level security;
