import { z } from "zod";

/**
 * The academy's dictionary — the terms a learner meets in the reading, and what
 * they mean.
 */

export const TERM_KINDS = [
  "ROOT",
  "PREFIX",
  "SUFFIX",
  "ABBREVIATION",
  "DIAGNOSIS",
  "PROCEDURE",
  "HCPCS",
  "UNIT",
  "INSTRUMENT",
] as const;

export type TermKind = (typeof TERM_KINDS)[number];

export const TERM_KIND_LABEL: Record<TermKind, string> = {
  ROOT: "Root",
  PREFIX: "Prefix",
  SUFFIX: "Suffix",
  ABBREVIATION: "Abbreviation",
  DIAGNOSIS: "Diagnosis term",
  PROCEDURE: "Procedure term",
  HCPCS: "HCPCS term",
  UNIT: "Unit",
  INSTRUMENT: "Instrument",
};

/** A line of help per kind, so the right one is picked when adding a word. */
export const TERM_KIND_HINT: Record<TermKind, string> = {
  ROOT: "The core of a word — cardi, gastr, oste.",
  PREFIX: "What goes in front — hyper-, brady-, peri-.",
  SUFFIX: "What goes on the end — -itis, -ectomy, -ology.",
  ABBREVIATION: "A short form — COPD, CABG, BP.",
  DIAGNOSIS: "A condition, as it is written in a record.",
  PROCEDURE: "Something done to the patient.",
  HCPCS: "A HCPCS code or the term behind one.",
  UNIT: "A unit of measure — mg, mmHg, mL.",
  INSTRUMENT: "A tool used in a procedure.",
};

const lines = z
  .array(z.string().trim().min(1).max(500))
  .max(50)
  .default([]);

export const termSchema = z.object({
  word: z.string().trim().min(1, "Type the word").max(120),
  kind: z.enum(TERM_KINDS).default("ROOT"),
  /** Other words for the same thing; a lookup finds the entry by these too. */
  synonyms: lines,
  meaning: z.string().trim().min(1, "Give it a one-line meaning").max(500),
  explanation: z.string().trim().max(10_000).optional().or(z.literal("")),
  examples: lines,
  isPublished: z.boolean().default(true),
});

export type TermInput = z.infer<typeof termSchema>;

export const termListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  kind: z.enum(TERM_KINDS).optional(),
  /** Only the ones this learner saved. */
  savedOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type TermListQuery = z.infer<typeof termListSchema>;

/**
 * What counts as the same word when looking one up from the reading.
 *
 * A learner clicks "Cardiology." and means "cardiology"; the stored entry may
 * be "cardi/o". Punctuation, case and the slashes a dictionary uses to show a
 * combining form are all stripped before comparing.
 */
export function normaliseWord(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}
