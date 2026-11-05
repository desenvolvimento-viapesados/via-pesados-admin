-- Assistente de vendas: números de teste do dono (05/11/2026).
--
-- O dono testa o assistente pelo próprio celular, no número oficial, e vai ajustando o
-- roteiro. Para isso:
--   - telefones_teste: mensagem destes números (com ou sem o 9) entra com o assistente
--     atendendo sozinho, sem ninguém ligar na conversa;
--   - historico_desde: "Recomeçar do zero" na conversa de teste. O assistente esquece a
--     conversa (etapa, memória, dores, horários) e lê só as mensagens daqui para a frente.
--     As mensagens continuam na caixa do CRM.

-- Cada número: só dígitos, com 55 e DDD (12 ou 13 dígitos). Nada de vazio, nulo ou dois
-- números num elemento só.
create or replace function public.assistente_telefones_validos(lista text[])
returns boolean language sql immutable as $$
  select coalesce(cardinality(lista), 0) <= 10
     and coalesce((select bool_and(x is not null and x ~ '^55[0-9]{10,11}$') from unnest(lista) x), true)
$$;

alter table public.assistente_config
  add column if not exists telefones_teste text[] not null default '{}';
alter table public.assistente_config
  drop constraint if exists assistente_config_telefones_teste_validos;
alter table public.assistente_config
  add constraint assistente_config_telefones_teste_validos
  check (public.assistente_telefones_validos(telefones_teste));

comment on column public.assistente_config.telefones_teste is
  'Números do dono para testar o assistente (só dígitos, com 55). Mensagem deles entra com o assistente atendendo sozinho; a conversa ganha "Recomeçar do zero".';

alter table public.assistente_conversas
  add column if not exists historico_desde timestamptz;

comment on column public.assistente_conversas.historico_desde is
  'Teste recomeçado do zero: o assistente lê só as mensagens a partir daqui.';
