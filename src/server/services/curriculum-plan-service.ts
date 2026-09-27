import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { notify } from "./notification-service";
import type { CurriculumInput } from "@/lib/validations/curriculum-plan";

/**
 * Curriculums: what a course covers, written by the academy and shown to the
 * learners it is set for.
 *
 * The rules the academy asked for:
 *   - one curriculum can serve several courses and several batches;
 *   - only enrolled learners (on those courses, or in those batches) see it;
 *   - its number is permanent, its sequence can be rearranged;
 *   - every change is recorded, and the learners it reaches are told.
 */

export interface CurriculumTabRow {
  id: string;
  heading: string;
  description: string | null;
}

export interface CurriculumRow {
  id: string;
  number: number;
  sequence: number;
  title: string;
  year: string | null;
  isPublished: boolean;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  tabs: CurriculumTabRow[];
  courseIds: string[];
  courseTitles: string[];
  batchIds: string[];
  batchNames: string[];
  changes: { id: string; summary: string; by: string | null; at: string }[];
}

const SELECT = {
  id: true,
  number: true,
  sequence: true,
  title: true,
  year: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  tabs: { orderBy: { order: "asc" as const }, select: { id: true, heading: true, description: true } },
  courses: { select: { courseId: true, course: { select: { title: true } } } },
  batches: { select: { batchId: true, batch: { select: { name: true } } } },
  changes: {
    orderBy: { createdAt: "desc" as const },
    take: 20,
    select: { id: true, summary: true, createdAt: true, by: { select: { name: true } } },
  },
};

type Row = Prisma.CurriculumGetPayload<{ select: typeof SELECT }>;

function toRow(c: Row): CurriculumRow {
  return {
    id: c.id,
    number: c.number,
    sequence: c.sequence,
    title: c.title,
    year: c.year,
    isPublished: c.isPublished,
    createdByName: c.createdBy.name,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    tabs: c.tabs.map((t) => ({ id: t.id, heading: t.heading, description: t.description })),
    courseIds: c.courses.map((x) => x.courseId),
    courseTitles: c.courses.map((x) => x.course.title),
    batchIds: c.batches.map((x) => x.batchId),
    batchNames: c.batches.map((x) => x.batch.name),
    changes: c.changes.map((x) => ({
      id: x.id,
      summary: x.summary,
      by: x.by?.name ?? null,
      at: x.createdAt.toISOString(),
    })),
  };
}

export async function listCurriculums(ownerId?: string): Promise<CurriculumRow[]> {
  const rows = await prisma.curriculum.findMany({
    where: ownerId ? { createdById: ownerId } : {},
    orderBy: [{ sequence: "asc" }, { number: "asc" }],
    take: 200,
    select: SELECT,
  });
  return rows.map(toRow);
}

export async function getCurriculum(id: string): Promise<CurriculumRow | null> {
  const row = await prisma.curriculum.findUnique({ where: { id }, select: SELECT });
  return row ? toRow(row) : null;
}

async function nextNumbers(): Promise<{ number: number; sequence: number }> {
  const [byNumber, bySequence] = await Promise.all([
    prisma.curriculum.findFirst({ orderBy: { number: "desc" }, select: { number: true } }),
    prisma.curriculum.findFirst({ orderBy: { sequence: "desc" }, select: { sequence: true } }),
  ]);
  return { number: (byNumber?.number ?? 0) + 1, sequence: (bySequence?.sequence ?? 0) + 1 };
}

/** Who this curriculum reaches: everyone enrolled on its courses or in its batches. */
async function audienceFor(curriculumId: string): Promise<string[]> {
  const links = await prisma.curriculum.findUnique({
    where: { id: curriculumId },
    select: {
      courses: { select: { courseId: true } },
      batches: { select: { batchId: true } },
    },
  });
  if (!links) return [];
  const courseIds = links.courses.map((c) => c.courseId);
  const batchIds = links.batches.map((b) => b.batchId);
  if (courseIds.length === 0 && batchIds.length === 0) return [];

  const rows = await prisma.enrollment.findMany({
    where: {
      status: { in: ["ACTIVE", "COMPLETED"] },
      OR: [
        ...(courseIds.length ? [{ courseId: { in: courseIds } }] : []),
        ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
      ],
    },
    select: { userId: true },
    take: 5000,
  });
  return [...new Set(rows.map((r) => r.userId))];
}

async function record(curriculumId: string, byId: string, summary: string) {
  await prisma.curriculumChange.create({ data: { curriculumId, byId, summary } });
}

/** Tell the learners it reaches. Silent for an unpublished one. */
async function announce(curriculumId: string, title: string, what: string) {
  const row = await prisma.curriculum.findUnique({
    where: { id: curriculumId },
    select: { isPublished: true },
  });
  if (!row?.isPublished) return;
  const userIds = await audienceFor(curriculumId);
  if (userIds.length === 0) return;
  void notify({
    userIds,
    type: "COURSE",
    title: what,
    message: `“${title}” — open it from Curriculum in your panel.`,
    actionUrl: "/student/curriculum",
  });
}

export async function createCurriculum(input: CurriculumInput, createdById: string): Promise<string> {
  const { number, sequence } = await nextNumbers();
  const row = await prisma.curriculum.create({
    data: {
      number,
      sequence,
      title: input.title,
      year: input.year || null,
      isPublished: input.isPublished,
      createdById,
      tabs: {
        create: input.tabs.map((t, i) => ({
          heading: t.heading,
          description: t.description || null,
          order: i,
        })),
      },
    },
    select: { id: true },
  });
  await setLinks(row.id, input.courseIds, input.batchIds);
  await record(row.id, createdById, "Curriculum created");
  await announce(row.id, input.title, "A new curriculum is available");
  return row.id;
}

export async function updateCurriculum(
  id: string,
  input: CurriculumInput,
  byId: string,
): Promise<void> {
  const before = await getCurriculum(id);
  if (!before) throw AppError.notFound("Curriculum not found.");

  await prisma.curriculum.update({
    where: { id },
    data: {
      title: input.title,
      year: input.year || null,
      isPublished: input.isPublished,
    },
  });

  // Sections are replaced wholesale — they are a list, and the editor always
  // sends the whole thing.
  await prisma.curriculumTab.deleteMany({ where: { curriculumId: id } });
  if (input.tabs.length > 0) {
    await prisma.curriculumTab.createMany({
      data: input.tabs.map((t, i) => ({
        curriculumId: id,
        heading: t.heading,
        description: t.description || null,
        order: i,
      })),
    });
  }
  await setLinks(id, input.courseIds, input.batchIds);

  // What actually changed, in words, for the record and for the learners.
  const parts: string[] = [];
  if (before.title !== input.title) parts.push(`title → “${input.title}”`);
  if ((before.year ?? "") !== (input.year ?? "")) parts.push(`year → ${input.year || "—"}`);
  if (before.isPublished !== input.isPublished) {
    parts.push(input.isPublished ? "published" : "hidden from learners");
  }
  const tabsChanged =
    before.tabs.length !== input.tabs.length ||
    before.tabs.some((t, i) => t.heading !== input.tabs[i]?.heading || (t.description ?? "") !== (input.tabs[i]?.description ?? ""));
  if (tabsChanged) parts.push("sections updated");

  const addedBatches = input.batchIds.filter((b) => !before.batchIds.includes(b));
  const removedBatches = before.batchIds.filter((b) => !input.batchIds.includes(b));
  const addedCourses = input.courseIds.filter((c) => !before.courseIds.includes(c));
  const removedCourses = before.courseIds.filter((c) => !input.courseIds.includes(c));
  if (addedBatches.length) parts.push(`${addedBatches.length} batch(es) added`);
  if (removedBatches.length) parts.push(`${removedBatches.length} batch(es) removed`);
  if (addedCourses.length) parts.push(`${addedCourses.length} course(s) added`);
  if (removedCourses.length) parts.push(`${removedCourses.length} course(s) removed`);

  if (parts.length > 0) {
    await record(id, byId, parts.join(", "));
    await announce(
      id,
      input.title,
      addedBatches.length || addedCourses.length
        ? "A curriculum has been set for your batch"
        : "Your curriculum has been updated",
    );
  }
}

async function setLinks(id: string, courseIds: string[], batchIds: string[]) {
  const courses = [...new Set(courseIds)];
  const batches = [...new Set(batchIds)];
  await prisma.$transaction([
    prisma.curriculumCourse.deleteMany({ where: { curriculumId: id } }),
    prisma.curriculumBatch.deleteMany({ where: { curriculumId: id } }),
    ...(courses.length
      ? [prisma.curriculumCourse.createMany({ data: courses.map((courseId) => ({ curriculumId: id, courseId })) })]
      : []),
    ...(batches.length
      ? [prisma.curriculumBatch.createMany({ data: batches.map((batchId) => ({ curriculumId: id, batchId })) })]
      : []),
  ]);
}

export async function deleteCurriculum(id: string): Promise<void> {
  const existing = await prisma.curriculum.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Curriculum not found.");
  await prisma.curriculum.delete({ where: { id } });
}

/** Renumber the list 1…n — the order learners see, not the permanent numbers. */
export async function reorderCurriculums(ids: string[]): Promise<number> {
  const rows = await prisma.curriculum.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const allowed = new Set(rows.map((r) => r.id));
  const ordered = ids.filter((id) => allowed.has(id));
  if (ordered.length === 0) throw AppError.badRequest("Nothing to reorder.");

  const cases = ordered.map((id, i) => Prisma.sql`WHEN ${id} THEN ${i + 1}`);
  await prisma.$executeRaw`
    UPDATE Curriculum
    SET sequence = CASE id ${Prisma.join(cases, " ")} END,
        updatedAt = ${new Date()}
    WHERE id IN (${Prisma.join(ordered.map((id) => Prisma.sql`${id}`))})
  `;
  return ordered.length;
}

// ── The learner's side ───────────────────────────────────────────────────────

/** The curriculums set for the courses and batches this learner is on. */
export async function listCurriculumsForLearner(userId: string): Promise<CurriculumRow[]> {
  const enrolments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true, batchId: true },
  });
  const courseIds = enrolments.map((e) => e.courseId);
  const batchIds = enrolments.map((e) => e.batchId).filter((b): b is string => Boolean(b));
  if (courseIds.length === 0 && batchIds.length === 0) return [];

  const rows = await prisma.curriculum.findMany({
    where: {
      isPublished: true,
      OR: [
        ...(courseIds.length ? [{ courses: { some: { courseId: { in: courseIds } } } }] : []),
        ...(batchIds.length ? [{ batches: { some: { batchId: { in: batchIds } } } }] : []),
      ],
    },
    orderBy: [{ sequence: "asc" }, { number: "asc" }],
    take: 100,
    select: SELECT,
  });
  return rows.map(toRow);
}
