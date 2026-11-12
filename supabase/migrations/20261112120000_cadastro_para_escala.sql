-- Todo cadastro novo vai para a ferramenta de marketing da Escala SaaS, a agência contratada
-- pelo dono (pedido de 12/11/2026): lead do funil (botão "+ Prospect" ou card do assistente) e
-- cliente (Registrar venda, com ou sem teste grátis).
--
-- O gatilho só põe na fila; quem envia é a função cadastro-enviar, chamada pelo cron a cada
-- minuto, com nova tentativa se a agência estiver fora do ar. Assim:
--   * o cadastro nunca falha por causa da agência (o gatilho engole qualquer erro da fila);
--   * se o cadastro for desfeito, a linha da fila some junto (mesma transação);
--   * fica registrado o que foi enviado e o que a agência respondeu.
-- A URL da agência mora no segredo ESCALA_SAAS_WEBHOOK_URL das funções, não no banco.

create table if not exists public.cadastro_envios (
  id                   uuid primary key default gen_random_uuid(),
  destino              text not null default 'escala_saas',
  origem               text not null check (origem in ('lead', 'cliente')),
  registro_id          uuid not null,
  frente               text not null default 'lojista' check (frente in ('lojista', 'transportadora')),
  status               text not null default 'pendente' check (status in ('pendente', 'enviado', 'falhou', 'ignorado')),
  tentativas           smallint not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  travado_ate          timestamptz,
  payload              jsonb,
  http_status          int,
  resposta             text,
  erro                 text,
  enviado_em           timestamptz,
  criado_em            timestamptz not null default now(),
  -- Um envio por cadastro. Sem WHERE de propósito: on conflict não enxerga índice parcial.
  constraint cadastro_envios_um_por_cadastro unique (destino, origem, registro_id)
);

create index if not exists cadastro_envios_pendentes
  on public.cadastro_envios (proxima_tentativa_em) where status = 'pendente';

-- A equipe vê o histórico da sua frente; ninguém grava pelo navegador.
alter table public.cadastro_envios enable row level security;
revoke all on public.cadastro_envios from anon, authenticated;
grant select on public.cadastro_envios to authenticated;
drop policy if exists cadastro_envios_ler on public.cadastro_envios;
create policy cadastro_envios_ler on public.cadastro_envios for select to authenticated
  using (public.is_team_member() and (frente = public.frente_pedida() or public.frente_pedida() = 'empresa'));

create or replace function public.cadastro_para_escala() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.cadastro_envios (origem, registro_id, frente, proxima_tentativa_em)
    values (tg_argv[0], new.id, coalesce(new.frente, 'lojista'), now() + interval '2 minutes')
    on conflict on constraint cadastro_envios_um_por_cadastro do nothing;
  exception when others then
    raise warning 'cadastro_para_escala (%): %', tg_table_name, sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.cadastro_para_escala() from public, anon, authenticated;

drop trigger if exists cadastro_para_escala on public.prospects;
create trigger cadastro_para_escala after insert on public.prospects
  for each row execute function public.cadastro_para_escala('lead');

drop trigger if exists cadastro_para_escala on public.clients;
create trigger cadastro_para_escala after insert on public.clients
  for each row execute function public.cadastro_para_escala('cliente');

-- Lead do painel pode nascer sem WhatsApp ("pode ficar para a reunião"): a função segura o envio
-- até ter um meio de contato. Quando o número (ou o e-mail) chega, a vez dele é agora.
create or replace function public.cadastro_contato_chegou() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    update public.cadastro_envios
       set proxima_tentativa_em = now()
     where destino = 'escala_saas' and origem = 'lead' and registro_id = new.id
       and status = 'pendente' and proxima_tentativa_em > now();
  exception when others then
    raise warning 'cadastro_contato_chegou: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.cadastro_contato_chegou() from public, anon, authenticated;

drop trigger if exists cadastro_contato_chegou on public.prospects;
create trigger cadastro_contato_chegou after update of whatsapp, email on public.prospects
  for each row when (old.whatsapp is distinct from new.whatsapp or old.email is distinct from new.email)
  execute function public.cadastro_contato_chegou();

-- Esvazia a fila a cada minuto (sem nada pendente, a função só lê e volta).
select cron.unschedule('cadastro-enviar') where exists (select 1 from cron.job where jobname = 'cadastro-enviar');
select cron.schedule('cadastro-enviar', '* * * * *', $$
  select net.http_post(
    url     := 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/cadastro-enviar',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
