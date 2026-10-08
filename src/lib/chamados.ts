/* O prazo de cada chamado, pela prioridade, contado da abertura.

   Prazo é para RESOLVER (status "resolvido"), não para a primeira resposta:
   é o que o cliente sente. "Aguardando" (esperando o cliente) não para o
   relógio — a pessoa da equipe é quem decide quando cobrar o retorno. */

export type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente';

export const PRAZO_EM_HORAS: Record<Prioridade, number> = {
  urgente: 4,
  alta: 24,
  media: 72,
  baixa: 168,
};

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa',
};

export const ROTULO_STATUS: Record<string, string> = {
  aberto: 'Aberto', em_andamento: 'Em andamento', aguardando: 'Aguardando cliente', resolvido: 'Resolvido',
};

export type EstadoDoPrazo = 'no_prazo' | 'perto' | 'estourado' | 'resolvido';

export interface Prazo {
  estado: EstadoDoPrazo;
  venceEm: Date;
  texto: string;
}

const h = 60 * 60 * 1000;

function duracao(ms: number): string {
  if (Math.abs(ms) < h) return 'menos de 1h';
  const horas = Math.round(Math.abs(ms) / h);
  if (horas < 48) return `${horas}h`;
  const dias = Math.round(horas / 24);
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

export function prazoDoChamado(
  t: { priority: Prioridade; status: string; created_at: string; resolved_at?: string | null },
  agora: Date = new Date(),
): Prazo {
  const venceEm = new Date(Date.parse(t.created_at) + PRAZO_EM_HORAS[t.priority] * h);
  if (t.status === 'resolvido') {
    const quando = t.resolved_at ? Date.parse(t.resolved_at) : agora.getTime();
    const dentro = quando <= venceEm.getTime();
    return { estado: 'resolvido', venceEm, texto: dentro ? 'resolvido no prazo' : `resolvido com ${duracao(quando - venceEm.getTime())} de atraso` };
  }
  const falta = venceEm.getTime() - agora.getTime();
  if (falta < 0) return { estado: 'estourado', venceEm, texto: `atrasado há ${duracao(falta)}` };
  // "Perto": no último quarto do prazo.
  const perto = falta <= PRAZO_EM_HORAS[t.priority] * h * 0.25;
  return { estado: perto ? 'perto' : 'no_prazo', venceEm, texto: `vence em ${duracao(falta)}` };
}

/** Ordem da lista: estourado primeiro, depois o que vence antes. Resolvidos no fim. */
export function ordenarChamados<T extends { priority: Prioridade; status: string; created_at: string; resolved_at?: string | null }>(
  lista: T[], agora: Date = new Date(),
): T[] {
  return [...lista].sort((a, b) => {
    const ra = a.status === 'resolvido' ? 1 : 0;
    const rb = b.status === 'resolvido' ? 1 : 0;
    if (ra !== rb) return ra - rb;
    if (ra === 1) return Date.parse(b.resolved_at ?? b.created_at) - Date.parse(a.resolved_at ?? a.created_at);
    return prazoDoChamado(a, agora).venceEm.getTime() - prazoDoChamado(b, agora).venceEm.getTime();
  });
}
