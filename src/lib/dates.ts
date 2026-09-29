/**
 * "YYYY-MM-DD" gün anahtarları üzerinde saat diliminden bağımsız takvim işlemleri.
 * Bugünün hangi gün olduğunu her zaman yerel modül söyler (telefonun saat dilimine göre); burada yalnızca
 * takvim aritmetiği yapılır. UTC kullanılır ki yaz saati geçişleri gün eklemeyi bozmasın.
 */

export function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

function toKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function utc(key: string): Date {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(key: string, days: number): string {
  const date = utc(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

/** b − a, gün olarak (b sonraysa pozitif). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}

/** Pazartesi = 0 ... Pazar = 6 */
export function weekdayMondayFirst(key: string): number {
  return (utc(key).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: string): string {
  return addDays(key, -weekdayMondayFirst(key));
}

export function monthKey(key: string): string {
  return key.slice(0, 7);
}

export function firstOfMonth(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function addMonths(key: string, months: number): string {
  const { y, m } = parseKey(key);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  return toKey(date);
}

export function daysInMonth(key: string): number {
  const { y, m } = parseKey(key);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Ay görünümü: Pazartesi ile başlayan haftalar; ay dışındaki hücreler null. */
export function monthGrid(anyDayInMonth: string): (string | null)[][] {
  const first = firstOfMonth(anyDayInMonth);
  const lead = weekdayMondayFirst(first);
  const count = daysInMonth(first);
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let i = 0; i < count; i++) cells.push(addDays(first, i));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function formatMonth(key: string): string {
  const { y, m } = parseKey(key);
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatLongDate(key: string): string {
  const { y, m, d } = parseKey(key);
  return `${d} ${MONTHS[m - 1]} ${y}, ${WEEKDAYS[weekdayMondayFirst(key)]}`;
}

export function formatShortDate(key: string): string {
  const { m, d } = parseKey(key);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

export function isValidKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return toKey(utc(key)) === key;
}
