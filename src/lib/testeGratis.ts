/* O teste grátis para gente ler: em que dia está, quanto falta e o que a
   tela mostra. As contas são as da rotina (supabase/functions/_shared/teste.ts). */
import {
  DIAS_DE_TESTE, diaDoTeste, diasRestantes, diaDoCorte, acabou,
} from '../../supabase/functions/_shared/teste';
import { hojeBRT } from '../../supabase/functions/_shared/regua';
import type { TesteGratis } from '@/hooks/useTesteGratis';

export type Tom = 'neutro' | 'bom' | 'atencao' | 'alerta' | 'apagado';

export type SituacaoDoTeste = {
  rotulo: string;
  tom: Tom;
  /** 0 a 1 — quanto do teste já passou. */
  progresso: number;
  /** "Dia 12 de 30", "Começa na implantação", "Assinou em 10/11"… */
  linha: string;
  /** Dias de acesso que ainda restam (só em teste). */
  restantes: number | null;
  /** Termina em até 5 dias — é aqui que o vendedor tem de estar. */
  reta_final: boolean;
};

export const dataCurta = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '—';

export function situacaoDoTeste(t: TesteGratis, hoje = hojeBRT()): SituacaoDoTeste {
  const total = DIAS_DE_TESTE + (t.dias_extras ?? 0);
  if (t.status === 'convertido') {
    return { rotulo: 'Assinou', tom: 'bom', progresso: 1, linha: `Assinou em ${dataCurta(t.convertido_em)}`, restantes: null, reta_final: false };
  }
  if (t.status === 'cancelado') {
    return { rotulo: 'Cancelado', tom: 'apagado', progresso: 0, linha: 'Teste cancelado', restantes: null, reta_final: false };
  }
  if (t.status === 'aguardando_implantacao' || !t.inicio || !t.fim) {
    return { rotulo: 'Implantando', tom: 'neutro', progresso: 0, linha: 'Os 30 dias começam no aviso de acesso', restantes: null, reta_final: false };
  }
  if (t.status === 'encerrado' || acabou(t.fim, hoje)) {
    return {
      rotulo: 'Encerrado', tom: 'alerta', progresso: 1,
      linha: `Acabou em ${dataCurta(t.fim)} — fora do ar desde ${dataCurta(diaDoCorte(t.fim))}`,
      restantes: 0, reta_final: false,
    };
  }
  const dia = Math.min(total, Math.max(1, diaDoTeste(t.inicio, hoje)));
  const restantes = diasRestantes(t.fim, hoje);
  const reta = restantes <= 5;
  return {
    rotulo: reta ? (restantes === 1 ? 'Último dia' : `Faltam ${restantes} dias`) : 'Em teste',
    tom: reta ? 'atencao' : 'neutro',
    progresso: Math.min(1, dia / total),
    linha: `Dia ${dia} de ${total} · até ${dataCurta(t.fim)}`,
    restantes,
    reta_final: reta,
  };
}

/** Conversão: dos testes que terminaram (assinaram ou não), quantos assinaram. */
export function taxaDeConversao(testes: TesteGratis[]) {
  const decididos = testes.filter((t) => t.status === 'convertido' || t.status === 'encerrado');
  const assinaram = decididos.filter((t) => t.status === 'convertido').length;
  return { decididos: decididos.length, assinaram, taxa: decididos.length ? assinaram / decididos.length : null };
}

/** Quantos dias, do início do teste, até assinar. */
export function diasAteAssinar(testes: TesteGratis[]) {
  const ds = testes
    .filter((t) => t.status === 'convertido' && t.inicio && t.convertido_em)
    .map((t) => Math.max(0, diaDoTeste(t.inicio!, t.convertido_em!.slice(0, 10)) - 1));
  return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
}
