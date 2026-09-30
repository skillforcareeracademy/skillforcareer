import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { notify } from "./notification-service";
import type { CurriculumInput } from "@/lib/validations/curriculum-plan";
import { parseCsv, toCsv } from "@/lib/csv";
import { ensureCurriculumIdentity } from "./academy-ids-service";
import { itemsForBatches } from "./content-group-service";

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
  /** "SFCMCCC001" — the academy's own identifier for it. */
  curriculumId: string | null;
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
  curriculumId: true,
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
    curriculumId: c.curriculumId,
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
  // SFCMCCC001 — allocated after the course links exist, since the course's
  // abbreviation is part of it.
  await ensureCurriculumIdentity(row.id);
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

// ── Taking it in and out as a sheet ──────────────────────────────────────────

const EXPORT_HEADERS = [
  "Curriculum no.",
  "Sequence",
  "Title",
  "Year",
  "Visible",
  "Section",
  "Description",
  "Courses",
  "Batches",
];

/**
 * The whole set as a spreadsheet — one row per section, so a curriculum with
 * eight headings is eight rows that share a title. That is the same shape the
 * importer reads back.
 */
export async function exportCurriculums(): Promise<string> {
  const rows = await listCurriculums();
  const cells: (string | number)[][] = [];
  for (const c of rows) {
    const courses = c.courseTitles.join("; ");
    const batches = c.batchNames.join("; ");
    if (c.tabs.length === 0) {
      cells.push([c.number, c.sequence, c.title, c.year ?? "", c.isPublished ? "Yes" : "No", "", "", courses, batches]);
      continue;
    }
    for (const tab of c.tabs) {
      cells.push([
        c.number,
        c.sequence,
        c.title,
        c.year ?? "",
        c.isPublished ? "Yes" : "No",
        tab.heading,
        tab.description ?? "",
        courses,
        batches,
      ]);
    }
  }
  return toCsv(EXPORT_HEADERS, cells);
}

export interface CurriculumImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

/**
 * Read a sheet back in. Rows that share a title belong to one curriculum, in
 * the order they appear; courses and batches are matched by name, and anything
 * that can't be matched is reported rather than dropped silently.
 */
export async function importCurriculums(
  csv: string,
  createdById: string,
): Promise<CurriculumImportResult> {
  const { headers, rows } = parseCsv(csv);
  if (!headers.length) throw AppError.badRequest("That file has no header row.");

  const norm = (v: string) => v.trim().toLowerCase();
  const column = (want: string) => headers.find((h) => norm(h) === want) ?? "";
  const titleCol = column("title");
  if (!titleCol) {
    throw AppError.badRequest('The sheet needs a "Title" column — download the export to see the shape.');
  }
  const seqCol = column("sequence");
  const yearCol = column("year");
  const visibleCol = column("visible");
  const sectionCol = column("section");
  const descriptionCol = column("description");
  const coursesCol = column("courses");
  const batchesCol = column("batches");

  const [courses, batches] = await Promise.all([
    prisma.course.findMany({ select: { id: true, title: true } }),
    prisma.batch.findMany({ select: { id: true, name: true } }),
  ]);
  const courseByName = new Map(courses.map((c) => [norm(c.title), c.id]));
  const batchByName = new Map(batches.map((b) => [norm(b.name), b.id]));

  interface Draft {
    title: string;
    year: string;
    isPublished: boolean;
    tabs: { heading: string; description: string }[];
    courseIds: string[];
    batchIds: string[];
    line: number;
  }
  const drafts = new Map<string, Draft>();
  const errors: CurriculumImportResult["errors"] = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    const title = (row[titleCol] ?? "").trim();
    if (!title) {
      errors.push({ row: line, message: "No title on this row." });
      return;
    }
    const key = norm(title);
    const draft: Draft = drafts.get(key) ?? {
      title,
      year: yearCol ? (row[yearCol] ?? "").trim() : "",
      isPublished: visibleCol ? !/^(no|false|0)$/i.test((row[visibleCol] ?? "").trim()) : true,
      tabs: [],
      courseIds: [],
      batchIds: [],
      line,
    };
    void seqCol;

    const heading = sectionCol ? (row[sectionCol] ?? "").trim() : "";
    if (heading) {
      draft.tabs.push({
        heading,
        description: descriptionCol ? (row[descriptionCol] ?? "").trim() : "",
      });
    }
    for (const [col, lookup, into] of [
      [coursesCol, courseByName, draft.courseIds],
      [batchesCol, batchByName, draft.batchIds],
    ] as const) {
      if (!col) continue;
      for (const name of (row[col] ?? "").split(";")) {
        const clean = name.trim();
        if (!clean) continue;
        const id = lookup.get(norm(clean));
        if (!id) {
          errors.push({ row: line, message: `Couldn't find "${clean}".` });
          continue;
        }
        if (!into.includes(id)) into.push(id);
      }
    }
    drafts.set(key, draft);
  });

  let created = 0;
  let updated = 0;
  for (const draft of drafts.values()) {
    const input = {
      title: draft.title,
      year: draft.year,
      isPublished: draft.isPublished,
      tabs: draft.tabs,
      courseIds: draft.courseIds,
      batchIds: draft.batchIds,
    };
    // A title the academy already has is updated in place; anything else is new.
    const existing = await prisma.curriculum.findFirst({
      where: { title: draft.title },
      select: { id: true },
    });
    try {
      if (existing) {
        await updateCurriculum(existing.id, input, createdById);
        updated += 1;
      } else {
        await createCurriculum(input, createdById);
        created += 1;
      }
    } catch (error) {
      errors.push({
        row: draft.line,
        message: error instanceof Error ? error.message : "Couldn't save this one.",
      });
    }
  }
  return { created, updated, errors };
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

  // Whole folders handed to their cohort, as with quizzes and study material.
  const viaGroups = await itemsForBatches(batchIds, "CURRICULUM");

  const rows = await prisma.curriculum.findMany({
    where: {
      isPublished: true,
      OR: [
        ...(courseIds.length ? [{ courses: { some: { courseId: { in: courseIds } } } }] : []),
        ...(batchIds.length ? [{ batches: { some: { batchId: { in: batchIds } } } }] : []),
        ...(viaGroups.length ? [{ id: { in: viaGroups } }] : []),
      ],
    },
    orderBy: [{ sequence: "asc" }, { number: "asc" }],
    take: 100,
    select: SELECT,
  });
  return rows.map(toRow);
}
