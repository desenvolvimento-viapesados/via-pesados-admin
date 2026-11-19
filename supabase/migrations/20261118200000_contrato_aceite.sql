-- O aceite do contrato pelo link de boas-vindas (18/11/2026).
--
-- O cliente novo lê e aceita o contrato na página de pagamento, antes de pagar. A Cláusula 15.2
-- diz o que o registro guarda: a versão e o código de integridade do documento, a data e a hora,
-- o IP e o dispositivo. A data já mora em signed_at; aqui entram o resto e o texto exatamente
-- como foi aceito, que é a via que a página devolve ao cliente.
alter table public.contracts
  add column if not exists versao text,
  add column if not exists aceite_hash text,
  add column if not exists aceite_ip text,
  add column if not exists aceite_dispositivo text,
  add column if not exists texto_aceito text;

comment on column public.contracts.texto_aceito is
  'O contrato como o cliente aceitou (texto preenchido + registro do aceite). Não se edita depois.';
