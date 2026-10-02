import { prisma } from "@/lib/prisma";
import { moveToTrash } from "./trash-service";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { toCsv, parseCsv } from "@/lib/csv";
import {
  MATERIAL_EXPORT_COLUMNS,
  DEFAULT_MATERIAL_COLUMNS,
  type MaterialExportColumn,
  type StudyMaterialInput,
} from "@/lib/validations/study-material";
import {
  groupOptions,
  groupsOfMany,
  itemsInGroups,
  setGroupsFor,
  forgetItem,
} from "./content-group-service";

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
  /** Every course it is set for, the primary one included. */
  courseIds: string[];
  courseTitles: string[];
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
  /** The folders it is filed in, from the shared group system. */
  groupIds: string[];
  groupPaths: string[];
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  /** Everything else attached: more files, images, videos, links. */
  assets: {
    id: string;
    kind: string;
    url: string;
    name: string | null;
    mimeType: string | null;
  }[];
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
  courses: { select: { courseId: true, course: { select: { title: true } } } },
  students: { select: { userId: true } },
  assets: {
    orderBy: { order: "asc" as const },
    select: { id: true, kind: true, url: true, name: true, mimeType: true },
  },
};

type Row = Prisma.StudyMaterialGetPayload<{ select: typeof SELECT }>;

function toRow(
  m: Row,
  reads: Map<string, { readers: number; seconds: number }>,
  groups?: Map<string, { ids: string[]; paths: string[] }>,
): MaterialRow {
  const r = reads.get(m.id);
  const g = groups?.get(m.id);
  // The primary course first, then the rest — the list reads better that way.
  const courseIds = [
    ...(m.courseId ? [m.courseId] : []),
    ...m.courses.map((c) => c.courseId).filter((id) => id !== m.courseId),
  ];
  const courseTitles = [
    ...(m.course?.title ? [m.course.title] : []),
    ...m.courses.filter((c) => c.courseId !== m.courseId).map((c) => c.course.title),
  ];
  return {
    id: m.id,
    number: m.number,
    sequence: m.sequence,
    title: m.title,
    description: m.description,
    courseId: m.courseId,
    courseTitle: m.course?.title ?? null,
    courseIds,
    courseTitles,
    categoryId: m.categoryId,
    categoryName: m.category?.name ?? null,
    subCategoryId: m.subCategoryId,
    subCategoryName: m.subCategory?.name ?? null,
    groupIds: g?.ids ?? [],
    groupPaths: g?.paths ?? [],
    fileUrl: m.fileUrl,
    fileName: m.fileName,
    mimeType: m.mimeType,
    assets: m.assets.map((a) => ({
      id: a.id,
      kind: a.kind,
      url: a.url,
      name: a.name,
      mimeType: a.mimeType,
    })),
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
  /** Any of its courses, primary or otherwise. */
  courseId?: string;
  /** Set for this cohort, by name or through a folder it has been given. */
  batchId?: string;
  /** Filed in this folder, or any folder beneath it. */
  groupId?: string;
  published?: "yes" | "no";
  /** Added on or after / before this date — the export's "date wise". */
  createdFrom?: string;
  createdTo?: string;
  /** Just these pieces, for exporting one file on its own. */
  ids?: string[];
  /** Newest first, or the academy's own order. */
  sort?: "sequence" | "newest" | "title" | "reads";
}

export async function listMaterials(
  q: MaterialListQuery = {},
  ownerId?: string,
): Promise<MaterialRow[]> {
  // A folder filter reaches everything beneath it too.
  const inGroup = q.groupId ? await itemsInGroups("MATERIAL", [q.groupId]) : null;

  const where: Prisma.StudyMaterialWhereInput = {
    AND: [
      ownerScope(ownerId),
      q.search ? { title: { contains: q.search } } : {},
      q.categoryId ? { categoryId: q.categoryId } : {},
      q.subCategoryId ? { subCategoryId: q.subCategoryId } : {},
      // Either the primary course or one of the extra ones.
      q.courseId
        ? {
            OR: [
              { courseId: q.courseId },
              { courses: { some: { courseId: q.courseId } } },
            ],
          }
        : {},
      q.batchId ? { batches: { some: { batchId: q.batchId } } } : {},
      inGroup ? { id: { in: inGroup } } : {},
      q.published === "yes" ? { isPublished: true } : {},
      q.published === "no" ? { isPublished: false } : {},
      q.ids && q.ids.length > 0 ? { id: { in: q.ids } } : {},
      // `createdTo` is a calendar day, so it covers the whole of that day.
      q.createdFrom || q.createdTo
        ? {
            createdAt: {
              ...(q.createdFrom ? { gte: new Date(`${q.createdFrom}T00:00:00.000Z`) } : {}),
              ...(q.createdTo ? { lte: new Date(`${q.createdTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {},
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
  const ids = rows.map((r) => r.id);
  const [reads, groups] = await Promise.all([readTotals(ids), groupPathsFor(ids)]);
  const list = rows.map((m) => toRow(m, reads, groups));
  // Sorting by how much it has been read has to happen after the totals are in.
  return q.sort === "reads" ? list.sort((a, b) => b.readSeconds - a.readSeconds) : list;
}

export async function getMaterial(id: string): Promise<(MaterialRow & { body: string | null }) | null> {
  const m = await prisma.studyMaterial.findUnique({ where: { id }, select: SELECT });
  if (!m) return null;
  const [reads, groups] = await Promise.all([readTotals([m.id]), groupPathsFor([m.id])]);
  return { ...toRow(m, reads, groups), body: m.body };
}

/** Which folders each piece sits in, with their full paths, in one read. */
async function groupPathsFor(ids: string[]) {
  const out = new Map<string, { ids: string[]; paths: string[] }>();
  if (ids.length === 0) return out;
  const [membership, options] = await Promise.all([
    groupsOfMany("MATERIAL", ids),
    groupOptions("MATERIAL"),
  ]);
  const pathOf = new Map(options.map((o) => [o.id, o.path]));
  for (const [itemId, groupIds] of membership) {
    out.set(itemId, {
      ids: groupIds,
      paths: groupIds.map((g) => pathOf.get(g) ?? "").filter(Boolean),
    });
  }
  return out;
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
  const primary = blank(input.courseId);
  // The primary course is stored on the row; the join carries every course it
  // is set for, that one included, so a filter only has one place to look.
  const courseIds = [...new Set([...(primary ? [primary] : []), ...(input.courseIds ?? [])])];
  return {
    batches: { create: (input.batchIds ?? []).map((batchId) => ({ batchId })) },
    courses: { create: courseIds.map((courseId) => ({ courseId })) },
    students: { create: (input.studentIds ?? []).map((userId) => ({ userId })) },
    assets: {
      create: (input.assets ?? []).map((a, i) => ({
        kind: a.kind,
        url: a.url,
        name: blank(a.name),
        mimeType: blank(a.mimeType),
        sizeBytes: a.sizeBytes ?? null,
        order: i,
      })),
    },
  };
}

export async function createMaterial(
  input: StudyMaterialInput,
  createdById: string,
): Promise<string> {
  const hasSomething =
    blank(input.fileUrl) || blank(input.body) || (input.assets ?? []).length > 0;
  if (!hasSomething) {
    throw AppError.badRequest("Attach a file or a link, or write the reading in the panel.");
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
  // Its folders live in the shared group system, not on the row.
  await setGroupsFor("MATERIAL", row.id, input.groupIds ?? []);
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

  // The audience, the courses, the folders and the attachments are all
  // replaced wholesale — the dialog's choices are the truth.
  await prisma.studyMaterialBatch.deleteMany({ where: { materialId: id } });
  await prisma.studyMaterialStudent.deleteMany({ where: { materialId: id } });
  await prisma.studyMaterialCourse.deleteMany({ where: { materialId: id } });
  await prisma.materialAsset.deleteMany({ where: { materialId: id } });

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
  const primaryCourse = blank(input.courseId);
  const courseIds = [
    ...new Set([...(primaryCourse ? [primaryCourse] : []), ...(input.courseIds ?? [])]),
  ];
  if (courseIds.length) {
    await prisma.studyMaterialCourse.createMany({
      data: courseIds.map((courseId) => ({ materialId: id, courseId })),
    });
  }
  if (input.assets?.length) {
    await prisma.materialAsset.createMany({
      data: input.assets.map((a, i) => ({
        materialId: id,
        kind: a.kind,
        url: a.url,
        name: blank(a.name),
        mimeType: blank(a.mimeType),
        sizeBytes: a.sizeBytes ?? null,
        order: i,
      })),
    });
  }
  await setGroupsFor("MATERIAL", id, input.groupIds ?? []);
}

export async function setMaterialPublished(id: string, isPublished: boolean): Promise<void> {
  await prisma.studyMaterial.update({ where: { id }, data: { isPublished } });
}

export async function deleteMaterial(id: string, deletedById: string): Promise<void> {
  await moveToTrash("STUDY_MATERIAL", id, deletedById);
  // The group system holds a loose reference, so it has to be told. The copy
  // above was taken first, so a restore knows which folders it was in.
  await forgetItem("MATERIAL", id);
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

const yesNo = (v: boolean) => (v ? "yes" : "no");
/** A date the way a spreadsheet reads it, not an ISO timestamp. */
const day = (iso: string) => iso.slice(0, 10);

function columnValue(
  key: MaterialExportColumn,
  m: MaterialRow,
  body: string,
): string | number {
  switch (key) {
    case "number": return m.number;
    case "title": return m.title;
    case "description": return m.description ?? "";
    case "folder": return m.groupPaths.join(" | ");
    case "category": return m.categoryName ?? "";
    case "subCategory": return m.subCategoryName ?? "";
    case "course": return m.courseTitle ?? "";
    case "courses": return m.courseTitles.join(" | ");
    case "batches": return m.batchNames.join(" | ");
    case "fileUrl": return m.fileUrl ?? "";
    case "fileName": return m.fileName ?? "";
    case "body": return body;
    case "downloadsEnabled": return yesNo(m.downloadsEnabled);
    case "isPublished": return yesNo(m.isPublished);
    case "readers": return m.readers;
    case "readMinutes": return Math.round(m.readSeconds / 60);
    case "createdBy": return m.createdByName;
    case "createdAt": return day(m.createdAt);
    case "updatedAt": return day(m.updatedAt);
  }
}

function headersFor(columns: MaterialExportColumn[]): string[] {
  return columns.map(
    (key) => MATERIAL_EXPORT_COLUMNS.find((c) => c.key === key)?.label ?? key,
  );
}

/** Only the columns asked for, and only ones we know about. */
function wanted(columns?: string[]): MaterialExportColumn[] {
  const known = new Set(MATERIAL_EXPORT_COLUMNS.map((c) => c.key as string));
  const picked = (columns ?? []).filter((c) => known.has(c)) as MaterialExportColumn[];
  return picked.length > 0 ? picked : DEFAULT_MATERIAL_COLUMNS;
}

export interface MaterialExportOptions extends MaterialListQuery {
  columns?: string[];
}

/**
 * The library as a spreadsheet, narrowed to whatever the academy picked —
 * a folder and everything beneath it, a course, a cohort, a span of dates, a
 * single piece, or the lot.
 */
export async function exportMaterials(
  opts: MaterialExportOptions = {},
  ownerId?: string,
): Promise<string> {
  const { columns, ...query } = opts;
  const picked = wanted(columns);
  const rows = await listMaterials({ ...query, sort: query.sort ?? "sequence" }, ownerId);

  // The written text is the one field the list doesn't carry, and it is only
  // read when the sheet actually asks for it.
  const bodyOf = new Map<string, string>();
  if (picked.includes("body") && rows.length > 0) {
    const bodies = await prisma.studyMaterial.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true, body: true },
    });
    bodies.forEach((b) => bodyOf.set(b.id, b.body ?? ""));
  }

  return toCsv(
    headersFor(picked),
    rows.map((m) => picked.map((key) => columnValue(key, m, bodyOf.get(m.id) ?? ""))),
  );
}

/**
 * A blank sheet with the chosen columns and one filled-in row to copy —
 * "allow me to download sample sheet as per my requirement to upload". The
 * example is what makes it usable: a header on its own doesn't say whether
 * Published wants a tick, a yes, or a 1.
 */
export function materialSampleSheet(columns?: string[]): string {
  const picked = wanted(columns);
  const example: Record<MaterialExportColumn, string> = {
    number: "1",
    title: "Chapter 1 — Introduction",
    description: "What this chapter covers",
    folder: "Medical Coding → Medical Anatomy",
    category: "Medical Coding",
    subCategory: "Medical Anatomy",
    course: "Medical Coding Course, 2026",
    courses: "Medical Coding Course, 2026 | Advanced Coding",
    batches: "Batch 001 | Batch 002",
    fileUrl: "https://example.com/chapter-1.pdf",
    fileName: "chapter-1.pdf",
    body: "Type the reading here, or leave it blank when a file is attached.",
    downloadsEnabled: "yes",
    isPublished: "no",
    readers: "0",
    readMinutes: "0",
    createdBy: "",
    createdAt: "",
    updatedAt: "",
  };
  return toCsv(headersFor(picked), [picked.map((key) => example[key])]);
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
