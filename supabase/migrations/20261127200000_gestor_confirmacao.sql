-- Confirmação em duas etapas do gestor do dono (27/11/2026, auditoria de segurança autorizada pelo dono).
--
-- O gestor (IA no número oficial) lê conversas de lead. Para um lead não conseguir mandar a IA
-- cancelar reunião, pausar disparo ou escrever a outro lead ("o dono pediu para…"), toda ferramenta
-- que grava ou envia só grava aqui um pedido com os parâmetros daquele momento. Quem executa é o
-- código, quando uma mensagem SEGUINTE do dono confirma ("sim"), e com os parâmetros daqui.
-- O pedido vale 30 minutos (expira_em).
--
-- Só as funções (chave de serviço) mexem aqui: RLS ligada, sem policy, nada para anon/authenticated.

create table if not exists public.gestor_pedidos (
  id             uuid primary key default gen_random_uuid(),
  conversa_id    uuid not null references public.wa_conversas(id) on delete cascade,  -- a conversa do dono
  mensagem_id    text not null,                -- a mensagem do dono em que o pedido nasceu (nunca confirma)
  ferramenta     text not null,
  parametros     jsonb not null default '{}'::jsonb,
  resumo         text not null,                -- o que foi mostrado ao dono ("Vou … Confirma?")
  status         text not null default 'pendente'
                 check (status in ('pendente', 'executando', 'executado', 'falhou', 'descartado', 'expirado')),
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null default now() + interval '30 minutes',
  resolvido_em   timestamptz,
  confirmado_por text,                         -- a mensagem do dono que confirmou
  resultado      jsonb
);
create index if not exists gestor_pedidos_pendentes_idx
  on public.gestor_pedidos (conversa_id, criado_em) where status = 'pendente';

alter table public.gestor_pedidos enable row level security;
revoke all on table public.gestor_pedidos from public, anon, authenticated;
grant select, insert, update, delete on table public.gestor_pedidos to service_role;
