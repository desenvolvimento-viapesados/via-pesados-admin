/**
 * O gestor do dono no número oficial (dono, 25/11/2026): as regras puras, que os testes
 * do painel conferem (src/lib/gestor.test.ts). O motor está em gestor.ts e a função em
 * gestor-responder.
 *
 * O dono escreve para o número oficial (o mesmo do Davi) e quem responde é um assistente
 * dele, não o Davi: conta o que aconteceu na prospecção, lê as conversas, mostra a agenda,
 * remarca e cancela reunião, liga e desliga o Davi numa conversa e, só quando ele pede,
 * manda mensagem a um lead.
 */

/** Uma reunião na agenda, como a regra de conflito precisa. */
export type ReuniaoNaAgenda = { id: string; scheduled_at: string; status: string; title?: string | null };

/** Meia-noite de hoje em Brasília (UTC−3), em UTC. `dias` volta dias inteiros. */
export function inicioDoDiaBRT(agora = new Date(), dias = 0): Date {
  const sp = new Date(agora.getTime() - 3 * 3_600_000);
  const meiaNoiteSP = Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate()) + 3 * 3_600_000;
  return new Date(meiaNoiteSP - dias * 86_400_000);
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "quinta, 26/11 às 10h30" (Brasília). */
export function quandoFalado(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  const h = d.getUTCMinutes() === 0 ? `${d.getUTCHours()}h` : `${d.getUTCHours()}h${p(d.getUTCMinutes())}`;
  return `${DIAS[d.getUTCDay()]}, ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} às ${h}`;
}

/** "25/11 18h04" (Brasília), para as linhas de conversa. */
export function horaCurta(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}h${p(d.getUTCMinutes())}`;
}

/**
 * O horário que a IA escreveu, em Date. Aceita ISO com fuso; sem fuso, é horário de
 * Brasília (é como o dono fala). Null se não for data.
 */
export function lerHorario(texto: string | null | undefined): Date | null {
  const t = String(texto ?? '').trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  if (m[6]) {
    const d = new Date(t.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, a, mes, dia, h, min] = m.map(Number) as unknown as number[];
  return new Date(Date.UTC(a, mes - 1, dia, h + 3, min));
}

/**
 * As reuniões que ficam a menos de `intervaloMin` do horário novo (a própria reunião e as
 * canceladas não contam). Entre uma reunião e outra fica 1 hora (dono, 25/11/2026).
 */
export function conflitosDaAgenda(inicio: Date, agenda: readonly ReuniaoNaAgenda[], ignorarId: string | null, intervaloMin = 60): ReuniaoNaAgenda[] {
  return agenda.filter((r) =>
    r.id !== ignorarId
    && !['cancelada', 'realizada', 'nao_compareceu'].includes(r.status)
    && Math.abs(new Date(r.scheduled_at).getTime() - inicio.getTime()) < intervaloMin * 60_000);
}

/** O id da conversa dentro da chave de um aviso (aviso_lead_crm:<destino>:<conversa>:<número>). */
export function conversaDaChave(chave: string | null | undefined): string | null {
  const m = String(chave ?? '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0].toLowerCase() : null;
}

/**
 * Corta a resposta em mensagens que o WhatsApp aceita (até ~3.500 caracteres cada),
 * quebrando em parágrafo; nunca no meio de uma palavra se der para evitar.
 */
export function partirMensagem(texto: string, max = 3500): string[] {
  const limpo = String(texto ?? '').trim();
  if (!limpo) return [];
  if (limpo.length <= max) return [limpo];
  const partes: string[] = [];
  let resto = limpo;
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n\n', max);
    if (corte < max * 0.4) corte = resto.lastIndexOf('\n', max);
    if (corte < max * 0.4) corte = resto.lastIndexOf(' ', max);
    if (corte < max * 0.4) corte = max;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

/** O que cada status da lista da prospecção quer dizer, na língua do dono. */
export const STATUS_DA_LOJA: Record<string, string> = {
  pronta: 'na fila, ainda não recebeu nada',
  em_contato: 'recebendo a sequência de mensagens, sem responder ainda',
  conversando: 'respondeu e está conversando com o Davi',
  com_voce: 'passou para você atender',
  sem_interesse: 'disse que não tem interesse',
  sem_resposta: 'terminou a sequência sem responder (ou pediu outro momento)',
  ja_conhecida: 'já era conhecida (cliente, amostra ou conversa anterior)',
  sem_whatsapp: 'o número não tem WhatsApp',
  descartada: 'tirada da lista',
};

/** O nome de cada mensagem da sequência da prospecção (tipo + número do envio). */
export function nomeDoEnvio(tipo: string, numero: number): string {
  if (tipo === 'contato' && numero === 1) return '1ª mensagem (a pergunta de abertura)';
  if (tipo === 'cadencia' && numero === 2) return '2ª mensagem (o vídeo)';
  if (tipo === 'cadencia') return `${numero}ª mensagem da sequência (acompanhamento)`;
  if (tipo === 'retomada') return 'retomada';
  return `${tipo} ${numero}`;
}

/** Taxa em "x de y (z%)". */
export function taxa(parte: number, total: number): string {
  if (!total) return `${parte} de 0`;
  return `${parte} de ${total} (${Math.round((parte / total) * 100)}%)`;
}
