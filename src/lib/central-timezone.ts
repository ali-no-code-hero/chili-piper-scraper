/**
 * America/Chicago (Central Time) offset and label helpers.
 * DST: 2nd Sunday March through 1st Sunday November -> -05:00 (CDT), else -06:00 (CST).
 */

/**
 * Return offset string for America/Chicago on the given date (YYYY-MM-DD).
 * DST: 2nd Sunday March - 1st Sunday November -> -05:00, else -06:00.
 */
export function getCentralOffsetForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const year = y!;
  const month = m!;
  const day = d!;

  const isDST = (): boolean => {
    if (month < 3 || month > 11) return false;
    if (month > 3 && month < 11) return true;
    if (month === 3) {
      let sundays = 0;
      for (let i = 1; i <= 31; i++) {
        const date = new Date(year, 2, i);
        if (date.getDay() === 0) {
          sundays++;
          if (sundays === 2) return day >= i;
        }
      }
      return false;
    }
    if (month === 11) {
      let sundays = 0;
      for (let i = 1; i <= 30; i++) {
        const date = new Date(year, 10, i);
        if (date.getDay() === 0) {
          sundays++;
          if (sundays === 1) return day < i;
        }
      }
      return true;
    }
    return false;
  };
  return isDST() ? '-05:00' : '-06:00';
}

/**
 * Return display label for America/Chicago on the given date (YYYY-MM-DD).
 * For use in slot lists (e.g. "GMT-05:00 America/Chicago (CDT)").
 */
export function getCentralGmtLabelForDate(dateStr: string): string {
  const offset = getCentralOffsetForDate(dateStr);
  const abbr = offset === '-05:00' ? 'CDT' : 'CST';
  return `GMT${offset} America/Chicago (${abbr})`;
}
