import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

/**
 * Merging batches, and separating them again — "batch merge ka feature chahiye
 * with all details to be merged. And separate krne ka option bhi chahiye."
 *
 * A merge folds one or more source batches into a target: every learner,
 * meeting, attendance mark, note, board slide and every assigned quiz,
 * assignment, study material, curriculum, group and co-trainer moves onto the
 * target. Only batches of the *same course* can merge — a batch belongs to one
 * course, so moving another course's learners into it would be nonsense.
 *
 * Every row that moves is written to a `BatchMerge` ledger with the batch it
 * came from, so separating puts each batch back exactly as it was — including
 * the rows that were dropped on the way in because the target already had them.
 */

/** One moved thing: `e` the kind, `id` the row id (direct) or item key (join),
 *  `from` its original batch, `dup` true when it was dropped as a duplicate. */
interface LedgerEntry {
  e: string;
  id: string;
  from: string;
  dup?: boolean;
}

/** Rows that hang off a batch directly — moved by their own id, no key clashes. */
const DIRECT = [
  { e: "enrollment", model: "enrollment" },
  { e: "meeting", model: "meeting" },
  { e: "attendance", model: "attendance" },
  { e: "lessonAccess", model: "lessonAccess" },
  { e: "recordingAccess", model: "recordingAccess" },
  { e: "batchNote", model: "batchNote" },
  { e: "boardSlide", model: "boardSlide" },
] as const;

/** Join rows keyed by an item — the target keeps its own, a source duplicate is
 *  dropped (and recreated on separate). */
const JOIN = [
  { e: "quiz", model: "quizBatch", key: "quizId" },
  { e: "assignment", model: "assignmentBatch", key: "assignmentId" },
  { e: "material", model: "studyMaterialBatch", key: "materialId" },
  { e: "curriculum", model: "curriculumBatch", key: "curriculumId" },
  { e: "groupAccess", model: "batchGroupAccess", key: "groupId" },
  { e: "associate", model: "batchInstructor", key: "userId" },
] as const;

interface AnyDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    select?: Record<string, boolean>;
  }): Promise<Record<string, unknown>[]>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  createMany(args: {
    data: Record<string, unknown>[];
    skipDuplicates?: boolean;
  }): Promise<{ count: number }>;
}
const delegate = (model: string) =>
  (prisma as unknown as Record<string, AnyDelegate>)[model]!;

async function recount(batchIds: string[]): Promise<void> {
  for (const id of batchIds) {
    const n = await prisma.enrollment.count({ where: { batchId: id } });
    await prisma.batch.update({ where: { id }, data: { enrolledCount: n } });
  }
}

/** Batches already caught up in a live merge — can't be merged again until separated. */
async function lockedBatches(): Promise<Set<string>> {
  const live = await prisma.batchMerge.findMany({
    where: { status: "MERGED" },
    select: { targetBatchId: true, sourceBatchIds: true },
  });
  const locked = new Set<string>();
  for (const m of live) {
    locked.add(m.targetBatchId);
    for (const s of (m.sourceBatchIds as string[]) ?? []) locked.add(s);
  }
  return locked;
}

export async function mergeBatches(
  targetId: string,
  sourceIds: string[],
  actor?: { id: string },
): Promise<string> {
  const sources = [...new Set(sourceIds.filter((id) => id && id !== targetId))];
  if (sources.length === 0) {
    throw AppError.badRequest("Pick at least one other batch to merge in.");
  }

  const ids = [targetId, ...sources];
  const batches = await prisma.batch.findMany({
    where: { id: { in: ids } },
    select: { id: true, courseId: true },
  });
  const target = batches.find((b) => b.id === targetId);
  if (!target) throw AppError.notFound("Target batch not found.");
  if (batches.length !== ids.length) {
    throw AppError.badRequest("One of the batches no longer exists.");
  }
  if (batches.some((b) => b.courseId !== target.courseId)) {
    throw AppError.badRequest("Only batches of the same course can be merged.");
  }
  const locked = await lockedBatches();
  if (ids.some((id) => locked.has(id))) {
    throw AppError.badRequest(
      "One of these batches is already part of a merge — separate that one first.",
    );
  }

  const ledger: LedgerEntry[] = [];

  // Plan the direct moves: record every row's id and where it came from.
  for (const { e, model } of DIRECT) {
    const rows = await delegate(model).findMany({
      where: { batchId: { in: sources } },
      select: { id: true, batchId: true },
    });
    for (const r of rows) {
      ledger.push({ e, id: String(r.id), from: String(r.batchId) });
    }
  }

  // Plan the join moves: the target keeps what it already has; the first source
  // to bring a new item moves it, later ones are dropped as duplicates.
  const joinPlan: { model: string; moveIds: string[]; dupIds: string[] }[] = [];
  for (const { e, model, key } of JOIN) {
    const targetRows = await delegate(model).findMany({
      where: { batchId: targetId },
      select: { [key]: true },
    });
    const claimed = new Set(targetRows.map((r) => String(r[key])));
    const srcRows = await delegate(model).findMany({
      where: { batchId: { in: sources } },
      select: { id: true, batchId: true, [key]: true },
    });
    const moveIds: string[] = [];
    const dupIds: string[] = [];
    for (const r of srcRows) {
      const k = String(r[key]);
      const from = String(r.batchId);
      if (claimed.has(k)) {
        dupIds.push(String(r.id));
        ledger.push({ e, id: k, from, dup: true });
      } else {
        claimed.add(k);
        moveIds.push(String(r.id));
        ledger.push({ e, id: k, from, dup: false });
      }
    }
    joinPlan.push({ model, moveIds, dupIds });
  }

  // Record the complete ledger before moving anything, so a failure part-way
  // through is still fully reversible.
  const merge = await prisma.batchMerge.create({
    data: {
      targetBatchId: targetId,
      sourceBatchIds: sources,
      ledger: ledger as unknown as object,
      createdById: actor?.id ?? null,
      status: "MERGED",
    },
    select: { id: true },
  });

  // Carry the rows across.
  for (const { model } of DIRECT) {
    await delegate(model).updateMany({
      where: { batchId: { in: sources } },
      data: { batchId: targetId },
    });
  }
  for (const p of joinPlan) {
    if (p.moveIds.length) {
      await delegate(p.model).updateMany({
        where: { id: { in: p.moveIds } },
        data: { batchId: targetId },
      });
    }
    if (p.dupIds.length) {
      await delegate(p.model).deleteMany({ where: { id: { in: p.dupIds } } });
    }
  }

  await recount(ids);
  return merge.id;
}

export async function separateMerge(mergeId: string): Promise<void> {
  const merge = await prisma.batchMerge.findUnique({ where: { id: mergeId } });
  if (!merge) throw AppError.notFound("Merge not found.");
  if (merge.status !== "MERGED") {
    throw AppError.badRequest("This merge has already been separated.");
  }
  const target = merge.targetBatchId;
  const sources = (merge.sourceBatchIds as string[]) ?? [];
  const ledger = (merge.ledger as unknown as LedgerEntry[]) ?? [];

  const byE = new Map<string, LedgerEntry[]>();
  for (const l of ledger) byE.set(l.e, [...(byE.get(l.e) ?? []), l]);

  // Send the direct rows home, grouped by their original batch.
  for (const { e, model } of DIRECT) {
    const byFrom = new Map<string, string[]>();
    for (const it of byE.get(e) ?? []) {
      byFrom.set(it.from, [...(byFrom.get(it.from) ?? []), it.id]);
    }
    for (const [from, rowIds] of byFrom) {
      await delegate(model).updateMany({
        where: { id: { in: rowIds }, batchId: target },
        data: { batchId: from },
      });
    }
  }

  // Join rows: move the ones that came across back, and recreate the ones that
  // were dropped as duplicates on the batch they belonged to.
  for (const { e, model, key } of JOIN) {
    const items = byE.get(e) ?? [];
    const moved = items.filter((i) => !i.dup);
    const dups = items.filter((i) => i.dup);

    const byFrom = new Map<string, string[]>();
    for (const it of moved) {
      byFrom.set(it.from, [...(byFrom.get(it.from) ?? []), it.id]);
    }
    for (const [from, keys] of byFrom) {
      await delegate(model).updateMany({
        where: { [key]: { in: keys }, batchId: target },
        data: { batchId: from },
      });
    }
    if (dups.length) {
      await delegate(model).createMany({
        data: dups.map((it) => ({ [key]: it.id, batchId: it.from })),
        skipDuplicates: true,
      });
    }
  }

  await prisma.batchMerge.update({
    where: { id: mergeId },
    data: { status: "SEPARATED", separatedAt: new Date() },
  });
  await recount([target, ...sources]);
}

export interface MergeableBatch {
  id: string;
  name: string;
  code: string;
  courseId: string;
  courseTitle: string;
  enrolledCount: number;
}

/** Every batch, enough for the merge picker to group them by course. */
export async function listBatchesForMerge(): Promise<MergeableBatch[]> {
  const rows = await prisma.batch.findMany({
    orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      courseId: true,
      enrolledCount: true,
      course: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    courseId: r.courseId,
    courseTitle: r.course.title,
    enrolledCount: r.enrolledCount,
  }));
}

export interface BatchMergeInfo {
  id: string;
  targetBatchId: string;
  sourceBatchIds: string[];
  createdAt: string;
}

/** Live merges keyed by their target batch, for the batches page to badge and
 *  offer "separate" on. */
export async function activeMerges(): Promise<BatchMergeInfo[]> {
  const rows = await prisma.batchMerge.findMany({
    where: { status: "MERGED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, targetBatchId: true, sourceBatchIds: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    targetBatchId: r.targetBatchId,
    sourceBatchIds: (r.sourceBatchIds as string[]) ?? [],
    createdAt: r.createdAt.toISOString(),
  }));
}
