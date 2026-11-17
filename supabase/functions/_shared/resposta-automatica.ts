/**
 * Resposta automática da loja (dono, 17/11/2026): muita loja da prospecção responde com a
 * saudação automática do WhatsApp Business ("E R Seminovos agradece seu contato. Como podemos
 * ajudar?"), com um menu ou com o robô de pré-atendimento dela ("Aqui é o Luís, assistente de
 * pré-atendimento…"). Isso NÃO é a loja respondendo:
 *
 *   - a loja não conta como "respondeu" nem anda no funil (status 'automatica');
 *   - o Davi não qualifica um robô: deixa UM recado curto para quem da equipe ler depois,
 *     dizendo o que é a Via Pesados e pedindo para passar a quem cuida dos anúncios;
 *   - robô respondendo de novo (ou depois que uma pessoa já falou, a mensagem de ausência):
 *     silêncio. Nunca robô conversando com robô.
 *
 * Quem decide é o texto, com uma ajuda do tempo: resposta que chega em segundos depois da
 * nossa e tem jeito de saudação é robô. Sem dúvida, sem IA (custo zero e sempre igual).
 * Exemplos reais em src/lib/respostaAutomatica.test.ts.
 */

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Um destes já basta: frase que pessoa não escreve. */
const FORTES: RegExp[] = [
  /\bagradece (o |pelo )?(seu )?contato\b/,                         // saudação padrão do WhatsApp Business
  /\bagradecemos (o |pelo |a )?(seu |sua )?(contato|mensagem|preferencia)\b/,
  /\b(mensagem|resposta|atendimento) automatic[oa]\b/,
  /\b(assistente|atendente) (virtual|digital|automatic[oa])\b/,
  /\bpre[- ]?atendimento\b/,
  /\bseja (muito )?bem[- ]?vind[oa]/,
  /\b(um|uma|algum|alguma) de nossos (consultores|vendedores|atendentes|especialistas)\b/,
  /\b(um|nosso|nossa) (consultor|consultora|vendedor|vendedora|atendente|especialista)\b[^.!?]{0,40}\b(entrara|ira|vai) (em contato|te atender|retornar|falar)/,
  /\b(retornaremos|responderemos|entraremos em contato|retornamos (o|seu) contato)\b/,
  /\b(em breve|assim que possivel|o mais breve possivel)\b[^.!?]{0,60}\b(retorn|respond|atend|contato)/,
  /\b(nosso horario de atendimento|fora do (nosso )?horario( de atendimento)?|estamos (fechados|ausentes|fora))\b/,
  /\b(digite|escolha|selecione|responda com) (o numero|uma opcao|a opcao|uma das opcoes)\b/,
  /\blgpd\b/,
  /\b(ja )?passei (a conversa|seu contato|voce|o contato) para\b/,
  /\bacesse (o |ao |nosso )?(link|site|catalogo|instagram)\b/,
];

/** Sinais fracos: dois juntos, ou um com resposta em segundos, viram robô. */
const FRACOS: RegExp[] = [
  /\b(como|em que) (podemos|posso) (te |lhe )?(ajudar|ser util)\b/,
  /\b(me conte|me diga|nos conte|informe|conte pra gente) (o que|qual)\b/,
  /^(ola|oi|bom dia|boa tarde|boa noite)\b.{0,40}\b(aqui e|sou|somos|meu nome e)\b/,
  /\bsomos (a|o) \*?[a-z]/,
  /\b(estou|estamos) a disposicao\b/,
];

/** Quantos segundos depois da nossa mensagem ainda é "na hora" (resposta programada). */
export const SEGUNDOS_DE_RESPOSTA_PROGRAMADA = 60;

export function pareceRespostaAutomatica(texto: string | null | undefined, segundosDepoisDaNossa?: number | null): boolean {
  const bruto = String(texto ?? '');
  if (!bruto.trim() || bruto.startsWith('[')) return false; // [audio], [imagem]: pessoa (ou não dá pra saber)
  /* A saudação do WhatsApp Business chega com a marca invisível de direção de texto na frente. */
  if (/^‎/.test(bruto) && /agradece/i.test(bruto)) return true;
  const t = norm(bruto.replace(/‎/g, ''));
  if (t.length < 25) return false; // "Como funciona", "Quero conhecer", "30", "Dono": pessoa
  if (FORTES.some((r) => r.test(t))) return true;
  const fracos = FRACOS.filter((r) => r.test(t)).length;
  const naHora = segundosDepoisDaNossa != null && segundosDepoisDaNossa >= 0 && segundosDepoisDaNossa <= SEGUNDOS_DE_RESPOSTA_PROGRAMADA;
  /* Textão com negrito ou emoji, chegando em segundos, também é robô. */
  const vitrine = t.length > 140 && (/\*[^*]+\*/.test(bruto) || /\p{Extended_Pictographic}/u.test(bruto));
  return fracos >= 2 || (naHora && (fracos >= 1 || vitrine));
}

/* ── o recado para a equipe da loja ─────────────────────────────── */

/** Por este pedaço o código sabe que o recado já foi (não repete). */
export const MARCA_DO_RECADO = 'Quando alguém da equipe puder ler';

/**
 * Um balão só, para a pessoa que abrir a conversa depois do robô (quase sempre um vendedor):
 * diz o que é, promete tempo e venda, pede para passar a quem cuida dos anúncios e deixa a
 * resposta fácil ("quero conhecer", o mesmo do botão).
 */
export const RECADO_PARA_A_EQUIPE =
  `Oi! Caiu na resposta automática de vocês 🙂 ${MARCA_DO_RECADO}: aqui é o Davi, atendente virtual da Via Pesados.\n\n`
  + 'A gente faz o sistema que publica o caminhão da loja no *Mercado Livre, Instagram e Facebook* com um cadastro só, e tira de todos quando vende.\n\n'
  + 'Se não for com você, pode passar pra quem cuida dos anúncios? Pra ver funcionando na sua loja, é só responder *quero conhecer*.';

type Msg = { direcao: string; conteudo: string | null; created_at: string };

export type LeituraDoRobo = {
  /** Tudo o que chegou depois da nossa última mensagem é robô (e chegou alguma coisa). */
  novasSaoRobo: boolean;
  /** Alguma vez uma pessoa escreveu nesta conversa. */
  humanoJaFalou: boolean;
  /** O recado para a equipe já foi mandado. */
  recadoJaFoi: boolean;
};

/** Lê a conversa inteira: cada entrada é julgada com o tempo desde a nossa mensagem anterior a ela. */
export function lerRespostasAutomaticas(msgs: Msg[]): LeituraDoRobo {
  let ultimaSaida: number | null = null;
  let humanoJaFalou = false, recadoJaFoi = false;
  let novas = 0, novasRobo = 0;
  for (const m of msgs) {
    const em = new Date(m.created_at).getTime();
    if (m.direcao === 'saida') {
      ultimaSaida = em; novas = 0; novasRobo = 0;
      if ((m.conteudo ?? '').includes(MARCA_DO_RECADO)) recadoJaFoi = true;
      continue;
    }
    if (m.direcao !== 'entrada') continue;
    const robo = pareceRespostaAutomatica(m.conteudo, ultimaSaida == null ? null : (em - ultimaSaida) / 1000);
    novas++;
    if (robo) novasRobo++; else humanoJaFalou = true;
  }
  return { novasSaoRobo: novas > 0 && novasRobo === novas, humanoJaFalou, recadoJaFoi };
}
