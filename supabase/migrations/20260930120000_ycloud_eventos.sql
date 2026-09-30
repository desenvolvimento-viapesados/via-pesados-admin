-- Entrega de eventos da YCloud: a origem nova e o lugar do segredo.
--
-- Com BSP, quem entrega evento é a YCloud, não a Meta — e ela assina cada
-- requisição com um segredo que só existe UMA vez, na resposta da criação
-- do endpoint. Guardá-lo é o que permite `wa-receber` distinguir um evento
-- verdadeiro de um POST qualquer na URL pública.

-- O número oficial passou a viver na YCloud; o CHECK antigo só conhecia os
-- dois caminhos anteriores e barrava a instância nova.
alter table public.wa_instancias drop constraint if exists wa_instancias_origem_check;
alter table public.wa_instancias add constraint wa_instancias_origem_check
  check (origem = any (array['evolution'::text, 'cloud_api'::text, 'ycloud'::text]));

create table if not exists public.wa_webhook (
  id uuid primary key default gen_random_uuid(),
  provedor text not null unique,
  endpoint_id text,
  url text not null,
  segredo text not null,
  eventos text[] not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.wa_webhook is
  'Endpoint de eventos por provedor. O segredo assina cada entrega e nunca sai por PostgREST.';

-- Sem policy nenhuma: com RLS ligada e os grants revogados, só o
-- service_role (que a ignora) enxerga o segredo. Ninguém logado no painel
-- consegue lê-lo pelo navegador.
alter table public.wa_webhook enable row level security;
revoke all on public.wa_webhook from anon, authenticated;

-- A caixa do número oficial. Sem ela, mensagem que chega não tem onde cair.
insert into public.wa_instancias (nome, telefone, origem, is_active, connection_state, connected_at)
select 'Via Pesados · Oficial (YCloud)', '553388168369', 'ycloud', true, 'open', now()
where not exists (select 1 from public.wa_instancias where telefone = '553388168369');
