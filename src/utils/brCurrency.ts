export const formatBRLInput = (value: string | number | null | undefined) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const amount = Number(digits) / 100;
  return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const parseBRLInput = (value: string | number | null | undefined) => {
  if (value == null) return null;
  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};
