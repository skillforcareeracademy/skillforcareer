import { z } from "zod";

/**
 * What an import should do when a sheet names something the academy already
 * has — "a toggle to decide replace similar content or not or create a copy of
 * imported data".
 *
 * Matching is by title throughout, which is what the academy's sheets carry.
 */
export const IMPORT_MODES = ["update", "skip", "copy"] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export const IMPORT_MODE_LABEL: Record<ImportMode, string> = {
  update: "Replace what is already there",
  skip: "Leave the existing one alone",
  copy: "Bring it in as a separate copy",
};

export const IMPORT_MODE_HINT: Record<ImportMode, string> = {
  update:
    "A row whose title already exists overwrites it. Use this to edit an export and send it back.",
  skip: "A row whose title already exists is counted as skipped and nothing changes.",
  copy: "Every row is added as a new item, with “(copy)” after the title so the two can be told apart.",
};

export const importModeSchema = z.enum(IMPORT_MODES).default("update");

/**
 * The title a copy should carry. A second copy becomes "(copy 2)" rather than
 * "(copy) (copy)", which is what repeated imports would otherwise produce.
 */
export function copyTitle(title: string, taken: Set<string>): string {
  const base = title.replace(/\s*\(copy(?: \d+)?\)$/i, "").trim();
  let candidate = `${base} (copy)`;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} (copy ${n})`;
    n += 1;
  }
  return candidate;
}
