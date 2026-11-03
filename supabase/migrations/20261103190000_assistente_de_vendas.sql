-- Assistente de vendas da Via Pesados (decisões do dono, 03/11/2026).
--
-- Um assistente virtual do Xavier atende pelo WhatsApp quem responde, explora a dor e
-- conduz até 15 minutos de videochamada com o Xavier. "Se está na lista, está no
-- atendimento": não há porta de "quem fala". Na hora de marcar ele pergunta se quem
-- decide vem junto; a resposta vai para o dossiê.
--
-- O que mora aqui:
--   assistente_config     a linha única do painel (ligado, agenda, link fixo da reunião,
--                          teto de gasto, em que modo entra quem responde à prospecção)
--   assistente_conversas  o estado do assistente em cada conversa (modo, etapa, memória,
--                          dores com citação, decisor, reunião, dossiê, custo)
--   assistente_turnos     cada vez que ele pensou: o que escreveu, o que quis fazer,
--                          quanto custou, o que o fiscal achou, quem aprovou
--   assistente_fatos      o que ele pode afirmar (só fato verdadeiro; sem preço e sem prazo)
--   wa_mensagens          + transcricao (áudio), media_salva (arquivo guardado), turno_id
--   prospect_events       + ator: 'assistente' quando foi ele que moveu o card
--
-- As regras (fiscal, horários livres, etapa, custo, janela) moram em
-- supabase/functions/_shared/assistente-regras.ts; os testes em src/lib/assistente.test.ts.
--
-- Quem calcula a etapa é o código. A IA só registra o que ouviu.
-- Config é da empresa (sem frente), como prospeccao_config. Estado e turnos são dado de
-- cliente: têm frente, herdada da conversa, e as policies seguem a migration das frentes.
-- Tudo idempotente: pode rodar duas vezes.

-- ── A configuração ────────────────────────────────────────────────────────
create table if not exists public.assistente_config (
  id smallint primary key default 1 check (id = 1),
  -- O botão geral de parar. Desligado até alguém da equipe ligar; o código só desliga.
  ligado boolean not null default false,
  modelo text not null default 'claude-opus-5-5',
  -- Gasto máximo com a IA por dia (dia de São Paulo). Bateu, o assistente se desliga.
  teto_usd_dia numeric(8,2) not null default 10 check (teto_usd_dia >= 0),
  -- O link fixo da videochamada (Google Meet do Xavier). Sem ele o assistente não marca.
  link_reuniao text check (link_reuniao is null or link_reuniao ~ '^https://[^[:space:]]+$'),
  -- Dias da semana com reunião: 1 = segunda … 7 = domingo (isodow).
  dias_semana smallint[] not null default '{1,2,3,4,5}'
    check (cardinality(dias_semana) between 1 and 7 and dias_semana <@ '{1,2,3,4,5,6,7}'::smallint[]),
  hora_inicio time not null default '09:00',
  hora_fim time not null default '18:00',
  duracao_min smallint not null default 15 check (duracao_min between 5 and 120),
  -- Nunca marca para daqui a menos de N horas.
  folga_min_horas smallint not null default 2 check (folga_min_horas between 0 and 72),
  max_reunioes_dia smallint not null default 6 check (max_reunioes_dia between 1 and 30),
  -- Em que modo entra quem responde à prospecção (substitui prospeccao_config.agente_responde).
  modo_prospeccao text not null default 'sugere' check (modo_prospeccao in ('desligado', 'sugere', 'sozinho')),
  -- Dono das reuniões que o assistente marca (owner do card e da reunião).
  responsavel_id uuid references public.team_members(id) on delete set null,
  -- Por que parou (teto de gasto, erro). Some quando alguém liga de novo.
  pausado_motivo text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.team_members(id) on delete set null,
  constraint assistente_config_horario_valido check (hora_fim > hora_inicio)
);

-- O responsável começa no Xavier quando só um membro ativo tem esse nome; senão fica
-- vazio e a tela pede.
insert into public.assistente_config (id, responsavel_id)
select 1, (select (array_agg(id))[1] from public.team_members
           where is_active and full_name ilike '%xavier%' having count(*) = 1)
on conflict (id) do nothing;

-- ── O estado em cada conversa ─────────────────────────────────────────────
create table if not exists public.assistente_conversas (
  conversa_id uuid primary key references public.wa_conversas(id) on delete cascade,
  modo text not null default 'desligado' check (modo in ('desligado', 'sugere', 'sozinho')),
  etapa text not null default 'conversa' check (etapa in (
    'conversa',     -- atendendo, ainda sem dor registrada
    'dor',          -- a dor dele, nas palavras dele, está gravada
    'prova',        -- mostrou o sistema ligado à dor
    'compromisso',  -- ofereceu horário
    'agendado',     -- reunião gravada
    'entregue',     -- o Xavier recebeu o dossiê
    'pausa',        -- o lead deu uma data
    'frio',         -- sumiu
    'perdido',      -- disse que não quer (com motivo)
    'saiu',         -- pediu para sair: nunca mais escreve
    'com_xavier'    -- chamou o Xavier: não responde até ele devolver
  )),
  -- Resumo do que importa, até 1500 caracteres.
  memoria text check (memoria is null or char_length(memoria) <= 1500),
  -- [{texto, citacao, mensagem_id}] — citação conferida contra a conversa.
  dores jsonb not null default '[]'::jsonb check (jsonb_typeof(dores) = 'array'),
  -- [{texto, citacao, mensagem_id, resposta}]
  objecoes jsonb not null default '[]'::jsonb check (jsonb_typeof(objecoes) = 'array'),
  -- {estoque, canais, sistema_atual, cidade, segmento, quem_fala}
  situacao jsonb not null default '{}'::jsonb check (jsonb_typeof(situacao) = 'object'),
  -- Quem bate o martelo vem à reunião? Não bloqueia a marcação; vai para o dossiê.
  decisor_vem text check (decisor_vem in ('sim', 'nao', 'nao_sei')),
  decisor_citacao text,
  quem_vem text,
  pedidos_preco smallint not null default 0 check (pedidos_preco >= 0),
  -- Mostrou o sistema (fato registrado pela IA).
  prova_enviada boolean not null default false,
  -- Horários já oferecidos ao lead (ISO 8601). Com algum, a etapa é 'compromisso'.
  horarios_oferecidos jsonb not null default '[]'::jsonb check (jsonb_typeof(horarios_oferecidos) = 'array'),
  reuniao_id uuid references public.meetings(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  -- A loja da fila de prospecção, quando a conversa nasceu dela.
  loja_id uuid references public.prospeccao_lojas(id) on delete set null,
  dossie jsonb,
  -- Já disse que é o assistente virtual do Xavier nesta conversa.
  apresentou boolean not null default false,
  -- Agrupamento: cada mensagem nova troca o token; a rodada com token velho desiste.
  token text,
  -- Desde quando há mensagem do lead sem resposta (null = nada pendente).
  pendente_desde timestamptz,
  ultimo_turno_em timestamptz,
  mensagens_enviadas integer not null default 0 check (mensagens_enviadas >= 0),
  custo_usd numeric(12,6) not null default 0,
  -- 'voce_assumiu', 'janela_fechada', 'audio_sem_transcricao', 'teto_de_mensagens'…
  pausado_motivo text,
  frente text not null default public.frente_para_gravar()
    constraint assistente_conversas_frente_valida check (frente in ('lojista', 'transportadora')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists assistente_conversas_pendentes_idx on public.assistente_conversas (pendente_desde)
  where pendente_desde is not null;
create index if not exists assistente_conversas_etapa_idx on public.assistente_conversas (etapa, atualizado_em desc);
create index if not exists assistente_conversas_prospect_idx on public.assistente_conversas (prospect_id);
create index if not exists assistente_conversas_loja_idx on public.assistente_conversas (loja_id);

-- ── Cada vez que ele pensou ───────────────────────────────────────────────
create table if not exists public.assistente_turnos (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.assistente_conversas(conversa_id) on delete cascade,
  criado_em timestamptz not null default now(),
  -- As mensagens do lead que este turno respondeu (wa_mensagens.id).
  entrada_ids uuid[] not null default '{}',
  -- O que a IA escreveu (string[]).
  mensagens jsonb not null default '[]'::jsonb check (jsonb_typeof(mensagens) = 'array'),
  -- O que de fato saiu, depois de editado e aprovado (string[]). Null = nada saiu.
  mensagens_finais jsonb check (mensagens_finais is null or jsonb_typeof(mensagens_finais) = 'array'),
  -- Ações com efeito: [{tipo, args, estado: 'executada'|'pendente'|'recusada'|'descartada', resultado?}]
  acoes jsonb not null default '[]'::jsonb check (jsonb_typeof(acoes) = 'array'),
  -- O registro de cada chamada de ferramenta: [{nome, entrada, saida}]
  ferramentas jsonb not null default '[]'::jsonb check (jsonb_typeof(ferramentas) = 'array'),
  modelo text,
  usage jsonb,
  custo_usd numeric(12,6) not null default 0,
  -- {ok, violacoes[], tentativas}
  fiscal jsonb,
  status text not null check (status in ('enviado', 'rascunho', 'aprovado', 'descartado', 'barrado', 'erro')),
  erro text,
  decidido_por uuid references public.team_members(id) on delete set null,
  decidido_em timestamptz,
  frente text not null default public.frente_para_gravar()
    constraint assistente_turnos_frente_valida check (frente in ('lojista', 'transportadora'))
);

create index if not exists assistente_turnos_conversa_idx on public.assistente_turnos (conversa_id, criado_em desc);
create index if not exists assistente_turnos_dia_idx on public.assistente_turnos (criado_em);
create index if not exists assistente_turnos_rascunho_idx on public.assistente_turnos (conversa_id)
  where status = 'rascunho';

-- ── O que ele pode afirmar ────────────────────────────────────────────────
create table if not exists public.assistente_fatos (
  id uuid primary key default gen_random_uuid(),
  tema text not null,
  texto text not null,
  nao_dizer text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.team_members(id) on delete set null
);
create index if not exists assistente_fatos_ordem_idx on public.assistente_fatos (ativo, ordem);

-- Só fato verdadeiro e no ar (levantamento de 03/11/2026). Sem preço e sem prazo do teste.
-- Semeia só com a tabela vazia: fato apagado pela equipe não volta.
insert into public.assistente_fatos (tema, texto, nao_dizer, ordem)
select v.tema, v.texto, v.nao_dizer, v.ordem
from (values
  ('O que é a Via Pesados',
   'A Via Pesados faz o sistema da loja de caminhões, carretas, implementos e máquinas. Não vende caminhão e não é loja.',
   'Não chamar a Via de loja, revenda ou portal. Não falar de marketplace, Match nem consulta pela placa.', 10),
  ('Anúncio em todos os canais',
   'A loja cadastra o veículo uma vez e ele sai na conta da própria loja no Mercado Livre, no Instagram (post e story), no Facebook (página e catálogo) e no site. O anúncio se atualiza sozinho.',
   'Não prometer venda, número de contatos nem resultado.', 20),
  ('Envio pelo WhatsApp',
   'Com um clique, as fotos na ordem, a ficha, o preço e o link do veículo chegam no WhatsApp do cliente.',
   null, 30),
  ('Site da loja',
   'O site com a marca da loja vem incluso, com uma página por veículo, e se atualiza com o estoque.',
   'Não prometer que a gente liga o domínio sozinho.', 40),
  ('Simulador de financiamento',
   'Simulador de financiamento em PDF com a marca da loja: mostra a parcela de um valor até outro, com o WhatsApp do vendedor daquele veículo.',
   'Não falar de juros nem de taxa.', 50),
  ('Vendas na base',
   'Quando chega um veículo, o sistema mostra quem já procurou um igual, e avisa quem está na hora de trocar de caminhão.',
   'Não prometer venda nem número de clientes.', 65),
  ('WhatsApp da equipe',
   'Cada vendedor conecta o próprio WhatsApp por QR code e a conversa fica com a loja. Tem funil de vendas com o valor somado.',
   null, 60),
  ('Gestão da loja',
   'Compra e consignação, despesa por veículo, ficha técnica por tipo e carroceria, financeiro, relatórios, ponto eletrônico e acesso por pessoa.',
   null, 70),
  ('Que veículos atende',
   'Caminhão, carreta, implemento e máquina (também carro e moto).',
   'Ônibus não: chamar o Xavier.', 80),
  ('Implantação',
   'A implantação é feita pela Via Pesados: a gente traz o estoque e conecta os canais e o WhatsApp. Da loja, só a logo, o estoque e os acessos.',
   'Não falar de taxa de implantação (nem afirmar nem negar). Nunca pedir senha: a loja autoriza na tela da Meta e do Mercado Livre.', 90),
  ('Teste grátis',
   'Antes de pagar tem o teste grátis, com tudo liberado. Ele começa depois dos 15 minutos com o Xavier, que combina a implantação.',
   'Não dizer quantos dias dura: o prazo o Xavier acerta com vocês na reunião.', 100),
  ('Sem fidelidade',
   'O contrato não tem fidelidade nem multa de cancelamento; o cancelamento vale no fim do mês já pago.',
   'Não dizer preço: o valor o Xavier mostra nos 15 minutos, junto com o sistema funcionando.', 110),
  ('De onde veio o número',
   'O número estava no anúncio da loja no portal Caminhões e Carretas.',
   'Não dizer que comprou lista nem citar outra fonte.', 120),
  ('A reunião',
   '15 minutos por videochamada com o Xavier: ele mostra o sistema funcionando com a realidade da loja e vocês decidem se começa o teste.',
   'Não dizer preço nem prazo do teste antes dela.', 130),
  ('Quem é a empresa',
   'Via Pesados e Sistemas Ltda, CNPJ 68.835.124/0001-20, site viapesados.com.br.',
   'Razão social e CNPJ só quando pedirem.', 140)
) as v(tema, texto, nao_dizer, ordem)
where not exists (select 1 from public.assistente_fatos);

-- ── WhatsApp: áudio transcrito, arquivo guardado, mensagem do assistente ──
alter table public.wa_mensagens add column if not exists transcricao text;
-- Caminho no bucket privado 'wa-midia': {conversa_id}/{mensagem_id}.{ext}
alter table public.wa_mensagens add column if not exists media_salva text;
-- Mensagem que o assistente escreveu (enviada sozinha ou aprovada). Null = não é dele.
alter table public.wa_mensagens add column if not exists turno_id uuid
  references public.assistente_turnos(id) on delete set null;

-- ── Quem moveu o card ─────────────────────────────────────────────────────
alter table public.prospect_events add column if not exists ator text;

create or replace function public.registrar_evento_prospect()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quem text := nullif(current_setting('app.ator', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.prospect_events (prospect_id, from_stage, to_stage, at, actor_id, ator)
    values (new.id, null, new.stage, coalesce(new.created_at, clock_timestamp()), new.owner_id, quem);
  elsif new.stage is distinct from old.stage then
    insert into public.prospect_events (prospect_id, from_stage, to_stage, at, actor_id, ator)
    values (new.id, old.stage, new.stage, clock_timestamp(), new.owner_id, quem);
  end if;
  return new;
end $$;

-- O canal de aquisição dos cards que o assistente cria.
insert into public.acquisition_channels (name, slug, color, sort)
select 'Assistente de vendas', 'assistente', '#FF6E00', 9
where not exists (select 1 from public.acquisition_channels where slug = 'assistente' or name = 'Assistente de vendas');

-- Telefone como chave de comparação: sem 55, sem o 9 depois do DDD.
create or replace function public.assistente_tel_chave(t text)
returns text language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(t, ''), '\D', '', 'g');
begin
  if length(d) in (12, 13) and left(d, 2) = '55' then d := substr(d, 3); end if;
  if length(d) = 11 and substr(d, 3, 1) = '9' then d := left(d, 2) || substr(d, 4); end if;
  return d;
end $$;

/* Move o card como o assistente: só para a frente (contato → amostra → oportunidade →
   reuniao), nunca para teste ou vendido, e para 'perdido' só com motivo. Card que já está
   em teste, vendido ou perdido ele não toca. Nunca lança erro por "não andou": devolve
   {mudou, de, para, recusado}. Lança só para argumento inválido. */
create or replace function public.assistente_mover_card(p_prospect uuid, p_stage text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ordem constant text[] := array['contato', 'amostra', 'oportunidade', 'reuniao'];
  atual text;
begin
  if p_stage is null or p_stage not in ('contato', 'amostra', 'oportunidade', 'reuniao', 'perdido') then
    raise exception 'etapa não permitida ao assistente: %', p_stage;
  end if;
  select stage into atual from public.prospects where id = p_prospect for update;
  if not found then
    raise exception 'card % não existe', p_prospect;
  end if;
  if atual in ('teste', 'vendido', 'perdido') then
    return jsonb_build_object('mudou', false, 'de', atual, 'para', atual,
      'recusado', 'card em ' || atual || ': fica com a equipe');
  end if;
  if p_stage = 'perdido' then
    if coalesce(btrim(p_motivo), '') = '' then
      raise exception 'perdido exige motivo';
    end if;
    perform set_config('app.ator', 'assistente', true);
    update public.prospects set stage = 'perdido', lost_reason = left(btrim(p_motivo), 300) where id = p_prospect;
    return jsonb_build_object('mudou', true, 'de', atual, 'para', 'perdido', 'recusado', null);
  end if;
  if array_position(ordem, p_stage) <= array_position(ordem, atual) then
    return jsonb_build_object('mudou', false, 'de', atual, 'para', atual,
      'recusado', case when p_stage = atual then null else 'só para a frente' end);
  end if;
  perform set_config('app.ator', 'assistente', true);
  update public.prospects set stage = p_stage where id = p_prospect;
  return jsonb_build_object('mudou', true, 'de', atual, 'para', p_stage, 'recusado', null);
end $$;

/* Cria (ou acha) o card da conversa e liga tudo: wa_conversas.prospect_id e
   assistente_conversas.prospect_id. Idempotente:
     - conversa já ligada a um card → devolve esse card (e o leva para a frente até p_stage);
     - card da mesma frente com o mesmo WhatsApp (com ou sem 55 e o 9) → liga e devolve;
     - senão cria: source 'assistente', canal 'Assistente de vendas', funil 'fria', dono =
       assistente_config.responsavel_id, frente = a da conversa, nome/cidade/UF da loja da
       prospecção quando não vierem. O evento de criação fica com ator 'assistente'. */
create or replace function public.assistente_criar_card(
  p_conversa uuid,
  p_company_name text default null,
  p_contact_name text default null,
  p_city text default null,
  p_state text default null,
  p_stage text default 'contato'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  conv record;
  l_nome text;
  l_cidade text;
  l_uf text;
  achado uuid;
  dono uuid;
  canal uuid;
begin
  if p_stage is null or p_stage not in ('contato', 'oportunidade', 'reuniao') then
    raise exception 'etapa inicial não permitida ao assistente: %', p_stage;
  end if;
  select id, telefone, nome, prospect_id, frente into conv from public.wa_conversas where id = p_conversa for update;
  if not found then
    raise exception 'conversa % não existe', p_conversa;
  end if;

  achado := conv.prospect_id;
  if achado is null then
    select p.id into achado from public.prospects p
    where p.frente = conv.frente
      and p.whatsapp is not null
      and public.assistente_tel_chave(p.whatsapp) = public.assistente_tel_chave(conv.telefone)
    order by p.created_at desc limit 1;
  end if;

  if achado is not null then
    perform public.assistente_mover_card(achado, p_stage);
  else
    select l.nome, l.cidade, l.uf into l_nome, l_cidade, l_uf
    from public.assistente_conversas a join public.prospeccao_lojas l on l.id = a.loja_id
    where a.conversa_id = p_conversa;
    select responsavel_id into dono from public.assistente_config where id = 1;
    select id into canal from public.acquisition_channels where slug = 'assistente';
    perform set_config('app.ator', 'assistente', true);
    insert into public.prospects (company_name, contact_name, whatsapp, city, state, source, stage,
                                  owner_id, channel_id, funil, frente)
    values (
      coalesce(nullif(btrim(p_company_name), ''), l_nome, nullif(btrim(conv.nome), ''), conv.telefone),
      nullif(btrim(p_contact_name), ''),
      conv.telefone,
      coalesce(nullif(btrim(p_city), ''), l_cidade),
      coalesce(nullif(btrim(p_state), ''), l_uf),
      'assistente', p_stage, dono, canal, 'fria', conv.frente
    ) returning id into achado;
  end if;

  update public.wa_conversas set prospect_id = achado where id = p_conversa and prospect_id is distinct from achado;
  update public.assistente_conversas set prospect_id = achado where conversa_id = p_conversa and prospect_id is distinct from achado;
  return achado;
end $$;

/* Quanto o assistente gastou hoje (dia de São Paulo), nas duas frentes: o teto é da empresa. */
create or replace function public.assistente_gasto_hoje()
returns numeric language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_team_member() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'acesso negado';
  end if;
  return coalesce((
    select sum(custo_usd) from public.assistente_turnos
    where criado_em >= (((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo')
  ), 0);
end $$;

revoke all on function public.assistente_mover_card(uuid, text, text) from public, anon, authenticated;
revoke all on function public.assistente_criar_card(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.assistente_gasto_hoje() from public, anon;
grant execute on function public.assistente_mover_card(uuid, text, text) to service_role;
grant execute on function public.assistente_criar_card(uuid, text, text, text, text, text) to service_role;
grant execute on function public.assistente_gasto_hoje() to authenticated, service_role;

-- ── Carimbos e herança da frente ──────────────────────────────────────────
create or replace function public.assistente_carimbar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if tg_table_name in ('assistente_config', 'assistente_fatos') and auth.uid() is not null then
    new.atualizado_por := auth.uid();
  end if;
  -- Ligar de novo apaga o motivo da pausa. (IFs aninhados: new.ligado só existe na config.)
  if tg_table_name = 'assistente_config' and tg_op = 'UPDATE' then
    if new.ligado and not old.ligado then
      new.pausado_motivo := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.assistente_carimbar() from public, anon, authenticated;

drop trigger if exists assistente_carimbo on public.assistente_config;
create trigger assistente_carimbo before update on public.assistente_config
  for each row execute function public.assistente_carimbar();
drop trigger if exists assistente_carimbo on public.assistente_fatos;
create trigger assistente_carimbo before insert or update on public.assistente_fatos
  for each row execute function public.assistente_carimbar();
drop trigger if exists assistente_carimbo on public.assistente_conversas;
create trigger assistente_carimbo before update on public.assistente_conversas
  for each row execute function public.assistente_carimbar();

drop trigger if exists frente_herdada on public.assistente_conversas;
create trigger frente_herdada before insert or update on public.assistente_conversas
  for each row execute function public.herdar_frente('conversa_id', 'wa_conversas');
drop trigger if exists frente_herdada on public.assistente_turnos;
create trigger frente_herdada before insert or update on public.assistente_turnos
  for each row execute function public.herdar_frente('conversa_id', 'wa_conversas');

-- ── Quem lê e quem grava ──────────────────────────────────────────────────
-- Config: a equipe lê e altera pela tela (só a linha 1 existe). Estado e turnos: a equipe
-- lê na frente em que está; quem grava é o servidor (assistente-responder, assistente-acao).
-- Fatos: a equipe lê e edita pela tela.
alter table public.assistente_config enable row level security;
alter table public.assistente_conversas enable row level security;
alter table public.assistente_turnos enable row level security;
alter table public.assistente_fatos enable row level security;

drop policy if exists assistente_config_ler on public.assistente_config;
create policy assistente_config_ler on public.assistente_config
  for select to authenticated using (public.is_team_member());
drop policy if exists assistente_config_alterar on public.assistente_config;
create policy assistente_config_alterar on public.assistente_config
  for update to authenticated using (public.is_team_member()) with check (public.is_team_member());

drop policy if exists assistente_conversas_frente_ler on public.assistente_conversas;
create policy assistente_conversas_frente_ler on public.assistente_conversas
  for select to authenticated using (public.is_team_member() and frente = public.frente_pedida());

drop policy if exists assistente_turnos_frente_ler on public.assistente_turnos;
create policy assistente_turnos_frente_ler on public.assistente_turnos
  for select to authenticated using (public.is_team_member() and frente = public.frente_pedida());

drop policy if exists assistente_fatos_equipe on public.assistente_fatos;
create policy assistente_fatos_equipe on public.assistente_fatos
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- A tela acompanha rascunho e etapa ao vivo, como já faz com as mensagens.
do $$
declare t text;
begin
  foreach t in array array['assistente_conversas', 'assistente_turnos'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables
                       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── Áudio e foto guardados ────────────────────────────────────────────────
-- O link da mídia expira: o servidor baixa na hora e guarda aqui. Privado: a equipe lê
-- só o que é de conversa que ela enxerga (a policy de wa_conversas vale dentro do exists).
insert into storage.buckets (id, name, public, file_size_limit)
values ('wa-midia', 'wa-midia', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "wa-midia equipe le" on storage.objects;
create policy "wa-midia equipe le" on storage.objects
  for select to authenticated using (
    bucket_id = 'wa-midia'
    and public.is_team_member()
    and exists (select 1 from public.wa_conversas c where c.id::text = (storage.foldername(name))[1])
  );

-- ── A rotina das pendentes ────────────────────────────────────────────────
-- De 5 em 5 minutos. A função confere sozinha: 08h–20h de São Paulo, assistente ligado,
-- janela de 24h da Meta aberta; responde a mais antiga primeiro. Chamada à toa não manda nada.
-- Também pega rodada que morreu no meio (pendente há mais de 2 minutos).
select cron.unschedule('assistente-pendentes') where exists (select 1 from cron.job where jobname = 'assistente-pendentes');
select cron.schedule('assistente-pendentes', '*/5 * * * *', $$
  select net.http_post(
    url     := 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/assistente-pendentes',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);

comment on column public.prospeccao_config.agente_responde is
  'Sem efeito desde o assistente de vendas (03/11/2026): quem manda é assistente_config.modo_prospeccao.';
