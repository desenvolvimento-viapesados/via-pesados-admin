-- Assistente de vendas: o Davi diz o valor (dono, 06/11/2026).
-- Nas bancadas de simulação, o preço escondido foi o motivo número 1 de a conversa morrer.
-- O dono decidiu: o Davi fala um valor fechado, R$ 437 por mês. Fica na configuração (aba
-- Assistente) para ele trocar sem mexer em código; o conferente libera só esse valor.
-- Vazio = volta ao jeito antigo (o valor só com o Xavier).

alter table public.assistente_config
  add column if not exists preco_mensal numeric(10,2)
    constraint assistente_config_preco_mensal_valido check (preco_mensal is null or preco_mensal > 0);

comment on column public.assistente_config.preco_mensal is
  'Valor por mês que o assistente pode dizer ao lojista. Vazio: o valor é só com o Xavier.';

update public.assistente_config set preco_mensal = 437 where id = 1 and preco_mensal is null;

update public.assistente_fatos set
  texto = 'É mensalidade, sem fidelidade e sem multa pra cancelar. O valor que o assistente pode dizer fica na configuração do assistente.',
  nao_dizer = 'Nunca desconto, porcentagem, promoção nem valor diferente do configurado.'
where tema = 'É mensal';
update public.assistente_fatos set nao_dizer = 'Não prometer desconto nem condição especial.'
where tema = 'Sem fidelidade';
update public.assistente_fatos set nao_dizer = 'Não chamar a reunião de "primeiro passo" nem de obrigação.'
where tema = 'A reunião';
