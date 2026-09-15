/* Os 11 modelos aprovados, como estavam na WABA 2088077995129091 antes de a
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
 }
];
