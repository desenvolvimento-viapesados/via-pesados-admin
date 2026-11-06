-- Assistente de vendas: o diferencial do Via Pesados (dono, 06/11/2026).
-- "Único software do Brasil de veículos pesados, com conexão oficial ao Mercado Livre,
-- WhatsApp, Facebook e Instagram. O único do Brasil pra esse nicho."
-- O WhatsApp do lojista conecta pela Evolution (QR code), não pela API oficial da Meta:
-- por isso "oficial" vale para Mercado Livre, Facebook e Instagram, e o WhatsApp é "integrado".
-- Se o WhatsApp do lojista passar para a API oficial, trocar o texto aqui e no roteiro.

insert into public.assistente_fatos (tema, texto, nao_dizer, usar_quando, ordem)
select 'O diferencial',
  'O Via Pesados é o único software do Brasil feito para loja de veículos pesados com conexão oficial ao Mercado Livre, ao Facebook e ao Instagram, e com o WhatsApp da loja integrado. É o único do Brasil para esse nicho.',
  'Não dizer que a conexão do WhatsApp do lojista é oficial. Não citar concorrente pelo nome.',
  'Na apresentação e no convite: é o que diferencia o Via Pesados.',
  1
where not exists (select 1 from public.assistente_fatos where tema = 'O diferencial');
