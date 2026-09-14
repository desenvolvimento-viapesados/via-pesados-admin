-- O upsert de credencial quebrava com "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification": os índices eram
-- parciais (WHERE client_id IS NOT NULL) e o Postgres só aceita índice
-- parcial como alvo de ON CONFLICT se o comando repetir o mesmo WHERE —
-- algo que o PostgREST não tem como escrever. Resultado: liberar o primeiro
-- acesso criava o usuário e morria no passo seguinte, sem disparar nada.
--
-- Índice único simples dá a mesma garantia: no Postgres NULLs são distintos
-- entre si num índice único, então continuam cabendo várias linhas de
-- amostra (client_id nulo) e várias de cliente (demo_id nulo).
drop index if exists sc_client_uidx;
drop index if exists sc_demo_uidx;

create unique index sc_client_uidx on public.system_credentials (client_id);
create unique index sc_demo_uidx   on public.system_credentials (demo_id);

-- Uma credencial pertence a um cliente ou a uma amostra, nunca aos dois nem
-- a nenhum. Sem isto, uma linha órfã passaria despercebida e a tela de
-- credenciais simplesmente não acharia nada.
alter table public.system_credentials
  drop constraint if exists sc_dono_unico;
alter table public.system_credentials
  add constraint sc_dono_unico check (num_nonnulls(client_id, demo_id) = 1);
