const integer = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtInt = (n: number) => integer.format(Math.round(n));
export const fmt1 = (n: number) => oneDecimal.format(n);
export const fmtKm = (km: number | null) => (km == null ? '—' : `${twoDecimals.format(km)} km`);
export const fmtKcal = (kcal: number | null) => (kcal == null ? '—' : `${integer.format(Math.round(kcal))} kcal`);

/** "72,5" veya "72.5" gibi girişleri sayıya çevirir; geçersizse null. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
