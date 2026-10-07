#!/usr/bin/env python3
"""
Páginas de busca da Via Pesados — uma por pesquisa que o lojista faz no Google
("sistema para loja de caminhão", "CRM para loja de caminhões"...).

Cada página sai em public/conheca/<pagina>/index.html e é servida na RAIZ de
viapesados.com.br (viapesados.com.br/<pagina>) por um rewrite no vercel.json do
sistema-lojista, que também lista as mesmas páginas no sitemap.xml
(src/lib/robotsESitemap.ts, PAGINAS_DA_PLATAFORMA). Página nova: entra aqui,
lá e no rewrite — um teste do sistema-lojista confere as duas últimas.

Regras do texto (as mesmas da landing): toda frase promete tempo ou venda,
parágrafo curto, só o que o sistema faz de verdade. O detalhe mora nos cartões.

Uso: python3 scripts/gerar-paginas-seo.py
"""
import html
import json
import os
from urllib.parse import quote

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'conheca')
SITE = 'https://viapesados.com.br'
ZAP_NUMERO = '5533988144005'
ZAP_SVG = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>')

COMO_CONTRATAR = ('Como eu começo?',
                  'Chame no WhatsApp. Em quinze minutos você vê o sistema rodando com os seus caminhões, '
                  'sem cartão e sem compromisso.')

PAGINAS = [
    {
        'slug': 'sistema-para-loja-de-caminhao',
        'nome': 'Sistema para loja de caminhão',
        'titulo': 'Sistema para loja de caminhão | Via Pesados',
        'descricao': 'Sistema de gestão para loja de caminhão: estoque, anúncio em todos os canais, '
                     'WhatsApp da equipe, site e financeiro num lugar só.',
        'olho': 'Sistema para loja de caminhão',
        'h1': 'O sistema de gestão feito para <span class="laranja">loja de caminhão</span>.',
        'sub': 'Estoque, anúncios, WhatsApp da equipe, site e financeiro num lugar só. '
               'Menos tempo em planilha, mais caminhão vendido.',
        'figura': ('/conheca/img/clientes/carreta-viva-escuro.jpg', 1500, 833,
                   'Tela inicial do sistema Via Pesados numa loja de caminhões e carretas',
                   'Tela real do sistema, numa loja de demonstração.'),
        'secoes': [
            {
                'h2': 'Tudo o que a loja de caminhão faz, <span class="laranja">num sistema só</span>.',
                'conversa': 'Do caminhão que entra ao caminhão que sai, sem planilha, sem caderno e sem pagar outro sistema.',
                'cartoes': [
                    ('Estoque com custo de verdade', 'Compra, consignação e cada despesa do caminhão somam no custo. Você sabe a margem antes de dar o desconto.'),
                    ('Anúncio em todos os canais', 'Mercado Livre, Instagram, Facebook e o site da loja num clique, pela conexão oficial de cada um.'),
                    ('WhatsApp da equipe', 'Cada vendedor no próprio número, dentro do sistema, e um funil que mostra onde está o dinheiro do mês.'),
                    ('Financeiro e relatórios', 'A receber, a pagar, o lucro de cada venda e as marcas que compensam, sem fechar planilha no dia 30.'),
                ],
            },
            {
                'h2': 'Feito para pesados, <span class="laranja">não adaptado de carro</span>.',
                'conversa': 'Loja de caminhão tem ficha, cliente e negociação próprios. O sistema já nasce sabendo disso.',
                'cartoes': [
                    ('Ficha técnica de caminhão', 'As perguntas mudam com o tipo e a carroceria: configuração, cabine, potência, suspensão. O anúncio sai completo.'),
                    ('Preço com a FIPE do lado', 'O seu preço lado a lado com a tabela, para negociar com o número na mão.'),
                    ('Caminhão pedido', 'O que o cliente procura fica anotado. Chegou um igual no pátio, o sistema mostra quem chamar.'),
                    ('Financiamento e consórcio', 'Propostas e contratos acompanhados até o fim, e o que a loja ganha com eles aparece separado do caminhão.'),
                ],
            },
        ],
        'perguntas': [
            ('O que um sistema para loja de caminhão precisa ter?',
             'O custo real de cada caminhão, anúncio nos canais onde o comprador procura, o WhatsApp da equipe organizado e o lucro de cada venda. No Via Pesados, tudo isso fica no mesmo lugar.'),
            ('Serve para loja pequena?',
             'Serve, e é onde o tempo mais conta: com pouca gente, anunciar em todos os canais, que levava uma hora, vira um clique.'),
            ('Funciona no celular?',
             'Funciona. É pelo navegador, no computador e no celular, sem instalar nada.'),
            COMO_CONTRATAR,
        ],
    },
    {
        'slug': 'sistema-para-revenda-de-carretas',
        'nome': 'Sistema para revenda de carretas',
        'titulo': 'Sistema para revenda de carretas e implementos | Via Pesados',
        'descricao': 'Sistema para revenda de carretas e implementos: ficha por carroceria, anúncio no '
                     'Mercado Livre e nas redes num clique, site próprio e funil de vendas.',
        'olho': 'Revenda de carretas e implementos',
        'h1': 'O sistema para <span class="laranja">revenda de carretas</span> e implementos.',
        'sub': 'Graneleira, baú, sider, basculante: cada uma com a ficha certa, anunciada em todos os canais num clique.',
        'figura': ('/conheca/img/clientes/torque-norte-escuro.jpg', 1500, 834,
                   'Sistema Via Pesados numa revenda de caminhões e carretas',
                   'Tela real do sistema, numa loja de demonstração.'),
        'secoes': [
            {
                'h2': 'Cada implemento com a ficha <span class="laranja">que o comprador pede</span>.',
                'conversa': 'Quem compra carreta pergunta medida, assoalho e capacidade. O anúncio já sai respondendo.',
                'cartoes': [
                    ('Ficha por carroceria', 'As perguntas mudam com o implemento: comprimento, assoalho, capacidade de carga e suspensão. O anúncio sai completo.'),
                    ('Categoria certa no Mercado Livre', 'Carreta e implemento entram na categoria própria deles no Mercado Livre, onde o comprador procura.'),
                    ('Instagram e Facebook prontos', 'Post e story com a arte pronta, e o catálogo do Facebook sempre em dia.'),
                    ('Site da revenda', 'Cada implemento com página própria: fotos, ficha, preço e o WhatsApp do vendedor.'),
                ],
            },
            {
                'h2': 'Da entrada no pátio <span class="laranja">até a venda</span>.',
                'conversa': 'O implemento entra com custo e sai com o lucro calculado. No meio, o sistema acha o comprador.',
                'cartoes': [
                    ('Compra e consignação', 'O implemento entra com custo, documentos e dono, e cada despesa soma no custo.'),
                    ('Quem procura um igual', 'Chegou carreta no pátio, o sistema lista os contatos que procuram uma igual.'),
                    ('Simulador de financiamento', 'O cliente simula a parcela no seu site e baixa um PDF com a sua marca.'),
                    ('Lucro de cada venda', 'Margem por venda e por marca, para comprar o que dá dinheiro.'),
                ],
            },
        ],
        'perguntas': [
            ('O sistema serve para revenda só de carretas?',
             'Serve. Carretas, implementos e caminhões usam o mesmo sistema, cada um com a ficha técnica do seu tipo.'),
            ('Consigo anunciar carreta no Mercado Livre pelo sistema?',
             'Sim, na categoria de carretas e implementos, com ficha e fotos, num clique. O anúncio se atualiza sozinho quando muda o preço ou entra foto nova.'),
            ('Quais carrocerias o sistema conhece?',
             'Graneleira, baú, sider, basculante, prancha, tanque, cegonha, caçamba e carga seca, entre outras. Cada uma traz as perguntas certas para o anúncio.'),
            COMO_CONTRATAR,
        ],
    },
    {
        'slug': 'crm-para-loja-de-caminhoes',
        'nome': 'CRM para loja de caminhões',
        'titulo': 'CRM para loja de caminhões com WhatsApp | Via Pesados',
        'descricao': 'CRM para loja de caminhões: o WhatsApp de cada vendedor no sistema, funil de vendas '
                     'com valores e os contatos que procuram o caminhão que chegou.',
        'olho': 'CRM para loja de caminhões',
        'h1': 'O CRM da loja de caminhões, com o <span class="laranja">WhatsApp de cada vendedor</span>.',
        'sub': 'Toda conversa vira negociação, e nenhuma se perde quando o vendedor sai.',
        'figura': ('/conheca/img/crm-whatsapp.jpg', 2000, 1250,
                   'CRM do Via Pesados com o WhatsApp da equipe de uma loja de caminhões',
                   'Tela real do CRM, com os dados de uma loja de demonstração.'),
        'secoes': [
            {
                'h2': 'Atendimento de loja grande, <span class="laranja">com a equipe que você tem</span>.',
                'conversa': 'O vendedor responde com o caminhão certo num clique, e você vê cada negociação.',
                'cartoes': [
                    ('WhatsApp de cada vendedor', 'Cada um no próprio número, dentro do sistema. Conecta em 90 segundos, lendo um QR code.'),
                    ('Funil com o dinheiro do mês', 'Interessado, quente, fechando: cada etapa com o valor somado.'),
                    ('Fotos e ficha num clique', 'Fotos na ordem, ficha, preço e o link do site chegam sozinhos no WhatsApp do cliente.'),
                    ('Nada some quando o vendedor sai', 'As conversas ficam na loja, com etiqueta e histórico.'),
                ],
            },
            {
                'h2': 'O CRM que <span class="laranja">acha o comprador</span>.',
                'conversa': 'Chegou caminhão, ele mostra quem procura um igual. E avisa quem já está na hora de trocar.',
                'figura': ('/conheca/img/possiveis.jpg', 2000, 1250,
                           'Possíveis negociações: os contatos que procuram cada caminhão do pátio',
                           'Possíveis negociações, numa loja de demonstração.'),
                'cartoes': [
                    ('Possíveis negociações', 'Para cada caminhão do pátio, os contatos que procuram um igual, com o WhatsApp a um toque.'),
                    ('Recorrência', 'Quem comprou há meses e está na hora de trocar aparece antes de outra loja ligar.'),
                    ('Etiquetas automáticas', 'Quem chamou vira contato, já com etiquetas, sem ninguém digitar.'),
                    ('Venda perdida tem motivo', 'Quem perdeu, quanto valia e por quê, para não perder de novo.'),
                ],
            },
        ],
        'perguntas': [
            ('O que é um CRM para loja de caminhões?',
             'É onde ficam cada cliente, cada conversa e cada negociação da loja. No Via Pesados ele já vem com o WhatsApp da equipe e com o estoque, então o vendedor responde com o caminhão certo num clique.'),
            ('Preciso de outro número de WhatsApp?',
             'Não. Cada vendedor conecta o número que já usa, lendo um QR code.'),
            ('O dono acompanha as conversas da equipe?',
             'Acompanha. O administrador da loja vê as conversas da equipe, e cada vendedor vê só o que tem permissão para ver.'),
            COMO_CONTRATAR,
        ],
    },
    {
        'slug': 'site-para-loja-de-caminhao',
        'nome': 'Site para loja de caminhão',
        'titulo': 'Site para loja de caminhão, atualizado sozinho | Via Pesados',
        'descricao': 'Site para loja de caminhão com a sua marca, estoque atualizado sozinho, página por '
                     'caminhão e simulador de financiamento. Já vem no sistema.',
        'olho': 'Site para loja de caminhão',
        'h1': 'Um site para a sua loja de caminhão que <span class="laranja">se atualiza sozinho</span>.',
        'sub': 'Cadastrou, está no site. Vendeu, sai sozinho. E ele já vem no sistema: você não paga site à parte.',
        'figura': ('/conheca/img/site-itruck.jpg', 2000, 1116,
                   'Site da iTruck Caminhões, feito com o Via Pesados',
                   'Site real da iTruck Caminhões, de Governador Valadares, cliente Via Pesados.'),
        'secoes': [
            {
                'h2': 'Um site que <span class="laranja">vende 24 horas</span>.',
                'conversa': 'O cliente vê o estoque de verdade, simula a parcela e chama o vendedor certo.',
                'cartoes': [
                    ('A sua marca, não a nossa', 'Logo, cores, endereço e o WhatsApp da sua loja. A Via Pesados fica nos bastidores.'),
                    ('Estoque sempre certo', 'Cadastrou, apareceu. Vendeu, saiu. Ninguém liga perguntando de caminhão que já foi.'),
                    ('Uma página por caminhão', 'Fotos, ficha e preço num link só: o que o vendedor manda e o cliente repassa.'),
                    ('Financiamento na hora', 'Simulador em cada página: o cliente chega na conversa já sabendo a parcela.'),
                ],
            },
            {
                'h2': 'Feito para aparecer <span class="laranja">e para vender</span>.',
                'conversa': 'Cada caminhão com endereço próprio, pronto para o Google e para o WhatsApp.',
                'figura': ('/conheca/img/site-itruck-veiculo.jpg', 1600, 893,
                           'Página de um caminhão no site da iTruck Caminhões, com fotos, ficha e preço',
                           'Página do caminhão no site da iTruck Caminhões.'),
                'cartoes': [
                    ('Pronto para o Google', 'Cada caminhão com título, descrição e foto para a busca e para a prévia no WhatsApp.'),
                    ('Domínio próprio, com cadeado', 'O site abre no endereço da sua loja, com conexão segura.'),
                    ('Busca e filtros', 'O cliente filtra por tipo e por marca e acha o caminhão em segundos.'),
                    ('Quem somos e rota até o pátio', 'A foto da loja, o endereço, o horário e o caminho até o pátio.'),
                ],
            },
        ],
        'perguntas': [
            ('Preciso pagar o site à parte?',
             'Não. O site vem no sistema Via Pesados, junto com o estoque, os anúncios e o WhatsApp da equipe.'),
            ('Posso usar o domínio da minha loja?',
             'Pode. O site abre no endereço da sua loja, com conexão segura.'),
            ('Quem atualiza o site?',
             'Ninguém precisa: o site lê o estoque do sistema. Cadastrou, está no ar; vendeu, sai.'),
            COMO_CONTRATAR,
        ],
    },
    {
        'slug': 'anunciar-caminhao-no-mercado-livre',
        'nome': 'Anunciar caminhão no Mercado Livre',
        'titulo': 'Anunciar caminhão no Mercado Livre num clique | Via Pesados',
        'descricao': 'Anuncie caminhão, carreta e implemento no Mercado Livre, Instagram e Facebook num '
                     'clique, com ficha técnica e fotos, e o anúncio atualizado sozinho.',
        'olho': 'Anunciar caminhão no Mercado Livre',
        'h1': 'Anuncie caminhão no Mercado Livre <span class="laranja">num clique</span>.',
        'sub': 'E no Instagram, no Facebook e no site da loja ao mesmo tempo, pela conexão oficial de cada canal.',
        'canais': True,
        'secoes': [
            {
                'h2': 'Como funciona, <span class="laranja">do cadastro ao anúncio</span>.',
                'conversa': 'O que levava uma hora, digitando a mesma ficha em cada canal, agora é um clique.',
                'passos': True,
                'cartoes': [
                    ('Cadastre uma vez', 'Fotos, preço e a ficha técnica que o sistema pergunta para cada tipo de caminhão.'),
                    ('Escolha os canais', 'Mercado Livre, Instagram, Facebook e o site da loja.'),
                    ('Publique', 'O anúncio sai na conta da sua loja em cada canal, com a ficha completa.'),
                    ('Pronto: ele se atualiza', 'Baixou o preço ou entrou foto nova: o anúncio acompanha, sem ninguém editar.'),
                ],
            },
            {
                'h2': 'Por que anunciar <span class="laranja">pelo sistema</span>.',
                'conversa': 'Mais canais no ar, menos tempo digitando, e o comprador vê a ficha inteira.',
                'cartoes': [
                    ('Uma hora vira um clique', 'Sem copiar e colar a mesma ficha em cada canal.'),
                    ('Categoria certa', 'Caminhão, carreta e implemento na categoria própria de cada um no Mercado Livre.'),
                    ('Na conta da sua loja', 'O anúncio sai na sua conta, pela conexão oficial. A reputação e o histórico continuam seus.'),
                    ('Redes juntas', 'Post e story com a arte pronta no Instagram, e o catálogo do Facebook sempre em dia.'),
                ],
            },
        ],
        'perguntas': [
            ('Como anunciar caminhão no Mercado Livre?',
             'Pelo Via Pesados: cadastre o caminhão uma vez, com fotos e ficha, e publique num clique. Ele vai para a conta da sua loja no Mercado Livre, na categoria certa, e o anúncio se atualiza sozinho.'),
            ('Preciso ter conta no Mercado Livre?',
             'Sim, o anúncio sai na conta da sua loja. Você conecta a conta uma vez, pela autorização oficial do Mercado Livre.'),
            ('Dá para anunciar carreta e implemento?',
             'Dá. Carreta e implemento vão para a categoria própria deles no Mercado Livre, com a ficha de cada tipo.'),
            COMO_CONTRATAR,
        ],
    },
]

CANAIS = [
    ('mercadolibre.svg', 'Mercado Livre', 'Anúncio completo, com ficha e fotos'),
    ('instagram.svg', 'Instagram', 'Post e story com a arte pronta'),
    ('facebook.svg', 'Facebook', 'Página e catálogo em dia'),
    ('whatsapp.svg', 'WhatsApp', 'A ficha completa na conversa'),
]


def e(t):
    return html.escape(t, quote=True)


def zap(nome):
    texto = f'Olá! Vi a página "{nome}" do Via Pesados e quero marcar uma demonstração.'
    return f'https://wa.me/{ZAP_NUMERO}?text={quote(texto)}'


def figura(f, primeira=False):
    src, w, h, alt, legenda = f
    carga = 'fetchpriority="high"' if primeira else 'loading="lazy"'
    return (f'<figure class="tela"><img src="{src}" width="{w}" height="{h}" alt="{e(alt)}" {carga} decoding="async" />'
            f'<figcaption>{e(legenda)}</figcaption></figure>')


def pagina(p):
    url = f'{SITE}/{p["slug"]}'
    assert len(p['titulo']) <= 62, (p['slug'], len(p['titulo']))
    assert len(p['descricao']) <= 158, (p['slug'], len(p['descricao']))
    imagem = (SITE + p['figura'][0]) if p.get('figura') else f'{SITE}/conheca/img/crm-whatsapp.jpg'
    link_zap = zap(p['nome'])

    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Via Pesados', 'item': f'{SITE}/'},
            {'@type': 'ListItem', 'position': 2, 'name': p['nome'], 'item': url},
        ]},
        {'@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': r}}
            for q, r in p['perguntas']]},
    ]}

    secoes = []
    for s in p['secoes']:
        classe = 'cartoes passos' if s.get('passos') else 'cartoes'
        cartoes = '\n'.join(f'        <div class="cartao"><h3>{e(t)}</h3><p>{e(d)}</p></div>' for t, d in s['cartoes'])
        fig = ('\n    ' + figura(s['figura'])) if s.get('figura') else ''
        secoes.append(f'''<section class="secao">
  <div class="wrap">
    <div class="centrado">
      <h2>{s["h2"]}</h2>
      <p class="conversa">{e(s["conversa"])}</p>
    </div>{fig}
    <div class="{classe}">
{cartoes}
    </div>
  </div>
</section>''')

    perguntas = '\n'.join(f'''      <details class="pergunta">
        <summary>{e(q)}</summary>
        <p>{e(r)}</p>
      </details>''' for q, r in p['perguntas'])

    outras = '\n'.join(f'      <a class="outra" href="/{o["slug"]}"><b>{e(o["nome"])}</b><span>{e(o["sub"])}</span></a>'
                       for o in PAGINAS if o['slug'] != p['slug'])
    rodape = '\n'.join(f'      <a href="/{o["slug"]}">{e(o["nome"])}</a>' for o in PAGINAS)

    if p.get('figura'):
        vitrine = figura(p['figura'], primeira=True)
    else:
        chips = '\n'.join(f'      <li><img class="branco" src="/conheca/img/{i}" alt="" width="28" height="28" /><b>{e(n)}</b><span>{e(d)}</span></li>'
                          for i, n, d in CANAIS)
        vitrine = f'<ul class="canais" aria-label="Canais onde o anúncio sai">\n{chips}\n    </ul>'

    return f'''<!DOCTYPE html>
<!-- Gerado por scripts/gerar-paginas-seo.py: edite o conteúdo lá e rode de novo. -->
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{e(p["titulo"])}</title>
<meta name="description" content="{e(p["descricao"])}" />
<link rel="canonical" href="{url}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="{e(p["titulo"])}" />
<meta property="og:description" content="{e(p["descricao"])}" />
<meta property="og:url" content="{url}" />
<meta property="og:site_name" content="Via Pesados" />
<meta property="og:image" content="{imagem}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#060607" />
<link rel="icon" href="/favicon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/conheca/paginas.css" />
<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=1)}
</script>
</head>
<body>

<header class="topo">
  <a class="marca-topo" href="/" aria-label="Via Pesados, página inicial"><img src="/conheca/img/via-icon-white.png" alt="Via Pesados" width="72" height="44" /></a>
  <a class="btn-zap mini" href="{link_zap}" target="_blank" rel="noopener">{ZAP_SVG} Marcar demonstração</a>
</header>

<main>
<section class="heroi-pagina">
  <div class="wrap">
    <nav class="trilha" aria-label="Você está em"><a href="/">Via Pesados</a><span aria-hidden="true">›</span><span>{e(p["nome"])}</span></nav>
    <p class="olho">{e(p["olho"])}</p>
    <h1>{p["h1"]}</h1>
    <p class="sub">{e(p["sub"])}</p>
    <a class="btn-zap" href="{link_zap}" target="_blank" rel="noopener">{ZAP_SVG} Quero ver funcionando</a>
    {vitrine}
  </div>
</section>

{chr(10).join(secoes)}

<section class="secao">
  <div class="wrap">
    <div class="centrado">
      <p class="olho">Perguntas frequentes</p>
      <h2>O que o lojista pergunta <span class="laranja">antes de começar</span>.</h2>
    </div>
    <div class="perguntas">
{perguntas}
    </div>
  </div>
</section>

<section class="secao">
  <div class="wrap">
    <div class="centrado">
      <p class="olho">Também no Via Pesados</p>
      <h2>O mesmo sistema, <span class="laranja">do anúncio ao caixa</span>.</h2>
      <p class="conversa"><a class="link" href="/">Conheça o sistema inteiro</a>, ou veja cada parte:</p>
    </div>
    <div class="outras">
{outras}
    </div>
  </div>
</section>
</main>

<section class="cta-final">
  <div class="wrap">
    <img class="marca-cta" src="/conheca/img/via-icon-white.png" alt="" width="94" height="58" />
    <h2>Chega de perder venda por falta de tempo.</h2>
    <p>Quinze minutos no WhatsApp e você vê tudo isso rodando, com os seus caminhões, do seu jeito.</p>
    <a class="btn-zap gigante" href="{link_zap}" target="_blank" rel="noopener">{ZAP_SVG} Marcar demonstração no WhatsApp</a>
    <p class="mini-nota">Sem cartão, sem compromisso. Só uma conversa de quem entende de pesados.</p>
  </div>
</section>

<footer>
  <div class="wrap">
    <a href="/" aria-label="Via Pesados, página inicial"><img src="/conheca/img/via-icon-white.png" alt="Via Pesados" width="75" height="46" /></a>
    <p>Feito exclusivamente para o mercado de pesados · viapesados.com.br</p>
    <nav class="links-rodape" aria-label="Para a sua loja">
{rodape}
    </nav>
  </div>
</footer>

<a class="zap-flutuante" href="{link_zap}" target="_blank" rel="noopener" aria-label="Falar no WhatsApp">{ZAP_SVG}</a>

</body>
</html>
'''


def main():
    for p in PAGINAS:
        pasta = os.path.join(RAIZ, p['slug'])
        os.makedirs(pasta, exist_ok=True)
        with open(os.path.join(pasta, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(pagina(p))
        print('ok', p['slug'])


if __name__ == '__main__':
    main()
