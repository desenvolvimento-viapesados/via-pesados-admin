-- Limite das portas públicas (27/11/2026, auditoria de segurança autorizada pelo dono).
--
-- A ferramenta FIPE e o formulário do site não têm login. Para ninguém esvaziar a conta da IA
-- nem entupir o CRM, cada porta conta quantas vezes uma chave (IP, WhatsApp, card) bateu numa
-- janela (a hora ou o dia em Brasília) e para de atender quando passa do teto.
--
-- Só as funções (chave de serviço) mexem aqui: RLS ligada, sem policy, nada para anon/authenticated.

create table if not exists public.limite_publico (
  chave  text not null,
  janela timestamptz not null,
  total  int not null default 0,
  primary key (chave, janela)
);
create index if not exists limite_publico_janela_idx on public.limite_publico (janela);

alter table public.limite_publico enable row level security;
revoke all on table public.limite_publico from public, anon, authenticated;
grant select, insert, update, delete on table public.limite_publico to service_role;

-- Soma 1 na chave dentro da janela e devolve o total já somado, numa conta só (sem corrida).
-- De vez em quando (1 em 100 chamadas) apaga as janelas de mais de 3 dias.
create or replace function public.limite_publico_contar(p_chave text, p_janela timestamptz)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total int;
begin
  insert into public.limite_publico as l (chave, janela, total)
  values (left(p_chave, 200), p_janela, 1)
  on conflict (chave, janela) do update set total = l.total + 1
  returning l.total into v_total;

  if random() < 0.01 then
    delete from public.limite_publico where janela < now() - interval '3 days';
  end if;

  return v_total;
end;
$$;

revoke all on function public.limite_publico_contar(text, timestamptz) from public, anon, authenticated;
grant execute on function public.limite_publico_contar(text, timestamptz) to service_role;
