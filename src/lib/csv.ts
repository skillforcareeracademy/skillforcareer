/** Minimal, dependency-free CSV helpers for admin exports. */

type Cell = string | number | boolean | null | undefined;

function escapeCell(value: Cell): string {
  const s = value == null ? "" : String(value);
  return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from a header row + data rows (CRLF line endings). */
export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");
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

/**
 * Parse a CSV file into rows of `{ header: value }`.
 *
 * Hand-rolled rather than pulled from npm because the shape we accept is
 * narrow: RFC-4180 quoting (`""` escapes a quote inside a quoted field), CRLF
 * or LF line endings, and an optional UTF-8 BOM — which is exactly what Excel
 * and Google Sheets emit, and exactly what `toCsv` above produces, so an export
 * can be edited and imported straight back.
 *
 * Headers are returned verbatim; matching them to fields is the caller's job.
 */
export function parseCsv(input: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const text = input.replace(/^﻿/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== "")) records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") endField();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) endRow();

  const [headerRow, ...dataRows] = records;
  if (!headerRow) return { headers: [], rows: [] };
  const headers = headerRow.map((h) => h.trim());
  const rows = dataRows.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = (cells[idx] ?? "").trim();
    });
    return record;
  });
  return { headers, rows };
}
