import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { toCsv, parseCsv } from "@/lib/csv";
import { copyTitle, type ImportMode } from "@/lib/validations/import-mode";
import {
  TERM_KINDS,
  normaliseWord,
  type TermInput,
  type TermKind,
  type TermListQuery,
} from "@/lib/validations/term";

/**
 * The academy's dictionary.
 *
 * Two jobs in one place: the list a learner browses, and the lookup behind
 * clicking a word while reading. The lookup matches on a normalised form of the
 * word *and* on every synonym, because the reading says "cardiology" where the
 * entry says "cardi/o", and a learner who clicks the word should not have to
 * know which one we filed it under.
 */

export interface TermRow {
  id: string;
  word: string;
  kind: TermKind;
  synonyms: string[];
  meaning: string;
  explanation: string | null;
  examples: string[];
  isPublished: boolean;
  saved: boolean;
  createdByName: string;
  updatedAt: string;
}

/**
 * The keys a lookup matches on. Derived from what was typed, never entered by
 * hand, so they cannot drift from the word they describe.
 */
function keysFor(word: string, synonyms: string[]) {
  const syn = synonyms.map(normaliseWord).filter(Boolean);
  return {
    wordKey: normaliseWord(word),
    // Wrapped in bars so `contains("|cardiac|")` is an exact synonym match
    // rather than finding "cardiac" inside "cardiacarrest".
    synonymKey: syn.length > 0 ? `|${syn.join("|")}|` : null,
  };
}

/** A JSON array column, however it came back. */
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function toRow(
  t: {
    id: string;
    word: string;
    kind: string;
    synonyms: unknown;
    meaning: string;
    explanation: string | null;
    examples: unknown;
    isPublished: boolean;
    updatedAt: Date;
    createdBy?: { name: string } | null;
  },
  saved: boolean,
): TermRow {
  return {
    id: t.id,
    word: t.word,
    kind: t.kind as TermKind,
    synonyms: strings(t.synonyms),
    meaning: t.meaning,
    explanation: t.explanation,
    examples: strings(t.examples),
    isPublished: t.isPublished,
    saved,
    createdByName: t.createdBy?.name ?? "",
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listTerms(
  q: TermListQuery,
  viewerId: string,
  /** Learners see only what has been published. */
  publishedOnly: boolean,
): Promise<{ rows: TermRow[]; total: number }> {
  const and: Prisma.TermWhereInput[] = [];
  if (publishedOnly) and.push({ isPublished: true });
  if (q.kind) and.push({ kind: q.kind });
  if (q.search) {
    // The word itself, its meaning, or one of its synonyms.
    and.push({
      OR: [
        { word: { contains: q.search } },
        { wordKey: { contains: normaliseWord(q.search) } },
        { synonymKey: { contains: normaliseWord(q.search) } },
        { meaning: { contains: q.search } },
        { explanation: { contains: q.search } },
      ],
    });
  }
  if (q.savedOnly) {
    const saved = await prisma.termBookmark.findMany({
      where: { userId: viewerId },
      select: { termId: true },
    });
    and.push({ id: { in: saved.map((s) => s.termId) } });
  }

  const where = and.length > 0 ? { AND: and } : {};
  const [rows, total, saved] = await Promise.all([
    prisma.term.findMany({
      where,
      orderBy: [{ word: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.term.count({ where }),
    prisma.termBookmark.findMany({
      where: { userId: viewerId },
      select: { termId: true },
    }),
  ]);

  const savedIds = new Set(saved.map((s) => s.termId));
  return { rows: rows.map((t) => toRow(t, savedIds.has(t.id))), total };
}

/**
 * Every sense of a word, for the pop-up that opens when one is clicked while
 * reading. The same spelling can be a root and an abbreviation, so this returns
 * all of them rather than guessing.
 */
export async function lookUpWord(word: string, viewerId: string): Promise<TermRow[]> {
  const key = normaliseWord(word);
  if (key.length < 2) return [];

  const [exact, pieces] = await Promise.all([
    // The word itself, or one of its synonyms.
    prisma.term.findMany({
      where: {
        isPublished: true,
        OR: [{ wordKey: key }, { synonymKey: { contains: `|${key}|` } }],
      },
      take: 8,
      include: { createdBy: { select: { name: true } } },
    }),
    // Nothing may match outright: someone clicking "pericarditis" is still
    // helped by the entries for "peri-" and "-itis". Only the building blocks
    // are considered, and there are few enough of those to check in code.
    prisma.term.findMany({
      where: { isPublished: true, kind: { in: ["ROOT", "PREFIX", "SUFFIX"] } },
      take: 500,
      include: { createdBy: { select: { name: true } } },
    }),
  ]);

  const found =
    exact.length > 0
      ? exact
      : pieces
          .filter((t) => t.wordKey.length >= 3 && key.includes(t.wordKey))
          // The longest piece first: "cardi" tells you more than "card".
          .sort((a, b) => b.wordKey.length - a.wordKey.length)
          .slice(0, 4);

  const saved = await prisma.termBookmark.findMany({
    where: { userId: viewerId, termId: { in: found.map((t) => t.id) } },
    select: { termId: true },
  });
  const savedIds = new Set(saved.map((s) => s.termId));
  return found.map((t) => toRow(t, savedIds.has(t.id)));
}

export async function createTerm(input: TermInput, createdById: string): Promise<string> {
  const t = await prisma.term.create({
    data: {
      word: input.word,
      ...keysFor(input.word, input.synonyms),
      kind: input.kind,
      synonyms: input.synonyms as Prisma.InputJsonValue,
      meaning: input.meaning,
      explanation: input.explanation || null,
      examples: input.examples as Prisma.InputJsonValue,
      isPublished: input.isPublished,
      createdById,
    },
    select: { id: true },
  });
  return t.id;
}

export async function updateTerm(id: string, input: TermInput): Promise<void> {
  const existing = await prisma.term.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("That word is no longer here.");
  await prisma.term.update({
    where: { id },
    data: {
      word: input.word,
      ...keysFor(input.word, input.synonyms),
      kind: input.kind,
      synonyms: input.synonyms as Prisma.InputJsonValue,
      meaning: input.meaning,
      explanation: input.explanation || null,
      examples: input.examples as Prisma.InputJsonValue,
      isPublished: input.isPublished,
    },
  });
}

export async function deleteTerm(id: string): Promise<void> {
  await prisma.termBookmark.deleteMany({ where: { termId: id } });
  const { count } = await prisma.term.deleteMany({ where: { id } });
  if (count === 0) throw AppError.notFound("That word is no longer here.");
}

/** Save a word for later, or stop saving it. Returns the state it ended in. */
export async function toggleTermBookmark(
  termId: string,
  userId: string,
): Promise<{ saved: boolean }> {
  const existing = await prisma.termBookmark.findFirst({
    where: { termId, userId },
    select: { id: true },
  });
  if (existing) {
    await prisma.termBookmark.delete({ where: { id: existing.id } });
    return { saved: false };
  }
  await prisma.termBookmark.create({ data: { termId, userId } });
  return { saved: true };
}

/** How many words there are of each kind, for the browsing screen. */
export async function termCounts(
  publishedOnly: boolean,
): Promise<{ kind: TermKind; count: number }[]> {
  const rows = await prisma.term.groupBy({
    by: ["kind"],
    where: publishedOnly ? { isPublished: true } : {},
    _count: true,
  });
  const byKind = new Map(rows.map((r) => [r.kind as TermKind, r._count]));
  return TERM_KINDS.map((kind) => ({ kind, count: byKind.get(kind) ?? 0 }));
}

// ── Import / export ─────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "Word",
  "Kind",
  "Synonyms",
  "One-line meaning",
  "Detailed explanation",
  "Examples",
  "Published",
];

/** A list is written one per line in a cell, which is what a sheet can hold. */
const joinLines = (v: string[]) => v.join("\n");

export async function exportTerms(): Promise<string> {
  const rows = await prisma.term.findMany({ orderBy: [{ kind: "asc" }, { word: "asc" }] });
  return toCsv(
    CSV_HEADERS,
    rows.map((t) => [
      t.word,
      t.kind,
      joinLines(strings(t.synonyms)),
      t.meaning,
      t.explanation ?? "",
      joinLines(strings(t.examples)),
      t.isPublished ? "yes" : "no",
    ]),
  );
}

export function termSampleSheet(kind?: TermKind): string {
  const examples: Record<string, string[]> = {
    ROOT: ["cardi/o", "heart", "Relating to the heart.", "carditis — inflammation of the heart"],
    PREFIX: ["brady-", "slow", "Slow, or less than normal.", "bradycardia — a slow heart rate"],
    SUFFIX: ["-itis", "inflammation", "Inflammation of the named part.", "gastritis — inflammation of the stomach"],
    ABBREVIATION: ["COPD", "chronic obstructive pulmonary disease", "A long-term lung disease that blocks airflow.", "Coded in ICD-10-CM at J44."],
    DIAGNOSIS: ["Hypertension", "high blood pressure", "Blood pressure persistently above the normal range.", "I10 — essential hypertension"],
    PROCEDURE: ["Cholecystectomy", "gallbladder removal", "Surgical removal of the gallbladder.", "47562 — laparoscopic cholecystectomy"],
    HCPCS: ["A0428", "basic life support ambulance", "Ambulance service, basic life support, non-emergency.", "Billed per trip."],
    UNIT: ["mmHg", "millimetres of mercury", "The unit blood pressure is measured in.", "120/80 mmHg"],
    INSTRUMENT: ["Scalpel", "surgical knife", "A small sharp blade used to make incisions.", "Used in almost every open procedure."],
  };
  const pick = kind ? [kind] : (TERM_KINDS as readonly string[]);
  return toCsv(
    CSV_HEADERS,
    pick.map((k) => {
      const [word, syn, meaning, example] = examples[k] ?? examples.ROOT;
      return [word, k, syn, meaning, "", example, "yes"];
    }),
  );
}

export interface TermImportResult {
  created: number;
  updated: number;
  skipped: { row: number; reason: string }[];
}

export async function importTerms(
  csv: string,
  createdById: string,
  mode: ImportMode = "update",
): Promise<TermImportResult> {
  const { rows } = parseCsv(csv);
  const result: TermImportResult = { created: 0, updated: 0, skipped: [] };
  if (rows.length === 0) return result;

  const existing = await prisma.term.findMany({ select: { id: true, word: true, kind: true } });
  // The same spelling can be two kinds, so a row is matched on both.
  const byKey = new Map(
    existing.map((t) => [`${normaliseWord(t.word)}:${t.kind}`, t.id]),
  );
  const allWords = new Set(existing.map((t) => t.word.toLowerCase()));

  const pick = (row: Record<string, string>, ...names: string[]) => {
    for (const name of names) {
      const hit = Object.keys(row).find((k) => k.trim().toLowerCase() === name.toLowerCase());
      if (hit && row[hit]?.trim()) return row[hit].trim();
    }
    return "";
  };
  // Synonyms are short and comma-separated, the way the form takes them.
  const synList = (v: string) =>
    v.split(/[\n,;|]/).map((x) => x.trim()).filter(Boolean);
  // Examples are sentences and often contain commas, so only a new line splits
  // them — "120/80 mmHg, measured at rest" is one example, not two.
  const exampleList = (v: string) =>
    v.split(/[\n;|]/).map((x) => x.trim()).filter(Boolean);

  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const word = pick(row, "word", "term");
    const meaning = pick(row, "one-line meaning", "meaning");
    if (!word) {
      result.skipped.push({ row: line, reason: "No word" });
      continue;
    }
    if (!meaning) {
      result.skipped.push({ row: line, reason: `"${word}" has no meaning` });
      continue;
    }

    const rawKind = pick(row, "kind", "type").toUpperCase().replace(/[\s-]+/g, "_");
    const kind = (TERM_KINDS as readonly string[]).includes(rawKind)
      ? (rawKind as TermKind)
      : "ROOT";

    const syn = synList(pick(row, "synonyms"));
    const data = {
      word,
      ...keysFor(word, syn),
      kind,
      synonyms: syn as Prisma.InputJsonValue,
      meaning,
      explanation: pick(row, "detailed explanation", "explanation") || null,
      examples: exampleList(pick(row, "examples")) as Prisma.InputJsonValue,
      isPublished: pick(row, "published").toLowerCase() !== "no",
    };

    const key = `${normaliseWord(word)}:${kind}`;
    const found = byKey.get(key);
    if (found && mode === "skip") {
      result.skipped.push({ row: line, reason: `"${word}" is already here` });
      continue;
    }
    if (found && mode === "update") {
      await prisma.term.update({ where: { id: found }, data });
      result.updated += 1;
    } else {
      const name = found || mode === "copy" ? copyTitle(word, allWords) : word;
      const made = await prisma.term.create({
        data: { ...data, word: name, ...keysFor(name, syn), createdById },
        select: { id: true },
      });
      byKey.set(`${normaliseWord(name)}:${kind}`, made.id);
      allWords.add(name.toLowerCase());
      result.created += 1;
    }
  }
  return result;
}
