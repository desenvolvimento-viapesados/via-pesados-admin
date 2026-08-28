import { useCallback, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

/* Store de módulo, não estado por componente.
   Com `useState` cada chamada de useTheme() criava um tema próprio: o Layout
   monta uma vez e nunca desmonta, então ao trocar o tema pelo botão da Home
   ele ficava preso no valor antigo e servia a logo PRETA sobre fundo escuro
   em /clientes, /pagamentos, /financeiro, /tickets, /equipe e /relatorios —
   só um F5 corrigia. Uma fonte única resolve para todos os assinantes. */

const CHAVE = 'vpa-theme';

const inicial = (): Theme => {
  if (typeof window === 'undefined') return 'light';
  const guardado = localStorage.getItem(CHAVE) as Theme | null;
  if (guardado === 'light' || guardado === 'dark') return guardado;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

let tema: Theme = inicial();
const assinantes = new Set<() => void>();

const aplicar = (t: Theme) => {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(t);
  localStorage.setItem(CHAVE, t);
};

// Pinta antes do primeiro render para não haver piscada de tema errado.
if (typeof window !== 'undefined') aplicar(tema);

const definir = (t: Theme) => {
  if (t === tema) return;
  tema = t;
  aplicar(t);
  assinantes.forEach((fn) => fn());
};

const assinar = (fn: () => void) => {
  assinantes.add(fn);
  return () => { assinantes.delete(fn); };
};

export function useTheme() {
  const theme = useSyncExternalStore(assinar, () => tema, () => 'light' as Theme);
  const toggleTheme = useCallback(() => definir(tema === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggleTheme };
}
