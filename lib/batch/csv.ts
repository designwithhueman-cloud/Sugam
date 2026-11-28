// Small CSV reader and writer for the labeling export. Writing guards against spreadsheet formulas (a hostile page can put "=..." in evidence).
import { redactText } from '../security/redact.ts';

/** One cell. Masked first, quoted when needed, and a leading = + - @ tab or CR is neutralised so a spreadsheet never runs it. */
export function cell(v: unknown): string {
  let s = redactText(v == null ? '' : String(v));
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(headers: readonly string[], rows: Record<string, unknown>[]): string {
  return [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\n') + '\n';
}
/** Reads CSV text (quotes, doubled quotes, newlines inside cells). Returns objects keyed by the header row. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); if (row.some((x) => x !== '')) rows.push(row); }
  const [head, ...body] = rows; if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
