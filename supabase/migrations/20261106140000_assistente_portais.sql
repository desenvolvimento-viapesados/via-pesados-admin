-- Assistente de vendas: portais (06/11/2026).
-- Na bancada, o lojista perguntou "a OLX entra nisso?" (onde ele mais vende) e o Davi fugiu,
-- porque o roteiro mandava não citar o portal. Pergunta que decide o negócio se responde direto.
-- O Via Pesados publica no Mercado Livre, no Facebook, no Instagram e no site da loja; não publica
-- na OLX nem em portais como o Caminhões e Carretas.
insert into public.assistente_fatos (tema, texto, nao_dizer, usar_quando, ordem)
select 'Portais',
  'O Via Pesados não publica na OLX nem em portais como o Caminhões e Carretas: lá a loja segue postando como hoje. O que sai sozinho é o Mercado Livre, o Facebook, o Instagram e o site da loja.',
  'Não prometer integração com a OLX nem com portais.',
  'Ele perguntou se a OLX ou outro portal entra, ou disse que vende mais lá.',
  22
where not exists (select 1 from public.assistente_fatos where tema = 'Portais');
