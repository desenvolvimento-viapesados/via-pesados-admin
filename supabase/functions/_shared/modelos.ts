/* Os 11 modelos originais (mais os 5 da régua de suspensão, no fim), como estavam na WABA 2088077995129091 antes de a
   Meta desabilitá-la em 14/09/2026.
   
   Existem aqui porque template pertence a uma WABA e não migra junto com o
   número: trocar de conta é recriar os onze do zero. Foram lidos da Graph
   enquanto a conta ainda respondia — uma conta desabilitada em definitivo
   pode parar de responder, e aí o texto aprovado estaria perdido.

   Gerado a partir da conta real. Ao editar um modelo na Meta, atualize aqui
   também, senão a próxima migração ressuscita a versão velha. */
export type Componente = Record<string, unknown> & { type: string; __precisa_handle?: boolean };
export type Modelo = { name: string; language: string; category: string; components: Componente[] };

export const MODELOS: Modelo[] = [
 {
  "name": "acesso_equipe",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. Confirmamos a criação do seu usuário no sistema Via Pesados, solicitada pela {{2}}.\n\nO link abaixo abre o seu painel.",
    "example": {
     "body_text": [
      [
       "Rafael",
       "Minas Caminhões"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Abrir meu painel",
      "url": "https://viapesados.com.br/entrar/{{1}}",
      "example": [
       "https://viapesados.com.br/entrar/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "acesso_liberado",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. Confirmamos a ativação do plano contratado pela {{2}} com a Via Pesados.\n\nO acesso ao painel está liberado no link abaixo.",
    "example": {
     "body_text": [
      [
       "Kauã",
       "Minas Caminhões"
      ]
     ]
    }
   },
   {
    "type": "FOOTER",
    "text": "Qualquer dúvida, é só responder por aqui."
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Acessar o sistema",
      "url": "https://viapesados.com.br/lojista"
     }
    ]
   }
  ]
 },
 {
  "name": "cartao_recusado",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. Tentamos debitar a mensalidade de {{2}} no cartão cadastrado, e a operadora recusou a cobrança.\n\nNada foi cobrado. Pelo link abaixo você paga este mês com Pix, boleto ou outro cartão.",
    "example": {
     "body_text": [
      [
       "Kauã",
       "outubro"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Pagar de outra forma",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "cobranca_em_atraso",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. A mensalidade de {{2}}, no valor de {{3}}, venceu em {{4}} e ainda consta em aberto.\n\nSeu sistema segue no ar. Para regularizar é só usar o link abaixo — ou responder aqui, se houver algo a resolver.",
    "example": {
     "body_text": [
      [
       "Kauã",
       "outubro",
       "R$ 600,00",
       "15/10/2026"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Regularizar",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "cobranca_mensal_disponivel",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "HEADER",
    "format": "TEXT",
    "text": "Mensalidade de {{1}}",
    "example": {
     "header_text": [
      "outubro"
     ]
    }
   },
   {
    "type": "BODY",
    "text": "Olá, {{1}}. A mensalidade do sistema Via Pesados referente a {{2}} já está disponível: {{3}}, com vencimento em {{4}}.\n\nNo link abaixo você escolhe pagar com Pix, boleto ou cartão.",
    "example": {
     "body_text": [
      [
       "Kauã",
       "outubro",
       "R$ 600,00",
       "15/10/2026"
      ]
     ]
    }
   },
   {
    "type": "FOOTER",
    "text": "Via Pesados · Serviços Pesados"
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Pagar mensalidade",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "cobranca_vence_amanha",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Um lembrete, {{1}}: a mensalidade do sistema Via Pesados vence amanhã, {{2}}, no valor de {{3}}.\n\nNo link abaixo você paga com Pix, boleto ou cartão.",
    "example": {
     "body_text": [
      [
       "Kauã",
       "15/10",
       "R$ 600,00"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Pagar agora",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "nota_fiscal_emitida",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "HEADER",
    "format": "DOCUMENT",
    "__precisa_handle": true
   },
   {
    "type": "BODY",
    "text": "Olá, {{1}}. A nota fiscal da sua mensalidade Via Pesados referente a {{2}} foi emitida e segue em anexo.\n\nNota nº {{3}}, no valor de {{4}}.\n\nGuarde o arquivo para a sua contabilidade.",
    "example": {
     "body_text": [
      [
       "Rafael",
       "setembro",
       "00000001",
       "R$ 430,50"
      ]
     ]
    }
   },
   {
    "type": "FOOTER",
    "text": "Via Pesados"
   }
  ]
 },
 {
  "name": "pagamento_confirmado",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Recebemos o seu pagamento, {{1}}. A mensalidade de {{2}}, no valor de {{3}}, está confirmada.\n\nEm {{4}} a próxima cobrança chega por aqui.",
    "example": {
     "body_text": [
      [
       "Kauã",
       "outubro",
       "R$ 600,00",
       "15/11/2026"
      ]
     ]
    }
   }
  ]
 },
 {
  "name": "reuniao_confirmada",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Reunião confirmada, {{1}}. Nos falamos em {{2}}, às {{3}}, com {{4}}, da Via Pesados.\n\nSe precisar remarcar, é só responder esta mensagem.",
    "example": {
     "body_text": [
      [
       "Rafael",
       "quinta, 17/09",
       "14h30",
       "Kauã"
      ]
     ]
    }
   }
  ]
 },
 {
  "name": "reuniao_lembrete",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Um lembrete, {{1}}: sua reunião com {{2}}, da Via Pesados, é hoje às {{3}}.\n\nSe algo mudou na sua agenda, responda aqui que remarcamos sem problema.",
    "example": {
     "body_text": [
      [
       "Rafael",
       "Kauã",
       "14h30"
      ]
     ]
    }
   }
  ]
 },
 {
  "name": "whatsapp_desconectado",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Atenção, {{1}}: o WhatsApp da {{2}} caiu da conexão com o sistema, e as mensagens dos seus clientes deixaram de ser respondidas automaticamente.\n\nReligar leva menos de um minuto — é ler um QR Code na tela do link abaixo.",
    "example": {
     "body_text": [
      [
       "Kauã",
       "Minas Caminhões"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Reconectar agora",
      "url": "https://viapesados.com.br/lojista"
     }
    ]
   }
  ]
 },
 /* Régua de suspensão (09/10/2026): aviso de risco no dia seguinte ao vencimento,
    painel suspenso, os dois de reconquista (tempo e equipe) e a liberação. */
 {
  "name": "cobranca_risco_corte",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. A mensalidade de {{2}}, no valor de {{3}}, venceu em {{4}} e ainda está em aberto.\n\nVocê está correndo o risco de perder o painel e o site amanhã, {{5}}: sem eles, nada de cadastrar veículo, publicar nos canais, acompanhar as negociações da equipe ou receber clientes pelo site.\n\nPague pelo link abaixo. No Pix, leva segundos.",
    "example": {
     "body_text": [
      [
       "Walker",
       "outubro",
       "R$ 600,00",
       "14/10/2026",
       "17/10"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Pagar agora",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "loja_fora_do_ar",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. Como a mensalidade de {{2}} não foi paga, o painel e o site da {{3}} foram tirados do ar.\n\nNada foi apagado: veículos, clientes e negociações continuam guardados. Assim que o pagamento cair, tudo volta na hora.",
    "example": {
     "body_text": [
      [
       "Walker",
       "outubro",
       "iTruck Caminhões"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Pagar e reativar",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "painel_suspenso_tempo",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. Sem o painel, cada veículo novo precisa ser anunciado na mão: no Facebook, no Instagram e no Mercado Livre, um por um.\n\nCom o painel, é um cadastro só e ele sai em todos. Regularize e volte a anunciar em minutos.",
    "example": {
     "body_text": [
      [
       "Walker"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Regularizar",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "painel_suspenso_equipe",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. Sem o painel, sua equipe volta a trabalhar cada um no seu WhatsApp: ninguém vê quem atendeu quem, o que foi combinado nem em que pé está cada negociação.\n\nRegularize a mensalidade e a equipe volta a trabalhar junta, no mesmo lugar.",
    "example": {
     "body_text": [
      [
       "Walker"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Regularizar",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "painel_liberado",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Pronto, {{1}}: o pagamento foi confirmado e o painel da {{2}} já está liberado.\n\nÉ só entrar normalmente.",
    "example": {
     "body_text": [
      [
       "Walker",
       "iTruck Caminhões"
      ]
     ]
    }
   }
  ]
 },
 /* Conclusão da implantação (12/10/2026): o acesso é a última etapa, e esta mensagem
    leva o primeiro usuário a criar a senha. Até a Meta aprovar, sai o acesso_equipe. */
 {
  "name": "implantacao_concluida",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}! A implantação da {{2}} na Via Pesados está concluída, e está tudo pronto para vender:\n\n• Sistema de gestão configurado, com o estoque cadastrado\n• Site próprio no ar\n• Anúncios conectados aos canais de venda\n• Via CRM pronto para atender os seus clientes\n• Relatórios e financeiro para acompanhar os resultados\n\nToque no botão abaixo para criar a sua senha e acessar o painel. O link vale por 24 horas.",
    "example": {
     "body_text": [
      [
       "Walker",
       "iTruck Caminhões"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Criar minha senha",
      "url": "https://viapesados.com.br/entrar/{{1}}",
      "example": [
       "https://viapesados.com.br/entrar/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 /* Teste grátis (16/10/2026): começo, 5 dias antes, véspera, corte e
    reconquista. Cada um só sai depois de aprovado (modeloAprovado).
    O de começo dizia "são 30 dias"; quando o teste passou a 60 (23/10/2026)
    nasceu `teste_gratis_inicio`, que só diz até quando vai — a duração mora
    em DIAS_DE_TESTE, e mudar o número não pode exigir outra aprovação. */
 {
  "name": "teste_gratis_inicio",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}! O seu teste grátis do Via Pesados começou: o sistema completo, liberado até {{2}}.\n\nNesse período, cada veículo cadastrado sai em todos os canais de uma vez, e as conversas da equipe ficam num lugar só. Qualquer dúvida, é só responder esta mensagem.",
    "example": {
     "body_text": [
      [
       "Walker",
       "15/12/2026"
      ]
     ]
    }
   }
  ]
 },
 {
  "name": "teste_gratis_faltam_5_dias",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. Faltam 5 dias para o fim do seu teste grátis do Via Pesados, que vai até {{2}}.\n\nPara continuar sem interrupção, assine pelo botão abaixo. A primeira mensalidade só vence quando o teste terminar.",
    "example": {
     "body_text": [
      [
       "Walker",
       "15/11/2026"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Assinar o Via Pesados",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "teste_gratis_termina_amanha",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. O seu teste grátis do Via Pesados vai até amanhã, {{2}}. Depois disso, o painel e o site saem do ar até a assinatura; nada é apagado.\n\nPara não parar, assine pelo botão abaixo.",
    "example": {
     "body_text": [
      [
       "Walker",
       "15/11/2026"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Assinar o Via Pesados",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "teste_gratis_encerrado",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. O teste grátis da {{2}} no Via Pesados terminou em {{3}}, e o painel e o site saíram do ar.\n\nNada foi apagado: veículos, clientes e negociações continuam guardados. Assinando pelo botão abaixo, tudo volta na hora.",
    "example": {
     "body_text": [
      [
       "Walker",
       "iTruck Caminhões",
       "15/11/2026"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Assinar e reativar",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "teste_gratis_volte",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. Sem o painel, cada veículo novo volta a ser anunciado na mão: no Facebook, no Instagram e no Mercado Livre, um por um.\n\nCom o Via Pesados é um cadastro só, e ele sai em todos. Assine e volte a anunciar em minutos.",
    "example": {
     "body_text": [
      [
       "Walker"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Assinar",
      "url": "https://viapesados.com.br/bemvindo/{{1}}",
      "example": [
       "https://viapesados.com.br/bemvindo/exemplo123"
      ]
     }
    ]
   }
  ]
 },
 /* Esqueci minha senha (16/10/2026): o link de nova senha vai pelo WhatsApp, como
    toda comunicação com o lojista. Mesmo /entrar/{{1}} do primeiro acesso. */
 {
  "name": "redefinir_senha",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Olá, {{1}}. Recebemos um pedido para criar uma nova senha de acesso ao sistema da {{2}} na Via Pesados.\n\nToque no botão abaixo para criar a nova senha. O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu, é só ignorar esta mensagem.",
    "example": {
     "body_text": [
      [
       "Walker",
       "iTruck Caminhões"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Criar nova senha",
      "url": "https://viapesados.com.br/entrar/{{1}}",
      "example": [
       "https://viapesados.com.br/entrar/exemplo123"
      ]
     }
    ]
   }
  ]
 } ,
 /* Prospecção com o filme de produto (16/11/2026, texto do dono): o mesmo modelo serve para
    primeiro contato e para remarketing de quem não respondeu. Sem rodapé, só os dois botões
    ("Quero conhecer" e "Não tenho interesse"). Vídeo: logos/wa/prospeccao-v3.mp4 (filme de
    produto, H.264 Main sem B-frames, 4,9 MB). */
 {
  "name": "prospeccao_unico",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "HEADER",
    "format": "VIDEO",
    "example": {
     "header_url": [
      "https://ktjvyysqhsyvjmhumjly.supabase.co/storage/v1/object/public/logos/wa/prospeccao-v3.mp4"
     ]
    }
   },
   {
    "type": "BODY",
    "text": "O único sistema do Brasil feito para lojas de veículos pesados.\n\nAutomatize suas publicações com a Via Pesados: cadastre uma vez e publique em todos os canais."
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero conhecer"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 /* Prospecção pelo número oficial (10/11/2026, decisão do dono): UMA mensagem só por loja.
    O vídeo dele já faz o trabalho das três de antes (mostra o envio, diz que é o Via Pesados, fala
    da Black Friday e pede para responder); o texto precisa vender mesmo sem o play, porque no 4G
    o WhatsApp não baixa vídeo sozinho. Texto escolhido pelo dono, com o fecho dele ("O único
    sistema de gestão do Brasil, para lojas de veículos pesados", sem ponto, como ele escreveu).
    Quando o número é de um vendedor com nome no portal, sai com "Fala, <primeiro nome>!"
    (prospeccao_simples_nome). Botões: "Quero ver funcionando" (pedido de ver: o Davi convida
    direto para a demonstração) e "Não tenho interesse" (despedida e nada mais). Sem oferta e sem
    data no texto: a Black Friday está só no vídeo, e trocar o vídeo não pede aprovação nova (o
    que sai em cada envio é o VIDEO_DO_MODELO de prospeccao-regras.ts; aqui é só o exemplo). */
 {
  "name": "prospeccao_simples",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "HEADER",
    "format": "VIDEO",
    "example": {
     "header_url": [
      "https://ktjvyysqhsyvjmhumjly.supabase.co/storage/v1/object/public/logos/wa/prospeccao-v2.mp4"
     ]
    }
   },
   {
    "type": "BODY",
    "text": "Já imaginou atender seus clientes com essa facilidade? Foto, ficha e preço do veículo no WhatsApp dele, com um clique.\n\nO único sistema de gestão do Brasil, para lojas de veículos pesados"
   },
   {
    "type": "FOOTER",
    "text": "Xavier · Via Pesados"
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero ver funcionando"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 {
  "name": "prospeccao_simples_nome",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "HEADER",
    "format": "VIDEO",
    "example": {
     "header_url": [
      "https://ktjvyysqhsyvjmhumjly.supabase.co/storage/v1/object/public/logos/wa/prospeccao-v2.mp4"
     ]
    }
   },
   {
    "type": "BODY",
    "text": "Fala, {{1}}! Já imaginou atender seus clientes com essa facilidade? Foto, ficha e preço do veículo no WhatsApp dele, com um clique.\n\nO único sistema de gestão do Brasil, para lojas de veículos pesados",
    "example": {
     "body_text": [
      [
       "Marcelo"
      ]
     ]
    }
   },
   {
    "type": "FOOTER",
    "text": "Xavier · Via Pesados"
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero ver funcionando"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 /* RESERVA — não saem desde 10/11/2026 (a mensagem única acima tomou o lugar). Seguem aprovadas
    na Meta e ficam aqui para a conta nova recriar. Como eram:
    Prospecção pelo número oficial (06/11/2026, decisão do dono): TRÊS mensagens seguidas para
    cada loja da lista do portal, no jeito dele de falar, segundos uma depois da outra.
    1. O vídeo + "Imagina você que é vendedor de pesados, meu amigo, usando uma ferramenta
       dessa." Quando o número é de um vendedor com nome no portal, sai a versão com
       "Fala, <primeiro nome>!" (prospeccao_abertura_nome).
    2. A oferta: a loja "selecionada para a oferta especial de lançamento" — a de novembro
       (R$ 437 por mês com a implantação por nossa conta; o normal é R$ 587 + taxa). O texto só
       vale enquanto a oferta vale: depois de assistente_config.oferta_ate o prospeccao-enviar
       para sozinho. "e WhatsApp" na conexão oficial é escolha do dono (avisado de que o
       WhatsApp das conversas do lojista entra pelo QR e só o catálogo é oficial).
    3. O convite para a qualificação curta, com os botões: "Bora!" (o Davi se apresenta e
       pergunta o estoque e se é dono ou vendedor) e "Não tenho interesse" (despedida e nada mais).
    Cada uma é um modelo pago; a Meta pode segurar a 2ª ou a 3ª de quem já recebe muita
    propaganda (o dono escolheu assim, avisado). O vídeo do exemplo é o do v1; o que sai em cada
    envio é o VIDEO_DO_MODELO (prospeccao-regras.ts), e trocar o vídeo não pede aprovação nova.
    Os antigos ('prospeccao_lojista', com teste grátis) seguem aprovados na conta e não saem mais. */
 {
  "name": "prospeccao_abertura",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "HEADER",
    "format": "VIDEO",
    "example": {
     "header_url": [
      "https://ktjvyysqhsyvjmhumjly.supabase.co/storage/v1/object/public/logos/wa/prospeccao-v1.mp4"
     ]
    }
   },
   {
    "type": "BODY",
    "text": "Imagina você que é vendedor de pesados, meu amigo, usando uma ferramenta dessa."
   }
  ]
 } ,
 {
  "name": "prospeccao_abertura_nome",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "HEADER",
    "format": "VIDEO",
    "example": {
     "header_url": [
      "https://ktjvyysqhsyvjmhumjly.supabase.co/storage/v1/object/public/logos/wa/prospeccao-v1.mp4"
     ]
    }
   },
   {
    "type": "BODY",
    "text": "Fala, {{1}}! Imagina você que é vendedor de pesados, meu amigo, usando uma ferramenta dessa.",
    "example": {
     "body_text": [
      [
       "Marcelo"
      ]
     ]
    }
   }
  ]
 } ,
 {
  "name": "prospeccao_oferta",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "E a boa parte é que a {{1}} foi selecionada para a oferta especial de lançamento do Via Pesados, o único software do Brasil feito para veículos pesados, com conexão oficial do Mercado Livre, Facebook, Instagram e WhatsApp.",
    "example": {
     "body_text": [
      [
       "Minas Caminhões"
      ]
     ]
    }
   }
  ]
 } ,
 {
  "name": "prospeccao_cta",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "Bora ver como isso fica aí na sua loja? Me responde umas perguntinhas rápidas e eu já te mostro."
   },
   {
    "type": "FOOTER",
    "text": "Xavier · Via Pesados"
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Bora!"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 /* Aviso ao dono (09/11/2026): o Davi marcou ou remarcou uma reunião. Vai para o
    assistente_config.aviso_whatsapp; o botão abre a conversa no CRM. */
 {
  "name": "aviso_reuniao_marcada",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "O Davi {{1}} uma reunião pelo WhatsApp.\n\nLoja: {{2}}\nQuando: {{3}}\n\nO resumo da conversa fica no CRM.",
    "example": {
     "body_text": [
      [
       "marcou",
       "Minas Caminhões, Governador Valadares/MG",
       "segunda, 10/11, 9h"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Abrir a conversa",
      "url": "https://viapesados.com.br/admin/crm?tab=whatsapp&conversa={{1}}",
      "example": [
       "https://viapesados.com.br/admin/crm?tab=whatsapp&conversa=exemplo123"
      ]
     }
    ]
   }
  ]
 } ,
 /* Aviso ao dono (18/11/2026): alguém pediu contato pelo formulário da página de vendas
    (função lead-site). Vai para o assistente_config.aviso_whatsapp; o botão abre a aba Hoje do CRM,
    onde o pedido está no topo com o telefone para ligar. */
 {
  "name": "aviso_lead_novo",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Chegou um pedido de contato pelo site.\n\nLoja: {{1}}\nQuem pediu: {{2}}\nWhatsApp: {{3}}\n\nO pedido está no topo do CRM, esperando o primeiro contato.",
    "example": {
     "body_text": [
      [
       "Minas Caminhões, Governador Valadares/MG",
       "Carlos",
       "(33) 99999-0000"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "URL",
      "text": "Abrir o CRM",
      "url": "https://viapesados.com.br/admin/crm?tab=hoje"
     }
    ]
   }
  ]
 } ,
 /* Cadência da prospecção fria (playbook de 18/11/2026, textos aprovados pelo dono; marca no masculino: "o Via Pesados"). A demonstração
    é com "um especialista da nossa equipe" (dono, 18/11: sem o nome dele). Os vídeos de vendas e de
    relatórios ainda vão ser gravados. Os primeiros nomes (prospeccao_fria_*, lembrete_demonstracao,
    demonstracao_remarcar) foram à Meta no feminino e ficaram sem uso; estes os substituem: o exemplo é o filme; trocar o vídeo não pede aprovação nova. */
 {
  "name": "cadencia_canais",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "Oi! Aqui é o Davi, do Via Pesados. Uma pergunta rápida sobre a {{1}}: hoje vocês anunciam o mesmo {{2}} em quantos lugares?\n\nMercado Livre, Instagram, Facebook, site…\n\nCom o Via Pesados, você cadastra uma vez e ele sai em todos.",
    "example": {
     "body_text": [
      [
       "RB Caminhões",
       "caminhão"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero ver funcionando"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 {
  "name": "cadencia_vendas",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "HEADER",
    "format": "VIDEO",
    "example": {
     "header_url": [
      "https://ktjvyysqhsyvjmhumjly.supabase.co/storage/v1/object/public/logos/wa/prospeccao-v3.mp4"
     ]
    }
   },
   {
    "type": "BODY",
    "text": "Anunciar é metade. A venda acontece no atendimento.\n\nNo Via Pesados, o vendedor manda o fluxo de fotos do {{1}} num clique. Cada cliente fica salvo com etiquetas do que procura, e o sistema lembra quem chamar de novo, inclusive quando entra no pátio um parecido com o que ele queria.\n\nNenhum cliente esquecido na conversa.",
    "example": {
     "body_text": [
      [
       "caminhão"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero ver funcionando"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 {
  "name": "cadencia_vendeu",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "Quando um {{1}} é vendido aí na loja, quem tira o anúncio de cada lugar?\n\nNo Via Pesados, vendeu, o anúncio sai de todos os canais sozinho. Mudou o preço, muda em todos de uma vez.\n\nMenos tempo no celular, mais tempo vendendo.",
    "example": {
     "body_text": [
      [
       "caminhão"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero ver funcionando"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 {
  "name": "cadencia_atendimento",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "E no WhatsApp: quando o cliente pede foto, ficha e preço de um {{1}}, o vendedor acha na hora ou vai procurar na galeria?\n\nNo Via Pesados, vai tudo pro cliente num clique, direto do estoque.\n\nSe quem cuida disso aí é o dono, pode encaminhar pra ele 🙂",
    "example": {
     "body_text": [
      [
       "caminhão"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero ver funcionando"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 {
  "name": "cadencia_relatorios",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "HEADER",
    "format": "VIDEO",
    "example": {
     "header_url": [
      "https://ktjvyysqhsyvjmhumjly.supabase.co/storage/v1/object/public/logos/wa/prospeccao-v3.mp4"
     ]
    }
   },
   {
    "type": "BODY",
    "text": "Você sabe qual {{1}} mais vendeu na loja este ano? De qual marca, de qual modelo?\n\nNo Via Pesados, cada venda vira relatório na hora: o que mais vende por tipo, por marca e por modelo, e quanto deu de lucro.\n\nComprar o próximo fica mais fácil quando você sabe o que gira.",
    "example": {
     "body_text": [
      [
       "caminhão"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero ver funcionando"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 {
  "name": "cadencia_definicao",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "Toda loja que cresce chega numa hora em que fazer tudo à mão começa a segurar as vendas.\n\nSerá que essa hora já não chegou pra {{1}}?\n\nSão 15 minutos com um especialista da nossa equipe, por vídeo, pra você ver como fica.",
    "example": {
     "body_text": [
      [
       "RB Caminhões"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero conhecer"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Outro momento"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 {
  "name": "cadencia_encerramento",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "Vou parar de te chamar por aqui pra não insistir.\n\nSó deixo uma pergunta: daqui a um ano, a {{1}} quer estar trabalhando do mesmo jeito que hoje?\n\nNo dia que quiser automatizar e vender mais, é só responder essa mensagem: um especialista da nossa equipe te mostra em 15 minutos.",
    "example": {
     "body_text": [
      [
       "RB Caminhões"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero conhecer"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 {
  "name": "cadencia_retomada",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
   {
    "type": "BODY",
    "text": "Oi! Aqui é o Davi, do Via Pesados. Faz um tempo que te mandei o vídeo do Via Pesados.\n\nSeguimos sendo o único sistema do Brasil feito para lojas de veículos pesados, com conexão oficial ao Mercado Livre, Instagram e Facebook.\n\nBora ver como fica na {{1}}? São 15 minutos.",
    "example": {
     "body_text": [
      [
       "RB Caminhões"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero conhecer"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Não tenho interesse"
     }
    ]
   }
  ]
 } ,
 {
  "name": "demonstracao_lembrete",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Oi! Passando pra confirmar a demonstração do Via Pesados hoje às {{1}}, com um especialista da nossa equipe. Entre pelo link {{2}} na hora marcada.",
    "example": {
     "body_text": [
      [
       "15h",
       "https://meet.google.com/abc-defg-hij"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Confirmado"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Preciso remarcar"
     }
    ]
   }
  ]
 } ,
 {
  "name": "demonstracao_remarcacao",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
   {
    "type": "BODY",
    "text": "Oi! Não conseguimos nos ver às {{1}}. Quer remarcar a demonstração do Via Pesados? Continua em 15 minutos, direto no que importa pra sua loja.",
    "example": {
     "body_text": [
      [
       "15h"
      ]
     ]
    }
   },
   {
    "type": "BUTTONS",
    "buttons": [
     {
      "type": "QUICK_REPLY",
      "text": "Quero remarcar"
     },
     {
      "type": "QUICK_REPLY",
      "text": "Agora não"
     }
    ]
   }
  ]
 }
];
