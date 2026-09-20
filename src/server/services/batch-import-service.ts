import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { parseCsv } from "@/lib/csv";
import { ROLES } from "@/config/roles";
import {
  BATCH_IMPORT_HEADERS,
  BATCH_IMPORT_MAX_ROWS,
} from "@/lib/validations/batch-profile";
import { placeStudentsOnBatch } from "./batch-service";

/**
 * "Import option missing h batch me" — load a batch's roster from a sheet.
 *
 * Each row is a learner: found by email, or given a new STUDENT account when
 * there is none (active, email already trusted, no password — they sign in
 * with an emailed code). Then they go through the same `placeStudentsOnBatch`
 * as a hand-picked add, so the counters, the capacity rule and the welcome
 * email are the same whichever door they came in by.
 *
 * Every row gets a result line rather than the whole file failing on one bad
 * cell — the same approach as the lead importer.
 */

export type ImportRowStatus = "added" | "created" | "skipped";

export interface ImportRowResult {
  /** The line in the file (the header is line 1). */
  row: number;
  name: string;
  email: string;
  status: ImportRowStatus;
  /** Why a row was skipped, or a note on how it was added. */
  reason?: string;
}

export interface BatchImportResult {
  added: number;
  created: number;
  skipped: number;
  rows: ImportRowResult[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Header spellings people actually use for each column. */
const ALIASES: Record<(typeof BATCH_IMPORT_HEADERS)[number], string[]> = {
  name: ["name", "full name", "student name", "learner name", "student"],
  email: ["email", "e mail", "email address", "email id", "mail", "mail id"],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile number",
    "number",
    "contact",
    "contact number",
    "whatsapp",
  ],
};

function mapHeaders(
  headers: string[],
): Partial<Record<keyof typeof ALIASES, string>> {
  const out: Partial<Record<keyof typeof ALIASES, string>> = {};
  for (const header of headers) {
    const key = norm(header);
    for (const [field, aliases] of Object.entries(ALIASES) as [
      keyof typeof ALIASES,
      string[],
    ][]) {
      if (!out[field] && aliases.includes(key)) {
        out[field] = header;
        break;
      }
    }
  }
  return out;
}

const emailSchema = z.string().email();

/** A one-row sample so admins can see the headers the import expects. */
export function batchImportTemplate(): { headers: string[]; data: string[][] } {
  return {
    headers: [...BATCH_IMPORT_HEADERS],
    data: [["Priya Sharma", "priya.sharma@example.com", "+91 98765 43210"]],
  };
}

interface Candidate {
  row: number;
  name: string;
  email: string;
  phone: string;
}

export async function importBatchStudents(
  batchId: string,
  csv: string,
): Promise<BatchImportResult> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true, name: true },
  });
  if (!batch) throw AppError.notFound("Batch not found.");

  const { headers, rows } = parseCsv(csv);
  if (!headers.length)
    throw AppError.badRequest("That file has no header row.");
  const column = mapHeaders(headers);
  if (!column.email) {
    throw AppError.badRequest(
      'The sheet needs an "email" column. Download the template to see the expected headers.',
    );
  }
  if (rows.length === 0)
    throw AppError.badRequest("That file has no learners in it.");
  if (rows.length > BATCH_IMPORT_MAX_ROWS) {
    throw AppError.badRequest(
      `That file has ${rows.length} rows — import up to ${BATCH_IMPORT_MAX_ROWS} at a time.`,
    );
  }

  const results = new Map<number, ImportRowResult>();
  const skip = (c: Pick<Candidate, "row" | "name" | "email">, reason: string) =>
    results.set(c.row, {
      row: c.row,
      name: c.name,
      email: c.email,
      status: "skipped",
      reason,
    });

  // ── 1. Read the rows ──────────────────────────────────────────────────────
  const value = (r: Record<string, string>, field: keyof typeof ALIASES) =>
    (column[field] ? (r[column[field]!] ?? "") : "").trim();

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const c: Candidate = {
      row: i + 2, // +1 for the header, +1 for 1-based line numbers
      name: value(r, "name").replace(/\s+/g, " "),
      email: value(r, "email").toLowerCase(),
      phone: value(r, "phone").replace(/\s+/g, " ").slice(0, 32),
    };
    if (!c.email) return skip(c, "No email address.");
    if (!emailSchema.safeParse(c.email).success)
      return skip(c, "That isn't a valid email address.");
    if (seen.has(c.email)) return skip(c, "Listed twice in this file.");
    seen.add(c.email);
    candidates.push(c);
  });

  // ── 2. Match to accounts ──────────────────────────────────────────────────
  const users = candidates.length
    ? await prisma.user.findMany({
        where: { email: { in: candidates.map((c) => c.email) } },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          role: { select: { slug: true, name: true } },
          extraRoles: { select: { role: { select: { slug: true } } } },
        },
      })
    : [];
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  /** Rows that should end up on the batch, with the account they map to. */
  const ready: { c: Candidate; userId: string | null }[] = [];
  for (const c of candidates) {
    const u = byEmail.get(c.email);
    if (!u) {
      if (c.name.length < 2) {
        skip(c, "No account with this email, and no name to create one with.");
        continue;
      }
      ready.push({ c, userId: null });
      continue;
    }
    const isStudent =
      u.role.slug === ROLES.STUDENT ||
      u.extraRoles.some((x) => x.role.slug === ROLES.STUDENT);
    if (!isStudent) {
      skip(
        { ...c, name: c.name || u.name },
        `This email belongs to a ${u.role.name} account, not a student.`,
      );
      continue;
    }
    if (u.status === "SUSPENDED") {
      skip(
        { ...c, name: c.name || u.name },
        "This learner's account is suspended.",
      );
      continue;
    }
    ready.push({ c: { ...c, name: c.name || u.name }, userId: u.id });
  }

  // ── 3. Seats — decided before any account is made ─────────────────────────
  // People already on the batch take no seat; everyone else takes one, in file
  // order, until the batch is full. Checking now means a row turned away for
  // capacity never leaves a stray account behind.
  const [cap, seated, onBatch] = await Promise.all([
    prisma.batch.findUnique({
      where: { id: batchId },
      select: { capacity: true },
    }),
    prisma.enrollment.count({ where: { batchId } }),
    prisma.enrollment.findMany({
      where: {
        batchId,
        userId: {
          in: ready
            .map((r) => r.userId)
            .filter((id): id is string => Boolean(id)),
        },
      },
      select: { userId: true },
    }),
  ]);
  const alreadyHere = new Set(onBatch.map((e) => e.userId));
  let seatsLeft =
    cap?.capacity != null ? Math.max(0, cap.capacity - seated) : Infinity;

  const toPlace: { c: Candidate; userId: string | null }[] = [];
  for (const r of ready) {
    if (r.userId && alreadyHere.has(r.userId)) {
      skip(r.c, "Already on this batch.");
      continue;
    }
    if (seatsLeft <= 0) {
      skip(r.c, "The batch is full.");
      continue;
    }
    seatsLeft -= 1;
    toPlace.push(r);
  }

  // ── 4. Create the missing accounts ────────────────────────────────────────
  const fresh = toPlace.filter((r) => !r.userId);
  const createdEmails = new Set<string>();
  if (fresh.length > 0) {
    const studentRole = await prisma.role.findUnique({
      where: { slug: ROLES.STUDENT },
      select: { id: true },
    });
    if (!studentRole)
      throw AppError.internal("Default role missing. Run `npm run db:seed`.");

    // One INSERT for the lot. `skipDuplicates` covers someone signing up with
    // the same address between the lookup above and this insert — they are
    // then simply matched to that account below.
    await prisma.user.createMany({
      data: fresh.map(({ c }) => ({
        name: c.name.slice(0, 191),
        email: c.email,
        phone: c.phone || null,
        roleId: studentRole.id,
        // An admin is vouching for this learner, so the address counts as
        // verified. No password: they sign in with an emailed one-time code.
        status: "ACTIVE" as const,
        emailVerified: new Date(),
      })),
      skipDuplicates: true,
    });
    const made = await prisma.user.findMany({
      where: { email: { in: fresh.map((r) => r.c.email) } },
      select: { id: true, email: true },
    });
    const idByEmail = new Map(made.map((u) => [u.email.toLowerCase(), u.id]));
    for (const r of fresh) {
      r.userId = idByEmail.get(r.c.email) ?? null;
      if (r.userId) createdEmails.add(r.c.email);
    }
  }

  // ── 5. Put them on the batch ──────────────────────────────────────────────
  const placeable = toPlace.filter((r): r is { c: Candidate; userId: string } =>
    Boolean(r.userId),
  );
  for (const r of toPlace)
    if (!r.userId) skip(r.c, "Couldn't create an account for this email.");

  const placement = placeable.length
    ? await placeStudentsOnBatch(
        batchId,
        placeable.map((r) => r.userId),
        { enforceCapacity: true },
      )
    : null;

  if (placement) {
    const movedFrom = new Map(
      placement.moved.map((m) => [m.userId, m.fromBatchName]),
    );
    const attached = new Set(placement.attached);
    const already = new Set(placement.already);
    const full = new Set(placement.full);
    for (const { c, userId } of placeable) {
      if (already.has(userId)) {
        skip(c, "Already on this batch.");
      } else if (full.has(userId)) {
        skip(c, "The batch is full.");
      } else {
        const created = createdEmails.has(c.email);
        results.set(c.row, {
          row: c.row,
          name: c.name,
          email: c.email,
          status: created ? "created" : "added",
          reason: created
            ? "New student account created."
            : movedFrom.has(userId)
              ? `Moved from “${movedFrom.get(userId)}”.`
              : attached.has(userId)
                ? "Already had the course — linked to this batch."
                : undefined,
        });
      }
    }
  }

  const all = [...results.values()].sort((a, b) => a.row - b.row);
  return {
    added: all.filter((r) => r.status !== "skipped").length,
    created: all.filter((r) => r.status === "created").length,
    skipped: all.filter((r) => r.status === "skipped").length,
    rows: all,
  };
}
