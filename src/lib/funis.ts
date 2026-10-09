/* Os três funis do CRM. Cada prospect está em um (prospects.funil); o
   quadro mostra um de cada vez ou "Todos" juntos. O canal de aquisição
   (acquisition_channels) é o detalhe; o funil é o agrupamento. */

export type ChaveDoFunil = 'fria' | 'anuncios' | 'indicacao';

export const FUNIS: { chave: ChaveDoFunil; rotulo: string }[] = [
  { chave: 'fria', rotulo: 'Prospecção fria' },
  { chave: 'anuncios', rotulo: 'Anúncios' },
  { chave: 'indicacao', rotulo: 'Indicação' },
];

export const rotuloDoFunil = (chave: string | null | undefined) =>
  FUNIS.find((f) => f.chave === chave)?.rotulo ?? 'Prospecção fria';

export const ehFunil = (v: string | null | undefined): v is ChaveDoFunil =>
  FUNIS.some((f) => f.chave === v);

/* O funil que um canal sugere ao cadastrar (dá para trocar). */
export function funilDoCanal(slug: string | null | undefined): ChaveDoFunil {
  if (slug === 'indicacao') return 'indicacao';
  if (slug === 'instagram' || slug === 'google' || slug === 'site') return 'anuncios';
  return 'fria';
}
