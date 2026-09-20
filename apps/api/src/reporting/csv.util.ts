/** Minimal RFC 4180-ish CSV writer — quotes a field only when it needs it. */
export function toCsv(rows: (string | number)[][]): string {
  const escapeCell = (cell: string | number): string => {
    const str = String(cell);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return rows.map((row) => row.map(escapeCell).join(',')).join('\n');
}
