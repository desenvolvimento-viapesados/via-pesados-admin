import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { definirFrente, frenteAtual, type Frente } from '@/lib/frente';

type Valor = { frente: Frente; trocar: (f: Frente) => Promise<void> };

const Ctx = createContext<Valor | null>(null);

/**
 * A frente em que o painel está, para as telas. O cabeçalho que o banco lê
 * sai de lib/frente.ts; este contexto só avisa a tela que mudou.
 *
 * Trocar de frente apaga o cache inteiro do react-query: as chaves das
 * consultas não carregam a frente (['clients'], ['payments', 'all']…), e
 * sem apagar, a lista de Lojistas apareceria na tela de Transportadoras até
 * a próxima busca. O App remonta as telas pela frente, então nenhuma
 * consulta antiga sobrevive à troca.
 */
export function FrenteProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [frente, setFrente] = useState<Frente>(frenteAtual);

  const trocar = useCallback(async (f: Frente) => {
    if (f === frenteAtual()) return;
    // Pedido em voo com a frente antiga não pode cair no cache da nova.
    await qc.cancelQueries();
    definirFrente(f);
    qc.clear();
    setFrente(f);
  }, [qc]);

  return <Ctx.Provider value={{ frente, trocar }}>{children}</Ctx.Provider>;
}

export function useFrente() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFrente fora do FrenteProvider');
  return v;
}
