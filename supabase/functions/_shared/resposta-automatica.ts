/**
 * Resposta automática da loja (dono, 17/11/2026): muita loja da prospecção responde com a
 * saudação automática do WhatsApp Business ("E R Seminovos agradece seu contato. Como podemos
 * ajudar?"), com um menu ou com o robô de pré-atendimento dela ("Aqui é o Luís, assistente de
 * pré-atendimento…"). Isso NÃO é a loja respondendo:
 *
 *   - a loja não respondeu: fica "sem resposta" e não anda no funil (nada de coluna nova);
 *   - o Davi não qualifica um robô: deixa UM recado curto para quem da equipe ler depois;
 *   - passadas HORAS_ATE_O_LEMBRETE sem ninguém, e ainda dentro das 24h que o WhatsApp dá
 *     depois da última mensagem da loja, UM lembrete curto, para a conversa subir de novo;
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

/* ── o recado e o lembrete ───────────────────────────────────────── */

/** Por este pedaço o código sabe que o recado já foi (não repete). */
export const MARCA_DO_RECADO = 'Somos o único sistema do país feito para lojas de veículos pesados';
/** Por este pedaço o código sabe que o lembrete já foi. */
export const MARCA_DO_LEMBRETE = 'Passando aqui de novo';

/** Dono, 17/11/2026: simples. Quem é, o que é, e a resposta fácil (o mesmo do botão). */
export const RECADO_PARA_A_EQUIPE =
  `Oi! Aqui é o Davi, atendente da Via Pesados. ${MARCA_DO_RECADO}. `
  + 'O único com conexões oficiais para *Mercado Livre, Instagram e Facebook*. Pra ver funcionando na sua loja, é só responder *quero conhecer*.';

/** Horas depois do recado, sem ninguém responder, para o lembrete sair (dentro das 24h). */
export const HORAS_ATE_O_LEMBRETE = 4;
/** Margem antes de a janela de 24h do WhatsApp fechar. */
const HORAS_DA_JANELA = 23;

export const LEMBRETE_PARA_A_EQUIPE =
  `${MARCA_DO_LEMBRETE} 🙂 Conseguiu ver a mensagem acima? É só responder *quero conhecer* que o Xavier te mostra em 15 minutos.`;

type Msg = { direcao: string; conteudo: string | null; created_at: string };

export type LeituraDoRobo = {
  /** Tudo o que chegou depois da nossa última mensagem é robô (e chegou alguma coisa). */
  novasSaoRobo: boolean;
  /** Alguma vez uma pessoa escreveu nesta conversa. */
  humanoJaFalou: boolean;
  /** O recado para a equipe já foi mandado (e quando). */
  recadoJaFoi: boolean;
  recadoEm: string | null;
  lembreteJaFoi: boolean;
  /** A última mensagem da loja (robô ou não): é dela que contam as 24h do WhatsApp. */
  ultimaEntradaEm: string | null;
};

/** Lê a conversa inteira: cada entrada é julgada com o tempo desde a nossa mensagem anterior a ela. */
export function lerRespostasAutomaticas(msgs: Msg[]): LeituraDoRobo {
  let ultimaSaida: number | null = null;
  let humanoJaFalou = false, recadoEm: string | null = null, lembreteJaFoi = false, ultimaEntradaEm: string | null = null;
  let novas = 0, novasRobo = 0;
  for (const m of msgs) {
    const em = new Date(m.created_at).getTime();
    if (m.direcao === 'saida') {
      ultimaSaida = em; novas = 0; novasRobo = 0;
      const t = m.conteudo ?? '';
      if (t.includes(MARCA_DO_RECADO) && t.includes('quero conhecer') && !recadoEm) recadoEm = m.created_at;
      if (t.startsWith(MARCA_DO_LEMBRETE)) lembreteJaFoi = true;
      continue;
    }
    if (m.direcao !== 'entrada') continue;
    ultimaEntradaEm = m.created_at;
    const robo = pareceRespostaAutomatica(m.conteudo, ultimaSaida == null ? null : (em - ultimaSaida) / 1000);
    novas++;
    if (robo) novasRobo++; else humanoJaFalou = true;
  }
  return { novasSaoRobo: novas > 0 && novasRobo === novas, humanoJaFalou, recadoJaFoi: !!recadoEm, recadoEm, lembreteJaFoi, ultimaEntradaEm };
}

/**
 * Hora do lembrete? Recado mandado há HORAS_ATE_O_LEMBRETE ou mais, ninguém (gente) respondeu,
 * lembrete ainda não foi, e a janela de 24h desde a última mensagem da loja segue aberta.
 * O horário das 08h–20h é conferido por quem manda.
 */
export function horaDoLembrete(l: LeituraDoRobo, agora = new Date()): boolean {
  if (!l.recadoEm || l.lembreteJaFoi || l.humanoJaFalou || !l.ultimaEntradaEm) return false;
  const h = (iso: string) => (agora.getTime() - new Date(iso).getTime()) / 3_600_000;
  return h(l.recadoEm) >= HORAS_ATE_O_LEMBRETE && h(l.ultimaEntradaEm) < HORAS_DA_JANELA;
}
