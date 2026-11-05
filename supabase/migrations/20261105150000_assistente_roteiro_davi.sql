-- Assistente de vendas: o roteiro do Davi (05/11/2026).
--
-- Depois do primeiro teste real, o dono reprovou a conversa ("largou informação, pulou
-- etapa") e pediu um SDR de verdade. A base é o manual de vendas de 05/11
-- (~/Documents/Prospecção/Vendedor automático/pesquisa/). Aqui ficam os fatos:
--   - usar_quando: a dor que cada fato responde. Uma dor, uma prova: a lista deixa de ser
--     cardápio de funções;
--   - fatos novos aprovados pelo dono em 05/11: o Xavier é o dono, vendeu sai de todos os
--     canais sozinho, é mensal; a reunião promete o caminhão saindo em todos os canais;
--   - "o Via Pesados" (o dono escreveu "Aqui é o Davi, do Via Pesados").
-- Atualiza pelo tema, sem apagar nada: o teste grátis segue desativado.

alter table public.assistente_fatos add column if not exists usar_quando text;

comment on column public.assistente_fatos.usar_quando is
  'A dor ou situação em que o assistente usa este fato (um fato por resposta, o que responde ao que ele disse).';

update public.assistente_fatos set
  tema = 'O que é o Via Pesados',
  texto = 'O Via Pesados é o sistema da loja de caminhões, carretas, implementos e máquinas. Não vende caminhão e não é loja.',
  nao_dizer = 'Não chamar o Via Pesados de loja, revenda ou portal. Não falar de marketplace, Match nem consulta pela placa.',
  usar_quando = 'Ele não sabe quem somos ou acha que vendemos caminhão.'
where tema in ('O que é a Via Pesados', 'O que é o Via Pesados');

update public.assistente_fatos set usar_quando = 'Não dá tempo de postar em todo lugar; posta quando sobra tempo; cadastra o mesmo caminhão em cada lugar.'
where tema = 'Anúncio em todos os canais';
update public.assistente_fatos set usar_quando = 'Demora para mandar foto e ficha; tem que ir no pátio ver; não dá conta de responder todo mundo; carreta e ficha completa.'
where tema = 'Envio pelo WhatsApp';
update public.assistente_fatos set usar_quando = 'Não tem site, ou o site fica parado e desatualizado.'
where tema = 'Site da loja';
update public.assistente_fatos set usar_quando = 'O cliente pergunta a parcela e ele precisa ligar para o banco.'
where tema = 'Simulador de financiamento';
update public.assistente_fatos set usar_quando = 'O cliente fica no celular do vendedor; vendedor saiu e levou os clientes; não sabe quem atendeu quem.'
where tema = 'WhatsApp da equipe';
update public.assistente_fatos set usar_quando = 'Não lembra quem estava procurando um caminhão igual ao que chegou.'
where tema = 'Vendas na base';
update public.assistente_fatos set usar_quando = 'Só se ele perguntar de gestão, consignação ou financeiro. Não é prova antes da reunião.'
where tema = 'Gestão da loja';
update public.assistente_fatos set usar_quando = 'Ele perguntou se funciona para carreta, máquina, carro ou moto.'
where tema = 'Que veículos atende';
update public.assistente_fatos set
  texto = 'A implantação é feita pelo Via Pesados: a gente traz o estoque e conecta os canais e o WhatsApp. Da loja, só a logo, o estoque e os acessos.',
  usar_quando = 'Ele não tem tempo de mexer em sistema ou tem medo de dar trabalho (tira o medo; não é prova).'
where tema = 'Implantação';
update public.assistente_fatos set usar_quando = 'Medo de ficar preso, pedido de preço, "vou pensar".'
where tema = 'Sem fidelidade';
update public.assistente_fatos set usar_quando = 'Perguntou de onde pegamos o número ou desconfiou. Só se a loja é da lista da prospecção.'
where tema = 'De onde veio o número';
update public.assistente_fatos set
  texto = '15 minutos por videochamada com o Xavier: ele mostra um caminhão saindo no Mercado Livre, no Insta, no Face e no site com um cadastro só, e o valor. Se servir, a loja já deixa a implantação marcada; se não servir, tudo bem.',
  nao_dizer = 'Não dizer o preço antes dela. Não chamar a reunião de "primeiro passo" nem de obrigação.',
  usar_quando = 'No convite e na marcação.'
where tema = 'A reunião';
update public.assistente_fatos set usar_quando = 'Pediu razão social ou CNPJ.'
where tema = 'Quem é a empresa';

insert into public.assistente_fatos (tema, texto, nao_dizer, usar_quando, ordem)
select v.tema, v.texto, v.nao_dizer, v.usar_quando, v.ordem
from (values
  ('Quem é o Xavier',
   'O Xavier é o dono do Via Pesados e é quem faz a reunião.',
   null,
   'Ao convidar para a reunião ou quando perguntarem quem é o Xavier.', 5),
  ('Vendeu, sai de todos',
   'Vendeu, o anúncio sai de todos os canais sozinho.',
   'Não prometer venda nem número de contatos.',
   'Cliente liga atrás de caminhão que já vendeu; anúncio velho; ninguém lembra de tirar o anúncio.', 25),
  ('É mensal',
   'É mensalidade, sem fidelidade e sem multa pra cancelar.',
   'Não dizer o valor: quem passa é o Xavier, na reunião.',
   'Ele pediu o preço.', 105)
) as v(tema, texto, nao_dizer, usar_quando, ordem)
where not exists (select 1 from public.assistente_fatos f where f.tema = v.tema);
