/// <reference types="jest" />
import { addDays, addMonths, isValidKey, monthGrid, startOfWeek, weekdayMondayFirst } from '../dates';

describe('date keys', () => {
  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // Avrupa'da yaz saatine geçiş günü
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('computes weeks starting on Monday', () => {
    expect(weekdayMondayFirst('2026-09-28')).toBe(0); // Pazartesi
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28'); // Pazar → önceki Pazartesi
  });

  it('builds a month grid with leading blanks', () => {
    const grid = monthGrid('2026-09-15'); // 1 Eylül 2026 Salı
    expect(grid[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
    expect(grid.flat().filter(Boolean)).toHaveLength(30);
  });

  it('adds months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
  });

  it('validates keys', () => {
    expect(isValidKey('2026-02-29')).toBe(false);
    expect(isValidKey('2028-02-29')).toBe(true);
    expect(isValidKey('2026-1-1')).toBe(false);
  });
});
