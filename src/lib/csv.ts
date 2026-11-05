/**
 * One CSV field (RFC 4180): quoted when it holds a comma, quote or line break. Text that a
 * spreadsheet would run as a formula (=, +, -, @, tab, CR at the start) gets a leading "'",
 * so an email address like "=cmd|..." can't execute when an admin opens the export.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Rows to a CSV document with CRLF line endings. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}
