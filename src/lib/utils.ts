import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
};
