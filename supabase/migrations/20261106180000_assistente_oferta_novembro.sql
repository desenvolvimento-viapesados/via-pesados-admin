-- A oferta de lançamento de novembro (dono, 06/11/2026): o normal é R$ 587 por mês mais a
-- taxa de implantação; até 30/11 sai R$ 437 por mês e a implantação não é cobrada. Depois
-- da data o Davi passa a dizer o cheio com a taxa (precoDeHoje em assistente-regras.ts).
alter table public.assistente_config
  add column if not exists preco_cheio numeric(10,2)
    constraint assistente_config_preco_cheio_valido check (preco_cheio is null or preco_cheio > 0),
  add column if not exists oferta_ate date;

comment on column public.assistente_config.preco_cheio is
  'O valor normal por mês, sem a oferta (mais a taxa de implantação). Vazio = não há oferta.';
comment on column public.assistente_config.oferta_ate is
  'Último dia (hora de Brasília) em que vale o preco_mensal com a implantação de graça.';

update public.assistente_config set preco_cheio = 587, oferta_ate = date '2026-11-30'
 where id = 1 and preco_cheio is null;
