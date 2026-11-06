-- Assistente de vendas: o catálogo do WhatsApp entra nos canais (dono, 06/11/2026:
-- "tem catálogo do whatsapp também"). O cadastro único sai no Mercado Livre, no Instagram,
-- no Facebook, no catálogo do WhatsApp e no site da loja. OLX e portais, não.
update public.assistente_fatos set
  texto = 'A loja cadastra o veículo uma vez e ele sai na conta da própria loja no Mercado Livre, no Instagram (post e story), no Facebook (página e catálogo), no catálogo do WhatsApp e no site. O anúncio se atualiza sozinho.'
where tema = 'Anúncio em todos os canais';
update public.assistente_fatos set
  texto = 'O Via Pesados não publica na OLX nem em portais como o Caminhões e Carretas: lá a loja segue postando como hoje. O que sai sozinho é o Mercado Livre, o Facebook, o Instagram, o catálogo do WhatsApp e o site da loja.'
where tema = 'Portais';
update public.assistente_fatos set
  texto = '15 minutos por videochamada com o Xavier: ele mostra um caminhão saindo no Mercado Livre, no Insta, no Face, no catálogo do WhatsApp e no site com um cadastro só, e o valor. Se servir, a loja já deixa a implantação marcada; se não servir, tudo bem.'
where tema = 'A reunião';
update public.assistente_fatos set
  texto = 'Vendeu, o anúncio sai de todos os canais sozinho (Mercado Livre, Instagram, Facebook, catálogo do WhatsApp e site).'
where tema = 'Vendeu, sai de todos';
