-- Lojistas e Transportadoras no mesmo painel, sem misturar (decisão do dono, 29/10/2026):
-- "completamente separados! dados nunca devem se misturar", com uma exceção — a seção
-- Empresa, onde ele vê a Via Pesados como um todo, as duas frentes juntas.
--
-- Como a separação é garantida pelo banco, e não por cada tela lembrar de filtrar:
--   * toda linha de dado de cliente tem `frente` ('lojista' | 'transportadora');
--   * o painel diz em que frente está pelo cabeçalho `x-frente` (o PostgREST o expõe em
--     request.headers) e as policies só mostram e gravam linhas daquela frente;
--   * a frente 'empresa' lê as duas (só nas tabelas que a visão geral usa) e só grava o que
--     é da empresa inteira: custo geral no financeiro e meta da empresa;
--   * linha filha herda a frente da mãe por trigger (pagamento do cliente, mensagem do
--     chamado, evento do prospect), então rotina do servidor que grava com a chave de
--     serviço também cai na frente certa.
--
-- Sem cabeçalho = 'lojista'. Aba antiga aberta no navegador, rotina agendada, função que
-- chama o banco sem repassar o cabeçalho: tudo continua exatamente como era antes de
-- existir a segunda frente. Por isso esta migration pode ir ao ar antes da tela nova.
--
-- Fica sem frente, porque é da empresa e não de cliente: equipe, conselho, números de
-- WhatsApp (instâncias e webhook), categorias do financeiro, canais de aquisição e a
-- configuração do agente de prospecção.

-- ── A frente do pedido ─────────────────────────────────────────────────────
create or replace function public.frente_pedida() returns text
language sql stable set search_path = public as $$
  select case lower(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-frente', ''))
    when 'transportadora' then 'transportadora'
    when 'empresa' then 'empresa'
    else 'lojista'
  end
$$;

/* O valor padrão de uma linha nova. Na frente 'empresa' cai em 'lojista' de propósito: a
   policy de gravação exige frente = frente_pedida(), então dado de cliente gravado a partir
   da visão geral é recusado em vez de cair numa frente por acaso. */
create or replace function public.frente_para_gravar() returns text
language sql stable set search_path = public as $$
  select case public.frente_pedida() when 'transportadora' then 'transportadora' else 'lojista' end
$$;

/* Herda a frente da linha mãe. Argumentos em pares: coluna, tabela. O primeiro par com
   valor decide; sem nenhum, fica o padrão do pedido. */
create or replace function public.herdar_frente() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  i int := 0;
  valor text;
  achada text;
begin
  while i < tg_nargs loop
    valor := to_jsonb(new) ->> tg_argv[i];
    if valor is not null then
      execute format('select frente from public.%I where id = $1', tg_argv[i + 1]) into achada using valor::uuid;
      if achada is not null then
        new.frente := achada;
        return new;
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end $$;
revoke all on function public.herdar_frente() from public, anon, authenticated;

-- ── A coluna ──────────────────────────────────────────────────────────────
-- Primeiro com 'lojista' fixo (as linhas de hoje são todas da frente lojista); depois o
-- padrão passa a vir do pedido.
do $$
declare
  t text;
  com_empresa text[] := array['financial_transactions','metas_ciclos','metas_objetivos','metas_kr',
                              'metas_checkins','metas_nsm','metas_nsm_serie'];
begin
  foreach t in array array[
    'prospects','clients','plans','contracts','onboarding_tasks','payments','notas_fiscais',
    'tickets','ticket_mensagens','testes_gratis','system_credentials','client_data_access_log',
    'demos','meetings','prospect_events','activities','tarefas',
    'wa_conversas','wa_mensagens','wa_envios','wa_fila',
    'financial_transactions','metas_ciclos','metas_objetivos','metas_kr','metas_checkins',
    'metas_nsm','metas_nsm_serie','prospeccao_lojas','prospeccao_envios'
  ] loop
    execute format('alter table public.%I add column if not exists frente text not null default ''lojista''', t);
    if t = any(com_empresa) then
      execute format('alter table public.%I add constraint %I check (frente in (''lojista'',''transportadora'',''empresa''))', t, t || '_frente_valida');
      execute format('alter table public.%I alter column frente set default public.frente_pedida()', t);
    else
      execute format('alter table public.%I add constraint %I check (frente in (''lojista'',''transportadora''))', t, t || '_frente_valida');
      execute format('alter table public.%I alter column frente set default public.frente_para_gravar()', t);
    end if;
  end loop;
end $$;

create index if not exists clients_frente_idx on public.clients (frente);
create index if not exists prospects_frente_idx on public.prospects (frente);
create index if not exists payments_frente_idx on public.payments (frente);

-- ── Herança da frente ─────────────────────────────────────────────────────
create trigger frente_herdada before insert or update on public.clients
  for each row execute function public.herdar_frente('prospect_id', 'prospects', 'plan_id', 'plans');
create trigger frente_herdada before insert or update on public.contracts
  for each row execute function public.herdar_frente('client_id', 'clients', 'prospect_id', 'prospects');
create trigger frente_herdada before insert or update on public.system_credentials
  for each row execute function public.herdar_frente('client_id', 'clients', 'demo_id', 'demos');
create trigger frente_herdada before insert or update on public.activities
  for each row execute function public.herdar_frente('client_id', 'clients', 'prospect_id', 'prospects');
create trigger frente_herdada before insert or update on public.tarefas
  for each row execute function public.herdar_frente('client_id', 'clients', 'prospect_id', 'prospects');
create trigger frente_herdada before insert or update on public.wa_conversas
  for each row execute function public.herdar_frente('client_id', 'clients', 'prospect_id', 'prospects');
create trigger frente_herdada before insert or update on public.ticket_mensagens
  for each row execute function public.herdar_frente('ticket_id', 'tickets');
create trigger frente_herdada before insert or update on public.wa_mensagens
  for each row execute function public.herdar_frente('conversa_id', 'wa_conversas');
create trigger frente_herdada before insert or update on public.prospeccao_envios
  for each row execute function public.herdar_frente('loja_id', 'prospeccao_lojas');
create trigger frente_herdada before insert or update on public.metas_objetivos
  for each row execute function public.herdar_frente('ciclo_id', 'metas_ciclos');
create trigger frente_herdada before insert or update on public.metas_kr
  for each row execute function public.herdar_frente('objetivo_id', 'metas_objetivos', 'ciclo_id', 'metas_ciclos');
create trigger frente_herdada before insert or update on public.metas_checkins
  for each row execute function public.herdar_frente('kr_id', 'metas_kr');

do $$
declare t text;
begin
  foreach t in array array['onboarding_tasks','payments','notas_fiscais','tickets','testes_gratis',
                           'client_data_access_log','wa_envios','wa_fila','financial_transactions'] loop
    execute format('create trigger frente_herdada before insert or update on public.%I
      for each row execute function public.herdar_frente(''client_id'', ''clients'')', t);
  end loop;
  foreach t in array array['demos','meetings','prospect_events'] loop
    execute format('create trigger frente_herdada before insert or update on public.%I
      for each row execute function public.herdar_frente(''prospect_id'', ''prospects'')', t);
  end loop;
end $$;

-- ── As policies ───────────────────────────────────────────────────────────
-- Trocadas uma a uma, preservando o que cada tabela já permitia (quem pode, e se pode
-- gravar pelo navegador ou só ler o que o servidor gravou).
do $$
declare
  t text;
  p record;
  -- O que a visão geral (frente 'empresa') lê das duas frentes.
  visao_geral text[] := array['prospects','clients','plans','contracts','payments','tickets',
                              'testes_gratis','financial_transactions'];
  so_leitura text[] := array['wa_envios','wa_fila','prospeccao_envios'];
  quem text;
  ler text;
begin
  foreach t in array array[
    'prospects','clients','plans','contracts','onboarding_tasks','payments','notas_fiscais',
    'tickets','ticket_mensagens','testes_gratis','system_credentials','client_data_access_log',
    'demos','meetings','prospect_events','activities','tarefas',
    'wa_conversas','wa_mensagens','wa_envios','wa_fila',
    'financial_transactions','metas_ciclos','metas_objetivos','metas_kr','metas_checkins',
    'metas_nsm','metas_nsm_serie','prospeccao_lojas','prospeccao_envios'
  ] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    quem := case when t = 'system_credentials' then 'public.is_team_admin()' else 'public.is_team_member()' end;
    ler := case when t = any(visao_geral)
      then format('%s and (frente = public.frente_pedida() or public.frente_pedida() = ''empresa'')', quem)
      else format('%s and frente = public.frente_pedida()', quem) end;

    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_frente_ler', t, ler);

    if t = any(so_leitura) then
      continue;
    end if;

    execute format('create policy %I on public.%I for insert to authenticated with check (%s and frente = public.frente_pedida())',
      t || '_frente_gravar', t, quem);

    -- O registro da LGPD não se altera nem se apaga (art. 37).
    if t = 'client_data_access_log' then
      continue;
    end if;

    execute format('create policy %I on public.%I for update to authenticated using (%s and frente = public.frente_pedida()) with check (%s and frente = public.frente_pedida())',
      t || '_frente_alterar', t, quem, quem);
    execute format('create policy %I on public.%I for delete to authenticated using (%s and frente = public.frente_pedida())',
      t || '_frente_apagar', t, quem);
  end loop;
end $$;

-- ── O sistema de cada cliente ─────────────────────────────────────────────
-- O lojista mora no projeto viapesados-lojista (lojista_company_id); a transportadora,
-- no projeto viapesados-transportes (transportes_empresa_id).
alter table public.clients add column if not exists transportes_empresa_id uuid;
alter table public.demos add column if not exists transportes_empresa_id uuid;

-- A trilha de implantação de cada frente.
create or replace function public.seed_onboarding_tasks()
returns trigger language plpgsql as $$
begin
  if new.frente = 'transportadora' then
    insert into public.onboarding_tasks (client_id, task_key, label, sort) values
      (new.id, 'contrato_gerado',       'Contrato gerado',                   1),
      (new.id, 'contrato_assinado',     'Contrato assinado',                 2),
      (new.id, 'pagamento_recebido',    'Primeira mensalidade paga',         3),
      (new.id, 'sistema_criado',        'Sistema criado',                    4),
      (new.id, 'acesso_liberado',       'Primeiro acesso liberado',          5),
      (new.id, 'frota_cadastrada',      'Frota e motoristas cadastrados',    6),
      (new.id, 'primeira_viagem',       'Primeira viagem no sistema',        7),
      (new.id, 'treinamento_realizado', 'Treinamento da equipe realizado',   8),
      (new.id, 'go_live',               'Go-live — transportadora operando', 9);
    return new;
  end if;
  insert into public.onboarding_tasks (client_id, task_key, label, sort) values
    (new.id, 'contrato_gerado',       'Contrato gerado',                 1),
    (new.id, 'contrato_assinado',     'Contrato assinado',               2),
    (new.id, 'pagamento_recebido',    'Primeira mensalidade paga',       3),
    (new.id, 'sistema_criado',        'Sistema criado',                  4),
    (new.id, 'dominio_conectado',     'Domínio conectado',               5),
    (new.id, 'dados_importados',      'Estoque no ar',                   6),
    (new.id, 'treinamento_realizado', 'Treinamento da equipe realizado', 7),
    (new.id, 'acesso_liberado',       'Primeiro acesso liberado',        8),
    (new.id, 'go_live',               'Go-live — cliente operando',      9);
  return new;
end $$;
