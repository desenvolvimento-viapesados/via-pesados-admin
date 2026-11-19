-- Ligações frias do dono (18/11/2026).
--
-- Pedido: "enquanto não estou em reunião, tenho que fazer um número X de ligações frias por dia;
-- me entregue os números que preciso ligar naquele dia (15 a 20 lojas); eu marco a resposta deles
-- para ir fazendo funil, relatório e métricas". A lista do dia é MISTA (escolha dele):
--   1. retornos combinados para hoje;
--   2. lojas que receberam a mensagem, LERAM e não responderam (mornas);
--   3. lojas que receberam e ainda não leram;
--   4. lojas novas da fila (ligação primeiro, vídeo depois), MG na frente.
-- Quem está conversando com o Davi, com você, sem interesse ou fora da fila não entra.

create table if not exists public.prospeccao_ligacoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.prospeccao_lojas(id) on delete cascade,
  feita_em timestamptz not null default now(),
  feita_por uuid references public.team_members(id) on delete set null,
  resultado text not null check (resultado in (
    'nao_atendeu',    -- chamou e ninguém atendeu (ou caixa postal)
    'numero_errado',  -- não é da loja, não existe
    'reuniao',        -- marcou a demonstração
    'retornar',       -- pediu para ligar outro dia / outra hora
    'mandar_video',   -- atendeu, quer ver o vídeo primeiro pelo WhatsApp
    'sem_interesse'   -- disse que não quer
  )),
  quem_atendeu text check (quem_atendeu is null or quem_atendeu in ('dono', 'socio', 'gerente', 'vendedor', 'outro')),
  -- A dor que ele disse, numa das promessas do sistema, e a frase dele.
  dor text check (dor is null or dor in ('anunciar', 'atendimento', 'clientes', 'relatorios', 'outra')),
  dor_frase text,
  estoque integer check (estoque is null or estoque between 0 and 100000),
  decisor text,
  retornar_em timestamptz,
  reuniao_id uuid references public.meetings(id) on delete set null,
  motivo text,
  notas text
);
create index if not exists prospeccao_ligacoes_dia_idx on public.prospeccao_ligacoes (feita_em);
create index if not exists prospeccao_ligacoes_loja_idx on public.prospeccao_ligacoes (loja_id, feita_em);

alter table public.prospeccao_ligacoes enable row level security;
drop policy if exists prospeccao_ligacoes_equipe on public.prospeccao_ligacoes;
create policy prospeccao_ligacoes_equipe on public.prospeccao_ligacoes
  for all using (public.is_team_member()) with check (public.is_team_member());

alter table public.prospeccao_lojas
  add column if not exists ligacoes smallint not null default 0,
  add column if not exists ultima_ligacao_em timestamptz,
  add column if not exists proxima_ligacao_em timestamptz,
  add column if not exists dor text,
  add column if not exists dor_frase text,
  add column if not exists quem_atende text,
  add column if not exists reuniao_id uuid references public.meetings(id) on delete set null,
  -- "Mandar o vídeo": o envio pega esta loja antes das outras da fila.
  add column if not exists enviar_logo boolean not null default false;

alter table public.prospeccao_config
  add column if not exists meta_ligacoes_dia smallint not null default 20 check (meta_ligacoes_dia between 1 and 60);

-- A lista do dia. Devolve primeiro as lojas já ligadas hoje (para a tela mostrar o feito) e
-- depois as que faltam, até a meta, na ordem de prioridade.
create or replace function public.ligacoes_do_dia(_meta integer default null)
returns table (
  loja_id uuid, nome text, cidade text, uf text, telefone text, status text, dados jsonb,
  ligacoes smallint, ultima_ligacao_em timestamptz, proxima_ligacao_em timestamptz,
  dor text, dor_frase text, quem_atende text, conversa_id uuid,
  prioridade smallint, motivo_da_vez text, ligada_hoje boolean, resultado_hoje text
)
language sql stable security invoker set search_path = public
as $$
  with hoje as (
    select date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as ini
  ),
  meta as (
    select coalesce(_meta, (select meta_ligacoes_dia from prospeccao_config where id = 1), 20) as n
  ),
  feitas as (
    select distinct on (lg.loja_id) lg.loja_id, lg.resultado
    from prospeccao_ligacoes lg, hoje
    where lg.feita_em >= hoje.ini
    order by lg.loja_id, lg.feita_em desc
  ),
  leu as (
    select l.id as loja_id
    from prospeccao_lojas l
    where l.conversa_id is not null
      and exists (select 1 from wa_mensagens m
                  where m.conversa_id = l.conversa_id and m.direcao = 'saida' and m.status = 'lida')
  ),
  candidatas as (
    select l.*,
      case
        when l.proxima_ligacao_em is not null and l.proxima_ligacao_em < (select ini from hoje) + interval '1 day' then 1
        when l.status in ('em_contato', 'sem_resposta') and l.id in (select loja_id from leu) then 2
        when l.status in ('em_contato', 'sem_resposta') then 3
        else 4
      end::smallint as prioridade
    from prospeccao_lojas l
    where public.is_team_member()
      and l.id not in (select loja_id from feitas)
      and l.status in ('pronta', 'sem_whatsapp', 'em_contato', 'sem_resposta')
      and l.ligacoes < 3
      and not exists (select 1 from prospeccao_ligacoes x
                      where x.loja_id = l.id and x.resultado in ('numero_errado', 'sem_interesse', 'reuniao'))
      -- quem pediu retorno só volta na data; quem já foi ligado espera 2 dias
      and (l.proxima_ligacao_em is null or l.proxima_ligacao_em < (select ini from hoje) + interval '1 day')
      and (l.ultima_ligacao_em is null or l.ultima_ligacao_em < (select ini from hoje) - interval '1 day'
           or l.proxima_ligacao_em is not null)
  ),
  da_vez as (
    select c.* from candidatas c
    order by c.prioridade, (c.uf = 'MG') desc, c.proxima_ligacao_em nulls last, c.ultimo_contato_em nulls last, c.nome
    limit greatest((select n from meta) - (select count(*) from feitas), 0)
  )
  select l.id, l.nome, l.cidade, l.uf, l.telefone, l.status, l.dados, l.ligacoes, l.ultima_ligacao_em,
         l.proxima_ligacao_em, l.dor, l.dor_frase, l.quem_atende, l.conversa_id,
         0::smallint, null::text, true, f.resultado
  from feitas f join prospeccao_lojas l on l.id = f.loja_id
  where public.is_team_member()
  union all
  select d.id, d.nome, d.cidade, d.uf, d.telefone, d.status, d.dados, d.ligacoes, d.ultima_ligacao_em,
         d.proxima_ligacao_em, d.dor, d.dor_frase, d.quem_atende, d.conversa_id,
         d.prioridade,
         case d.prioridade
           when 1 then 'Retorno combinado para hoje'
           when 2 then 'Leu a mensagem e não respondeu'
           when 3 then 'Recebeu a mensagem, ainda não leu'
           else 'Loja nova: ligue antes do vídeo'
         end,
         false, null::text
  from da_vez d;
$$;
grant execute on function public.ligacoes_do_dia(integer) to authenticated;

-- Registrar o que aconteceu na ligação. Tudo numa transação: a ligação, a loja e, se marcou,
-- a reunião na Agenda (mesma tabela que o Davi usa; o funil acha pela loja).
create or replace function public.registrar_ligacao(
  _loja_id uuid,
  _resultado text,
  _quem_atendeu text default null,
  _dor text default null,
  _dor_frase text default null,
  _estoque integer default null,
  _decisor text default null,
  _retornar_em timestamptz default null,
  _reuniao_em timestamptz default null,
  _motivo text default null,
  _notas text default null
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_loja prospeccao_lojas%rowtype;
  v_reuniao uuid;
  v_link text;
  v_id uuid;
begin
  if not public.is_team_member() then raise exception 'Só a equipe registra ligações.'; end if;
  select * into v_loja from prospeccao_lojas where id = _loja_id for update;
  if not found then raise exception 'Loja não encontrada.'; end if;
  if _resultado = 'reuniao' and _reuniao_em is null then raise exception 'Diga o dia e a hora da reunião.'; end if;
  if _resultado = 'retornar' and _retornar_em is null then raise exception 'Diga quando ligar de novo.'; end if;

  if _resultado = 'reuniao' then
    select link_reuniao into v_link from assistente_config limit 1;
    insert into meetings (title, scheduled_at, duration_min, kind, status, meet_link, notes, owner_id)
    values ('Demonstração · ' || v_loja.nome, _reuniao_em, 15, 'demo', 'agendada', v_link,
            concat_ws(E'\n',
              'Marcada por ligação.',
              case when _quem_atendeu is not null then 'Quem atendeu: ' || _quem_atendeu end,
              case when _decisor is not null then 'Quem decide: ' || _decisor end,
              case when _estoque is not null then 'Estoque: ' || _estoque end,
              case when _dor is not null then 'Dor: ' || _dor || coalesce(' — "' || _dor_frase || '"', '') end,
              _notas),
            auth.uid())
    returning id into v_reuniao;
  end if;

  insert into prospeccao_ligacoes (loja_id, feita_por, resultado, quem_atendeu, dor, dor_frase, estoque,
                                   decisor, retornar_em, reuniao_id, motivo, notas)
  values (_loja_id, auth.uid(), _resultado, _quem_atendeu, _dor, nullif(trim(_dor_frase), ''), _estoque,
          nullif(trim(_decisor), ''), _retornar_em, v_reuniao, nullif(trim(_motivo), ''), nullif(trim(_notas), ''))
  returning id into v_id;

  update prospeccao_lojas set
    ligacoes = least(ligacoes + 1, 32000),
    ultima_ligacao_em = now(),
    proxima_ligacao_em = case when _resultado = 'retornar' then _retornar_em else null end,
    dor = coalesce(_dor, dor),
    dor_frase = coalesce(nullif(trim(_dor_frase), ''), dor_frase),
    quem_atende = coalesce(_quem_atendeu, quem_atende),
    reuniao_id = coalesce(v_reuniao, reuniao_id),
    enviar_logo = case when _resultado = 'mandar_video' and status in ('nova', 'pronta') then true else enviar_logo end,
    status = case
      when _resultado = 'reuniao' then 'com_voce'
      when _resultado = 'sem_interesse' then 'sem_interesse'
      when _resultado = 'numero_errado' and status in ('pronta', 'sem_whatsapp', 'nova') then 'descartada'
      else status
    end,
    motivo = case
      when _resultado = 'reuniao' then 'Reunião marcada na ligação.'
      when _resultado = 'sem_interesse' then coalesce('Ligação: ' || nullif(trim(_motivo), ''), 'Ligação: sem interesse.')
      when _resultado = 'numero_errado' then 'Ligação: número errado.'
      else motivo
    end,
    atualizada_em = now()
  where id = _loja_id;

  return v_id;
end;
$$;
grant execute on function public.registrar_ligacao(uuid, text, text, text, text, integer, text, timestamptz, timestamptz, text, text) to authenticated;
