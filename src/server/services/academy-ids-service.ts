import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/**
 * The academy's own numbering.
 *
 * "Format is SFC + MC + course code which is unique for every course. Medical
 * coding ka MC is a first letter of every word of course name. And then batch
 * number." So a batch reads SFCMC001005 — the academy, the course's
 * abbreviation, the course's number, and the batch's number within it. A
 * curriculum reads SFCMCCC001, with CC standing for curriculum.
 *
 * Two rules run through all of it. A number, once handed out, is never reused
 * or renumbered — which is why each identifier is frozen into its row rather
 * than rebuilt from the course's current name. And the sequence a screen lists
 * things in is a separate, rearrangeable field, so putting a batch higher up a
 * list never changes what it is called.
 */

export const ACADEMY_PREFIX = "SFC";
/** What a curriculum's identifier says it is. */
const CURRICULUM_MARK = "CC";
/** Course numbers, batch numbers and curriculum numbers are all three digits. */
const PAD = 3;

/** Words that say nothing about which course it is. */
const NOISE = new Set([
  "course",
  "courses",
  "program",
  "programme",
  "training",
  "batch",
  "class",
  "classes",
  "certification",
  "certificate",
  "diploma",
  "and",
  "the",
  "of",
  "for",
  "in",
  "with",
  "on",
  "a",
  "an",
]);

/**
 * "Medical Coding Course, 2026" → MC. "Data Analysis" → DA.
 *
 * Punctuation and years are dropped, and so are the words that appear on every
 * course the academy runs; what is left gives one letter each, capped at four
 * so an identifier stays readable.
 */
export function abbreviate(title: string): string {
  const words = title
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !/^\d+$/.test(w))
    .filter((w) => !NOISE.has(w.toLowerCase()));

  const letters = (words.length > 0 ? words : title.split(/\s+/).filter(Boolean))
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (letters || "XX").slice(0, 4);
}

const pad = (n: number) => String(Math.max(1, n)).padStart(PAD, "0");

/**
 * The next course number. One run across the academy, starting at 001, and
 * never reused — a deleted course does not free its number.
 */
async function nextCourseNo(): Promise<number> {
  const top = await prisma.course.findFirst({
    orderBy: { courseNo: "desc" },
    select: { courseNo: true },
  });
  return (top?.courseNo ?? 0) + 1;
}

/** Give a course its number and abbreviation if it hasn't got them yet. */
export async function ensureCourseIdentity(
  courseId: string,
): Promise<{ courseNo: number; abbreviation: string }> {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { title: true, courseNo: true, abbreviation: true },
  });
  const courseNo = course.courseNo > 0 ? course.courseNo : await nextCourseNo();
  const abbreviation = course.abbreviation?.trim() || abbreviate(course.title);

  if (course.courseNo !== courseNo || course.abbreviation !== abbreviation) {
    await prisma.course.update({
      where: { id: courseId },
      data: { courseNo, abbreviation },
    });
  }
  return { courseNo, abbreviation };
}

/** The course's own code — the SFCMC001 part every batch under it shares. */
export function courseCode(abbreviation: string, courseNo: number): string {
  return `${ACADEMY_PREFIX}${abbreviation}${pad(courseNo)}`;
}

/**
 * The batch identifier, generated once and kept.
 *
 * Batch numbers run per course, so every course has a batch 001. A clash — two
 * people creating a batch at the same moment — is settled by taking the next
 * free number rather than by a unique index, which TiDB will not add to a
 * populated table without a destructive push.
 */
export async function ensureBatchIdentity(
  batchId: string,
): Promise<{ batchNo: number; identifier: string }> {
  const batch = await prisma.batch.findUniqueOrThrow({
    where: { id: batchId },
    select: { courseId: true, batchNo: true, batchId: true },
  });
  if (batch.batchId && batch.batchNo > 0) {
    return { batchNo: batch.batchNo, identifier: batch.batchId };
  }

  const { courseNo, abbreviation } = await ensureCourseIdentity(batch.courseId);
  const code = courseCode(abbreviation, courseNo);

  const top = await prisma.batch.findFirst({
    where: { courseId: batch.courseId },
    orderBy: { batchNo: "desc" },
    select: { batchNo: true },
  });
  let batchNo = (top?.batchNo ?? 0) + 1;

  // Somebody else may have taken it between the read and the write.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const identifier = `${code}${pad(batchNo)}`;
    const clash = await prisma.batch.findFirst({
      where: { batchId: identifier, id: { not: batchId } },
      select: { id: true },
    });
    if (!clash) {
      await prisma.batch.update({
        where: { id: batchId },
        data: { batchNo, batchId: identifier },
      });
      return { batchNo, identifier };
    }
    batchNo += 1;
  }
  throw new Error("Couldn't allocate a batch number.");
}

/**
 * The curriculum identifier: SFC + the course's abbreviation + CC + its number.
 * A curriculum set for more than one course takes the first course it names;
 * one set for none is numbered under the academy alone.
 */
export async function ensureCurriculumIdentity(
  curriculumId: string,
): Promise<string> {
  const row = await prisma.curriculum.findUniqueOrThrow({
    where: { id: curriculumId },
    select: {
      curriculumId: true,
      number: true,
      courses: {
        take: 1,
        orderBy: { courseId: "asc" },
        select: { courseId: true },
      },
    },
  });
  if (row.curriculumId) return row.curriculumId;

  let code = ACADEMY_PREFIX;
  const first = row.courses[0]?.courseId;
  if (first) {
    const { courseNo, abbreviation } = await ensureCourseIdentity(first);
    code = `${ACADEMY_PREFIX}${abbreviation}`;
    void courseNo; // the course's number belongs to batches, not curriculums
  }
  const identifier = `${code}${CURRICULUM_MARK}${pad(row.number || 1)}`;
  await prisma.curriculum.update({
    where: { id: curriculumId },
    data: { curriculumId: identifier },
  });
  return identifier;
}

/**
 * Number everything that predates this — courses, then their batches, then the
 * curriculums. Runs when the relevant screen is opened, so what an admin sees
 * is always what is in the database.
 */
export async function backfillAcademyIds(): Promise<{
  courses: number;
  batches: number;
  curriculums: number;
}> {
  const courses = await prisma.course.findMany({
    where: { OR: [{ courseNo: { lte: 0 } }, { abbreviation: null }] },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  for (const c of courses) await ensureCourseIdentity(c.id);

  const batches = await prisma.batch.findMany({
    where: { OR: [{ batchNo: { lte: 0 } }, { batchId: null }] },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  for (const b of batches) await ensureBatchIdentity(b.id);

  const curriculums = await prisma.curriculum.findMany({
    where: { curriculumId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  for (const c of curriculums) await ensureCurriculumIdentity(c.id);

  return {
    courses: courses.length,
    batches: batches.length,
    curriculums: curriculums.length,
  };
}

/** Put a course's batches in a given order, 1…n. */
export async function reorderBatches(ids: string[]): Promise<number> {
  const rows = await prisma.batch.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const allowed = new Set(rows.map((r) => r.id));
  const ordered = ids.filter((id) => allowed.has(id));
  if (ordered.length === 0) return 0;

  const cases = ordered.map((id, i) => Prisma.sql`WHEN ${id} THEN ${i + 1}`);
  // One statement: a multi-row `updateMany` throws on a model that owns a
  // one-to-one relation under `relationMode = "prisma"`.
  await prisma.$executeRaw`
    UPDATE \`Batch\`
    SET \`sequence\` = CASE id ${Prisma.join(cases, " ")} END,
        updatedAt = ${new Date()}
    WHERE id IN (${Prisma.join(ordered.map((id) => Prisma.sql`${id}`))})`;
  return ordered.length;
}
