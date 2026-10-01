import type { Natureza } from '@/lib/metricas';
import { cicloDaData } from '@/lib/okr';

/**
 * Como a meta do mês responde à do trimestre.
 *
 * A regra muda com a natureza da métrica, e é o erro que quase toda
 * planilha de metas comete:
 *
 *   FLUXO    soma. Novos clientes de outubro + novembro + dezembro é o
 *            que entrou no trimestre. Recebido, vendas, reuniões idem.
 *   ESTOQUE  NÃO soma. O MRR de dezembro É o MRR do trimestre — somar os
 *            três meses daria três vezes o mesmo dinheiro. O que vale é
 *            o último degrau: onde se quer estar no fim.
 *
 * Confundir as duas é como somar o saldo da conta todo mês e achar que
 * ficou rico.
 */

export type MetaFilha = { id: string; inicio: string; fim: string; alvo: number };

export type Conferencia = {
  natureza: Natureza;
  /** O que os filhos prometem, pela regra da natureza. */
  prometido: number;
  alvoDoPai: number;
  /** Positivo = os filhos prometem MAIS que o pai. */
  diferenca: number;
  bate: boolean;
  /** Em uma frase, pronta para a tela. */
  texto: string;
};

const quase = (a: number, b: number) => Math.abs(a - b) < Math.max(1e-6, Math.abs(b) * 0.001);

const brl = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

/**
 * Os filhos cobrem o pai?
 *
 * Em fluxo, prometido é a soma; em estoque, o alvo do filho que termina
 * por último — os do meio são degraus, e um degrau abaixo do alvo final
 * não é erro.
 */
export function conferirCascata(
  natureza: Natureza, alvoDoPai: number, filhos: MetaFilha[],
): Conferencia {
  const prometido = natureza === 'fluxo'
    ? filhos.reduce((s, f) => s + Number(f.alvo ?? 0), 0)
    : ([...filhos].sort((a, b) => a.fim.localeCompare(b.fim)).at(-1)?.alvo ?? 0);
  const diferenca = prometido - alvoDoPai;
  const bate = quase(prometido, alvoDoPai);

  const texto = !filhos.length
    ? 'Nenhum desdobramento ainda.'
    : bate
      ? (natureza === 'fluxo'
        ? `As ${filhos.length} partes somam exatamente a meta.`
        : 'O último degrau chega na meta.')
      : natureza === 'fluxo'
        ? (diferenca < 0
          ? `As partes somam ${brl(prometido)} — faltam ${brl(-diferenca)} para a meta.`
          : `As partes somam ${brl(prometido)}, ${brl(diferenca)} acima da meta.`)
        : (diferenca < 0
          ? `O último degrau para em ${brl(prometido)} — ${brl(-diferenca)} abaixo da meta.`
          : `O último degrau passa da meta em ${brl(diferenca)}.`);

  return { natureza, prometido, alvoDoPai, diferenca, bate, texto };
}

export type Pedaco = { tipo: 'mes' | 'trimestre'; inicio: string; fim: string; rotulo: string };

/**
 * Em que pedaços um período se divide.
 *
 * Ano vira quatro trimestres; trimestre e qualquer período livre viram
 * meses. É o corte que as pessoas usam para conversar sobre o caminho.
 */
export function pedacosDe(inicio: string, fim: string, tipoDoPai: string): Pedaco[] {
  const emTrimestres = tipoDoPai === 'ano' || tipoDoPai === 'cinco_anos';
  const d = new Date(`${inicio.slice(0, 10)}T12:00:00`);
  const limite = new Date(`${fim.slice(0, 10)}T12:00:00`);
  const saida: Pedaco[] = [];
  /* Teto de segurança: cinco anos em meses são 60, e um período maluco
     não devia gerar mil linhas. */
  while (d <= limite && saida.length < 60) {
    const c = cicloDaData(emTrimestres ? 'trimestre' : 'mes', d);
    saida.push({ tipo: emTrimestres ? 'trimestre' : 'mes', inicio: c.inicio, fim: c.fim, rotulo: c.rotulo });
    d.setMonth(d.getMonth() + (emTrimestres ? 3 : 1));
    d.setDate(1);
  }
  return saida;
}

/**
 * A sugestão de desdobramento.
 *
 * Fluxo divide o que falta em partes iguais — o resto da divisão vai
 * para a última, senão a soma fica centavos abaixo e a tela acusa
 * diferença onde não há.
 *
 * Estoque faz degraus: cada pedaço avança um passo da partida até o
 * alvo, e o último pedaço é o próprio alvo.
 */
export function sugerirDesdobramento(
  natureza: Natureza, partida: number, alvo: number, pedacos: Pedaco[],
): number[] {
  const n = pedacos.length;
  if (n === 0) return [];
  if (natureza === 'estoque') {
    const passo = (alvo - partida) / n;
    return pedacos.map((_, i) => (i === n - 1 ? alvo : Math.round((partida + passo * (i + 1)) * 100) / 100));
  }
  const total = alvo - partida;
  const parte = Math.round((total / n) * 100) / 100;
  return pedacos.map((_, i) => (i === n - 1
    ? Math.round((total - parte * (n - 1)) * 100) / 100
    : parte));
}
