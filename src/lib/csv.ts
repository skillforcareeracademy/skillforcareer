/** Minimal, dependency-free CSV helpers for admin exports. */

type Cell = string | number | boolean | null | undefined;

function escapeCell(value: Cell): string {
  const s = value == null ? "" : String(value);
  return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from a header row + data rows (CRLF line endings). */
export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/**
 * A downloadable CSV Response. Prepends a UTF-8 BOM so Excel renders unicode
 * (₹, accented names) correctly.
 */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(`﻿${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
