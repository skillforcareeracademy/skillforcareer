import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { MaterialHighlightInput } from "@/lib/validations/study-material";
import { groupOptions, groupsOfMany, itemsForBatches } from "./content-group-service";

/**
 * Study material as a learner meets it: what is set for them, how long they
 * have spent with it, and the passages they have marked.
 *
 * The audience rule is the one quizzes and assignments already use — material
 * naming no cohort and no learner reaches everyone on its course; material
 * naming either reaches only those. Published only, always.
 */

/** A single heartbeat's ceiling, so a wedged timer can't inflate a total. */
const MAX_HEARTBEAT_SECONDS = 120;

export interface LearnerMaterial {
  id: string;
  number: number;
  sequence: number;
  title: string;
  description: string | null;
  courseTitle: string | null;
  categoryName: string | null;
  subCategoryName: string | null;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  /** More files, images, video and links attached to the reading. */
  assets: { id: string; kind: string; url: string; name: string | null }[];
  hasBody: boolean;
  downloadsEnabled: boolean;
  /** This learner's own reading. */
  readSeconds: number;
  opens: number;
  highlights: number;
  updatedAt: string;
}

async function audienceScope(userId: string): Promise<Prisma.StudyMaterialWhereInput | null> {
  const enrolments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true, batchId: true },
  });
  const courseIds = [...new Set(enrolments.map((e) => e.courseId))];
  const batchIds = [...new Set(enrolments.map((e) => e.batchId).filter((b): b is string => !!b))];

  const or: Prisma.StudyMaterialWhereInput[] = [{ students: { some: { userId } } }];
  if (courseIds.length) {
    // Either the primary course or one of the extra ones it was set for.
    or.push({
      OR: [{ courseId: { in: courseIds } }, { courses: { some: { courseId: { in: courseIds } } } }],
      batches: { none: {} },
      students: { none: {} },
    });
  }
  if (batchIds.length) or.push({ batches: { some: { batchId: { in: batchIds } } } });

  // Whole folders handed to their cohort — "pure group ka access batch me de du
  // and wo saare group and uski quizzes usko assign ho jaayein". Anything added
  // to the folder later is included without touching the batch again.
  const viaGroups = await itemsForBatches(batchIds, "MATERIAL");
  if (viaGroups.length) or.push({ id: { in: viaGroups } });

  return { isPublished: true, OR: or };
}

export async function listMaterialsForLearner(userId: string): Promise<LearnerMaterial[]> {
  const scope = await audienceScope(userId);
  if (!scope) return [];

  const rows = await prisma.studyMaterial.findMany({
    where: scope,
    orderBy: [{ sequence: "asc" }, { number: "asc" }],
    take: 500,
    select: {
      id: true,
      number: true,
      sequence: true,
      title: true,
      description: true,
      fileUrl: true,
      fileName: true,
      mimeType: true,
      body: true,
      downloadsEnabled: true,
      updatedAt: true,
      course: { select: { title: true } },
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      assets: {
        orderBy: { order: "asc" as const },
        select: { id: true, kind: true, url: true, name: true },
      },
    },
  });
  if (rows.length === 0) return [];

  // The learner's own reading and marks, two flat reads rather than a relation
  // on each row — `relationMode = "prisma"` would make those round trips.
  const ids = rows.map((r) => r.id);
  const [reads, marks] = await Promise.all([
    prisma.materialRead.findMany({
      where: { userId, materialId: { in: ids } },
      select: { materialId: true, seconds: true, opens: true },
    }),
    prisma.materialHighlight.groupBy({
      by: ["materialId"],
      where: { userId, materialId: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  const readBy = new Map(reads.map((r) => [r.materialId, r]));
  const markBy = new Map(marks.map((m) => [m.materialId, m._count._all]));

  // Which folders each piece sits in. The learner's browser groups on a
  // category and a sub-category, so the first folder's path fills both: a path
  // three deep reads as "Anatomy" then "Upper limb → Humerus".
  const [membership, options] = await Promise.all([
    groupsOfMany("MATERIAL", ids),
    groupOptions("MATERIAL"),
  ]);
  const pathOf = new Map(options.map((o) => [o.id, o.path]));
  const folderFor = (materialId: string) => {
    const first = (membership.get(materialId) ?? [])
      .map((g) => pathOf.get(g))
      .filter((p): p is string => Boolean(p))
      .sort()[0];
    if (!first) return { category: null as string | null, sub: null as string | null };
    const [head, ...rest] = first.split(" → ");
    return { category: head, sub: rest.length ? rest.join(" → ") : null };
  };

  return rows.map((m) => {
    const folder = folderFor(m.id);
    return {
    id: m.id,
    number: m.number,
    sequence: m.sequence,
    title: m.title,
    description: m.description,
    courseTitle: m.course?.title ?? null,
    categoryName: folder.category ?? m.category?.name ?? null,
    subCategoryName: folder.sub ?? m.subCategory?.name ?? null,
    fileUrl: m.fileUrl,
    fileName: m.fileName,
    mimeType: m.mimeType,
    assets: m.assets,
    hasBody: Boolean(m.body && m.body.trim()),
    downloadsEnabled: m.downloadsEnabled,
    readSeconds: readBy.get(m.id)?.seconds ?? 0,
    opens: readBy.get(m.id)?.opens ?? 0,
    highlights: markBy.get(m.id) ?? 0,
    updatedAt: m.updatedAt.toISOString(),
    };
  });
}

export interface LearnerMaterialDetail extends LearnerMaterial {
  body: string | null;
  marks: {
    id: string;
    quote: string;
    startOffset: number;
    note: string | null;
    color: string;
    createdAt: string;
  }[];
}

/** One piece, with its text and this learner's own marks on it. */
export async function getMaterialForLearner(
  userId: string,
  materialId: string,
): Promise<LearnerMaterialDetail | null> {
  const scope = await audienceScope(userId);
  if (!scope) return null;
  const m = await prisma.studyMaterial.findFirst({
    where: { AND: [{ id: materialId }, scope] },
    select: {
      id: true,
      number: true,
      sequence: true,
      title: true,
      description: true,
      fileUrl: true,
      fileName: true,
      mimeType: true,
      body: true,
      downloadsEnabled: true,
      updatedAt: true,
      course: { select: { title: true } },
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      assets: {
        orderBy: { order: "asc" as const },
        select: { id: true, kind: true, url: true, name: true },
      },
    },
  });
  if (!m) return null;

  const [read, marks] = await Promise.all([
    prisma.materialRead.findUnique({
      where: { materialId_userId: { materialId, userId } },
      select: { seconds: true, opens: true },
    }),
    prisma.materialHighlight.findMany({
      where: { materialId, userId },
      orderBy: { startOffset: "asc" },
      select: {
        id: true,
        quote: true,
        startOffset: true,
        note: true,
        color: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    id: m.id,
    number: m.number,
    sequence: m.sequence,
    title: m.title,
    description: m.description,
    courseTitle: m.course?.title ?? null,
    categoryName: m.category?.name ?? null,
    subCategoryName: m.subCategory?.name ?? null,
    fileUrl: m.fileUrl,
    fileName: m.fileName,
    mimeType: m.mimeType,
    assets: m.assets,
    hasBody: Boolean(m.body && m.body.trim()),
    downloadsEnabled: m.downloadsEnabled,
    readSeconds: read?.seconds ?? 0,
    opens: read?.opens ?? 0,
    highlights: marks.length,
    updatedAt: m.updatedAt.toISOString(),
    body: m.body,
    marks: marks.map((h) => ({
      id: h.id,
      quote: h.quote,
      startOffset: h.startOffset,
      note: h.note,
      color: h.color,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}

async function mayRead(userId: string, materialId: string): Promise<boolean> {
  const scope = await audienceScope(userId);
  if (!scope) return false;
  const found = await prisma.studyMaterial.findFirst({
    where: { AND: [{ id: materialId }, scope] },
    select: { id: true },
  });
  return Boolean(found);
}

/** A heartbeat from the reader. Quiet about refusals, like the notes reader. */
export async function recordMaterialRead(
  userId: string,
  materialId: string,
  seconds: number,
  opened = false,
): Promise<void> {
  const add = Math.max(0, Math.min(MAX_HEARTBEAT_SECONDS, Math.round(seconds)));
  if (add === 0 && !opened) return;
  if (!(await mayRead(userId, materialId))) return;

  const existing = await prisma.materialRead.findUnique({
    where: { materialId_userId: { materialId, userId } },
    select: { id: true },
  });
  if (!existing) {
    await prisma.materialRead.create({
      data: { materialId, userId, opens: 1, seconds: add },
    });
    return;
  }
  // Raw, so two heartbeats landing together add up rather than overwrite.
  await prisma.$executeRaw`
    UPDATE \`MaterialRead\`
       SET seconds = seconds + ${add},
           opens = opens + ${opened ? 1 : 0},
           lastReadAt = NOW()
     WHERE id = ${existing.id}`;
}

/**
 * A download, if the academy allows one. Counted, so the office can see who has
 * taken a copy; refused outright when the switch is off.
 */
export async function consumeMaterialDownload(
  userId: string,
  materialId: string,
): Promise<{ url: string; name: string }> {
  const scope = await audienceScope(userId);
  const m = scope
    ? await prisma.studyMaterial.findFirst({
        where: { AND: [{ id: materialId }, scope] },
        select: { fileUrl: true, fileName: true, title: true, downloadsEnabled: true },
      })
    : null;
  if (!m) throw AppError.notFound("That material isn't available to you.");
  if (!m.downloadsEnabled) {
    throw AppError.forbidden("This material is for reading in the panel — downloads are off.");
  }
  if (!m.fileUrl) throw AppError.badRequest("There's no file to download.");

  const existing = await prisma.materialRead.findUnique({
    where: { materialId_userId: { materialId, userId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.$executeRaw`
      UPDATE \`MaterialRead\` SET downloads = downloads + 1, lastReadAt = NOW()
       WHERE id = ${existing.id}`;
  } else {
    await prisma.materialRead.create({
      data: { materialId, userId, opens: 1, downloads: 1 },
    });
  }
  return { url: m.fileUrl, name: m.fileName ?? m.title };
}

// ── The learner's own marks ─────────────────────────────────────────────────

export async function addHighlight(
  userId: string,
  materialId: string,
  input: MaterialHighlightInput,
): Promise<string> {
  if (!(await mayRead(userId, materialId))) {
    throw AppError.notFound("That material isn't available to you.");
  }
  const row = await prisma.materialHighlight.create({
    data: {
      materialId,
      userId,
      quote: input.quote,
      startOffset: input.startOffset ?? 0,
      note: input.note?.trim() || null,
      color: input.color ?? "yellow",
    },
    select: { id: true },
  });
  return row.id;
}

/** A mark is the learner's own — the id alone is never authority to touch it. */
export async function updateHighlight(
  userId: string,
  id: string,
  input: Partial<MaterialHighlightInput>,
): Promise<void> {
  const mine = await prisma.materialHighlight.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!mine) throw AppError.notFound("That highlight is gone.");
  await prisma.materialHighlight.update({
    where: { id },
    data: {
      ...(input.note === undefined ? {} : { note: input.note?.trim() || null }),
      ...(input.color ? { color: input.color } : {}),
    },
  });
}

export async function deleteHighlight(userId: string, id: string): Promise<void> {
  const mine = await prisma.materialHighlight.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!mine) throw AppError.notFound("That highlight is gone.");
  await prisma.materialHighlight.delete({ where: { id } });
}

/** Everything this learner has marked, newest first — their revision list. */
export async function listMyHighlights(userId: string) {
  const rows = await prisma.materialHighlight.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      quote: true,
      note: true,
      color: true,
      createdAt: true,
      material: { select: { id: true, title: true, number: true } },
    },
  });
  return rows.map((h) => ({
    id: h.id,
    quote: h.quote,
    note: h.note,
    color: h.color,
    createdAt: h.createdAt.toISOString(),
    materialId: h.material.id,
    materialTitle: h.material.title,
    materialNumber: h.material.number,
  }));
}

/** Who has read one piece, and for how long — the instructor's column. */
export async function readersOfMaterial(materialId: string) {
  const rows = await prisma.materialRead.findMany({
    where: { materialId },
    orderBy: { lastReadAt: "desc" },
    take: 500,
    select: {
      userId: true,
      opens: true,
      seconds: true,
      downloads: true,
      lastReadAt: true,
      user: { select: { name: true, email: true } },
    },
  });
  return rows.map((r) => ({
    userId: r.userId,
    name: r.user.name,
    email: r.user.email,
    opens: r.opens,
    seconds: r.seconds,
    downloads: r.downloads,
    lastReadAt: r.lastReadAt.toISOString(),
  }));
}
