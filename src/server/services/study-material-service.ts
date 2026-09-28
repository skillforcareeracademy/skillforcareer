import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { toCsv, parseCsv } from "@/lib/csv";
import type { StudyMaterialInput } from "@/lib/validations/study-material";

/**
 * Study material — the reading a course sets, and what a learner does with it.
 *
 * The academy asked for it to work like the quiz module, and it does: a
 * category and sub-category, a permanent number that never changes, a
 * rearrangeable order inside the group, an audience of cohorts or named
 * learners (neither means everyone on the course), a download switch, and a
 * record of who has read what and for how long. An instructor sees only their
 * own courses' and batches' material.
 */

const blank = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

export interface MaterialRow {
  id: string;
  number: number;
  sequence: number;
  title: string;
  description: string | null;
  courseId: string | null;
  courseTitle: string | null;
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  hasBody: boolean;
  downloadsEnabled: boolean;
  isPublished: boolean;
  batchIds: string[];
  batchNames: string[];
  studentIds: string[];
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** How many learners have opened it, and the time they have spent in total. */
  readers: number;
  readSeconds: number;
}

const SELECT = {
  id: true,
  number: true,
  sequence: true,
  title: true,
  description: true,
  courseId: true,
  categoryId: true,
  subCategoryId: true,
  fileUrl: true,
  fileName: true,
  mimeType: true,
  body: true,
  downloadsEnabled: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { title: true } },
  category: { select: { name: true } },
  subCategory: { select: { name: true } },
  createdBy: { select: { name: true } },
  batches: { select: { batchId: true, batch: { select: { name: true } } } },
  students: { select: { userId: true } },
};

type Row = Prisma.StudyMaterialGetPayload<{ select: typeof SELECT }>;

function toRow(m: Row, reads: Map<string, { readers: number; seconds: number }>): MaterialRow {
  const r = reads.get(m.id);
  return {
    id: m.id,
    number: m.number,
    sequence: m.sequence,
    title: m.title,
    description: m.description,
    courseId: m.courseId,
    courseTitle: m.course?.title ?? null,
    categoryId: m.categoryId,
    categoryName: m.category?.name ?? null,
    subCategoryId: m.subCategoryId,
    subCategoryName: m.subCategory?.name ?? null,
    fileUrl: m.fileUrl,
    fileName: m.fileName,
    mimeType: m.mimeType,
    hasBody: Boolean(m.body && m.body.trim()),
    downloadsEnabled: m.downloadsEnabled,
    isPublished: m.isPublished,
    batchIds: m.batches.map((b) => b.batchId),
    batchNames: m.batches.map((b) => b.batch.name),
    studentIds: m.students.map((s) => s.userId),
    createdByName: m.createdBy.name,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    readers: r?.readers ?? 0,
    readSeconds: r?.seconds ?? 0,
  };
}

/** Reading totals for a set of material, in one query rather than one each. */
async function readTotals(ids: string[]) {
  const map = new Map<string, { readers: number; seconds: number }>();
  if (ids.length === 0) return map;
  const rows = await prisma.$queryRaw<
    { materialId: string; readers: bigint; seconds: bigint | null }[]
  >`
    SELECT materialId, COUNT(*) AS readers, SUM(seconds) AS seconds
      FROM MaterialRead
     WHERE materialId IN (${Prisma.join(ids)})
     GROUP BY materialId`;
  for (const r of rows) {
    map.set(r.materialId, { readers: Number(r.readers), seconds: Number(r.seconds ?? 0) });
  }
  return map;
}

/** An instructor sees their own material and their own courses' and batches'. */
function ownerScope(ownerId?: string): Prisma.StudyMaterialWhereInput {
  if (!ownerId) return {};
  return {
    OR: [
      { createdById: ownerId },
      { course: { instructorId: ownerId } },
      { batches: { some: { batch: { instructorId: ownerId } } } },
      { batches: { some: { batch: { associates: { some: { userId: ownerId } } } } } },
    ],
  };
}

export interface MaterialListQuery {
  search?: string;
  categoryId?: string;
  subCategoryId?: string;
  courseId?: string;
  published?: "yes" | "no";
  /** Newest first, or the academy's own order. */
  sort?: "sequence" | "newest" | "title" | "reads";
}

export async function listMaterials(
  q: MaterialListQuery = {},
  ownerId?: string,
): Promise<MaterialRow[]> {
  const where: Prisma.StudyMaterialWhereInput = {
    AND: [
      ownerScope(ownerId),
      q.search ? { title: { contains: q.search } } : {},
      q.categoryId ? { categoryId: q.categoryId } : {},
      q.subCategoryId ? { subCategoryId: q.subCategoryId } : {},
      q.courseId ? { courseId: q.courseId } : {},
      q.published === "yes" ? { isPublished: true } : {},
      q.published === "no" ? { isPublished: false } : {},
    ],
  };
  const rows = await prisma.studyMaterial.findMany({
    where,
    orderBy:
      q.sort === "newest"
        ? [{ createdAt: "desc" }]
        : q.sort === "title"
          ? [{ title: "asc" }]
          : [{ sequence: "asc" }, { number: "asc" }],
    take: 500,
    select: SELECT,
  });
  const reads = await readTotals(rows.map((r) => r.id));
  const list = rows.map((m) => toRow(m, reads));
  // Sorting by how much it has been read has to happen after the totals are in.
  return q.sort === "reads" ? list.sort((a, b) => b.readSeconds - a.readSeconds) : list;
}

export async function getMaterial(id: string): Promise<(MaterialRow & { body: string | null }) | null> {
  const m = await prisma.studyMaterial.findUnique({ where: { id }, select: SELECT });
  if (!m) return null;
  const reads = await readTotals([m.id]);
  return { ...toRow(m, reads), body: m.body };
}

export interface MaterialStats {
  total: number;
  published: number;
  withFile: number;
  readers: number;
}

export async function materialStats(ownerId?: string): Promise<MaterialStats> {
  const scope = ownerScope(ownerId);
  const [total, published, withFile, readers] = await Promise.all([
    prisma.studyMaterial.count({ where: scope }),
    prisma.studyMaterial.count({ where: { AND: [scope, { isPublished: true }] } }),
    prisma.studyMaterial.count({ where: { AND: [scope, { fileUrl: { not: null } }] } }),
    prisma.materialRead.count(),
  ]);
  return { total, published, withFile, readers };
}

/**
 * The next permanent number — one run across the academy, never reused, so
 * "Material 14" means the same thing next year.
 */
async function nextNumber(): Promise<number> {
  const top = await prisma.studyMaterial.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (top?.number ?? 0) + 1;
}

function groupWhere(
  categoryId: string | null,
  subCategoryId: string | null,
): Prisma.StudyMaterialWhereInput {
  if (subCategoryId) return { subCategoryId };
  if (categoryId) return { categoryId, subCategoryId: null };
  return { categoryId: null, subCategoryId: null };
}

/** The next place in its own group, so a new piece lands at the end of it. */
async function nextSequence(
  categoryId: string | null,
  subCategoryId: string | null,
): Promise<number> {
  const last = await prisma.studyMaterial.findFirst({
    where: groupWhere(categoryId, subCategoryId),
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return (last?.sequence ?? 0) + 1;
}

function audienceData(input: StudyMaterialInput) {
  return {
    batches: { create: (input.batchIds ?? []).map((batchId) => ({ batchId })) },
    students: { create: (input.studentIds ?? []).map((userId) => ({ userId })) },
  };
}

export async function createMaterial(
  input: StudyMaterialInput,
  createdById: string,
): Promise<string> {
  if (!blank(input.fileUrl) && !blank(input.body)) {
    throw AppError.badRequest("Upload a file or write the material in the panel.");
  }
  const categoryId = blank(input.categoryId);
  const subCategoryId = categoryId ? blank(input.subCategoryId) : null;

  const row = await prisma.studyMaterial.create({
    data: {
      title: input.title,
      description: blank(input.description),
      courseId: blank(input.courseId),
      categoryId,
      subCategoryId,
      fileUrl: blank(input.fileUrl),
      fileName: blank(input.fileName),
      mimeType: blank(input.mimeType),
      body: blank(input.body),
      downloadsEnabled: input.downloadsEnabled ?? true,
      isPublished: input.isPublished ?? false,
      number: await nextNumber(),
      sequence: await nextSequence(categoryId, subCategoryId),
      createdById,
      ...audienceData(input),
    },
    select: { id: true },
  });
  return row.id;
}

export async function updateMaterial(id: string, input: StudyMaterialInput): Promise<void> {
  const existing = await prisma.studyMaterial.findUnique({
    where: { id },
    select: { id: true, categoryId: true, subCategoryId: true },
  });
  if (!existing) throw AppError.notFound("Material not found.");

  const categoryId = blank(input.categoryId);
  const subCategoryId = categoryId ? blank(input.subCategoryId) : null;
  const moved = categoryId !== existing.categoryId || subCategoryId !== existing.subCategoryId;

  await prisma.studyMaterial.update({
    where: { id },
    data: {
      title: input.title,
      description: blank(input.description),
      courseId: blank(input.courseId),
      categoryId,
      subCategoryId,
      fileUrl: blank(input.fileUrl),
      fileName: blank(input.fileName),
      mimeType: blank(input.mimeType),
      body: blank(input.body),
      downloadsEnabled: input.downloadsEnabled ?? true,
      isPublished: input.isPublished ?? false,
      // Moved to another group, so it joins the end of that one.
      ...(moved ? { sequence: await nextSequence(categoryId, subCategoryId) } : {}),
    },
  });

  // The audience is replaced wholesale — the dialog's choices are the truth.
  await prisma.studyMaterialBatch.deleteMany({ where: { materialId: id } });
  await prisma.studyMaterialStudent.deleteMany({ where: { materialId: id } });
  if (input.batchIds?.length) {
    await prisma.studyMaterialBatch.createMany({
      data: input.batchIds.map((batchId) => ({ materialId: id, batchId })),
    });
  }
  if (input.studentIds?.length) {
    await prisma.studyMaterialStudent.createMany({
      data: input.studentIds.map((userId) => ({ materialId: id, userId })),
    });
  }
}

export async function setMaterialPublished(id: string, isPublished: boolean): Promise<void> {
  await prisma.studyMaterial.update({ where: { id }, data: { isPublished } });
}

export async function deleteMaterial(id: string): Promise<void> {
  await prisma.studyMaterial.delete({ where: { id } });
}

/** Drag-and-drop order, written in one statement. */
export async function reorderMaterials(ids: string[], ownerId?: string): Promise<number> {
  const rows = await prisma.studyMaterial.findMany({
    where: { AND: [{ id: { in: ids } }, ownerScope(ownerId)] },
    select: { id: true },
  });
  const allowed = new Set(rows.map((r) => r.id));
  const ordered = ids.filter((id) => allowed.has(id));
  if (ordered.length === 0) throw AppError.badRequest("Nothing to reorder.");

  const cases = ordered.map((id, i) => Prisma.sql`WHEN ${id} THEN ${i + 1}`);
  // One statement: a multi-row `updateMany` throws on a model that owns a
  // one-to-one relation under `relationMode = "prisma"`.
  await prisma.$executeRaw`
    UPDATE \`StudyMaterial\`
    SET \`sequence\` = CASE id ${Prisma.join(cases, " ")} END,
        updatedAt = ${new Date()}
    WHERE id IN (${Prisma.join(ordered.map((id) => Prisma.sql`${id}`))})`;
  return ordered.length;
}

/** Number anything still at 0 — material made before numbering, or a failed run. */
export async function backfillMaterialNumbers(): Promise<number> {
  const rows = await prisma.studyMaterial.findMany({
    where: { number: { lte: 0 } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (rows.length === 0) return 0;
  let next = await nextNumber();
  const cases = rows.map((r) => Prisma.sql`WHEN ${r.id} THEN ${next++}`);
  await prisma.$executeRaw`
    UPDATE \`StudyMaterial\`
    SET number = CASE id ${Prisma.join(cases, " ")} END
    WHERE id IN (${Prisma.join(rows.map((r) => Prisma.sql`${r.id}`))})`;
  return rows.length;
}

// ── Import / export ─────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "number",
  "title",
  "description",
  "category",
  "subCategory",
  "course",
  "fileUrl",
  "fileName",
  "body",
  "downloadsEnabled",
  "isPublished",
  "readers",
  "readMinutes",
];

export async function exportMaterials(ownerId?: string): Promise<string> {
  const rows = await listMaterials({ sort: "sequence" }, ownerId);
  const bodies = await prisma.studyMaterial.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: { id: true, body: true },
  });
  const bodyOf = new Map(bodies.map((b) => [b.id, b.body ?? ""]));
  return toCsv(
    CSV_HEADERS,
    rows.map((m) => [
      m.number,
      m.title,
      m.description ?? "",
      m.categoryName ?? "",
      m.subCategoryName ?? "",
      m.courseTitle ?? "",
      m.fileUrl ?? "",
      m.fileName ?? "",
      bodyOf.get(m.id) ?? "",
      m.downloadsEnabled ? "yes" : "no",
      m.isPublished ? "yes" : "no",
      m.readers,
      Math.round(m.readSeconds / 60),
    ]),
  );
}

export interface MaterialImportResult {
  created: number;
  updated: number;
  skipped: { row: number; reason: string }[];
}

/**
 * Bring material in from a spreadsheet. A title that already exists is updated
 * rather than duplicated, and a category named in the sheet is created if it
 * isn't there — the academy's sheets are written before the panel is filled.
 */
export async function importMaterials(
  csv: string,
  createdById: string,
): Promise<MaterialImportResult> {
  const { rows } = parseCsv(csv);
  const result: MaterialImportResult = { created: 0, updated: 0, skipped: [] };
  if (rows.length === 0) return result;

  const categories = await prisma.materialCategory.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const byName = new Map(categories.map((c) => [`${c.parentId ?? ""}:${c.name.toLowerCase()}`, c.id]));

  async function categoryFor(name: string, parentId: string | null): Promise<string | null> {
    const clean = name.trim();
    if (!clean) return null;
    const key = `${parentId ?? ""}:${clean.toLowerCase()}`;
    const found = byName.get(key);
    if (found) return found;
    const last = await prisma.materialCategory.findFirst({
      where: { parentId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const made = await prisma.materialCategory.create({
      data: { name: clean, parentId, order: (last?.order ?? -1) + 1 },
      select: { id: true },
    });
    byName.set(key, made.id);
    return made.id;
  }

  const courses = await prisma.course.findMany({ select: { id: true, title: true } });
  const courseByTitle = new Map(courses.map((c) => [c.title.toLowerCase(), c.id]));

  for (const [i, row] of rows.entries()) {
    const line = i + 2; // the header is line 1
    const title = (row.title ?? "").trim();
    if (!title) {
      result.skipped.push({ row: line, reason: "No title." });
      continue;
    }
    const fileUrl = (row.fileUrl ?? "").trim();
    const body = row.body ?? "";
    if (!fileUrl && !body.trim()) {
      result.skipped.push({ row: line, reason: "Neither a file nor any text." });
      continue;
    }

    const categoryId = await categoryFor(row.category ?? "", null);
    const subCategoryId = categoryId
      ? await categoryFor(row.subCategory ?? "", categoryId)
      : null;
    const courseId = courseByTitle.get((row.course ?? "").trim().toLowerCase()) ?? null;
    const yes = (v: string | undefined) => (v ?? "").trim().toLowerCase() !== "no";

    const existing = await prisma.studyMaterial.findFirst({
      where: { title },
      select: { id: true },
    });
    const data = {
      title,
      description: blank(row.description) ?? null,
      courseId,
      categoryId,
      subCategoryId,
      fileUrl: blank(fileUrl),
      fileName: blank(row.fileName),
      body: blank(body),
      downloadsEnabled: yes(row.downloadsEnabled),
      isPublished: (row.isPublished ?? "").trim().toLowerCase() === "yes",
    };

    if (existing) {
      await prisma.studyMaterial.update({ where: { id: existing.id }, data });
      result.updated += 1;
    } else {
      await prisma.studyMaterial.create({
        data: {
          ...data,
          number: await nextNumber(),
          sequence: await nextSequence(categoryId, subCategoryId),
          createdById,
        },
      });
      result.created += 1;
    }
  }
  return result;
}

export const MATERIAL_IMPORT_HEADERS = CSV_HEADERS;
