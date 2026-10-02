import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import { groupsOf, setGroupsFor } from "./content-group-service";

/**
 * The recycle bin — "Need a recycle bin for admin, student and instructor."
 *
 * Deleting takes a copy of the record and everything hanging off it, writes
 * that copy to `TrashItem`, and only then removes the row. Restoring writes the
 * copy back **under its original id**, so a certificate, a submission or a
 * notification that pointed at the thing still points at it.
 *
 * Why a snapshot and not a `deletedAt` flag: a flag means every query in the
 * application has to remember to exclude the deleted, and the one that forgets
 * shows a learner something that was thrown away. A snapshot leaves the reading
 * side of the application completely untouched.
 *
 * Only things that can honestly be put back whole are in here. A course or a
 * batch drags enrolments, progress, payments and certificates behind it; a bin
 * that offered to restore one would be promising more than it can do.
 */

export type TrashKind =
  | "QUIZ"
  | "ASSIGNMENT"
  | "STUDY_MATERIAL"
  | "BATCH_NOTE"
  | "NOTE"
  | "BLOG_POST";

export const TRASH_KIND_LABEL: Record<TrashKind, string> = {
  QUIZ: "Quiz",
  ASSIGNMENT: "Assignment",
  STUDY_MATERIAL: "Study material",
  BATCH_NOTE: "Batch note",
  NOTE: "Note",
  BLOG_POST: "Blog post",
};

/** Items a learner can throw away and get back themselves. */
const LEARNER_KINDS: TrashKind[] = ["NOTE"];

interface Captured {
  title: string;
  subtitle: string | null;
  snapshot: Record<string, unknown>;
}

// ── Taking the copy ──────────────────────────────────────────────────────────

const capture: Record<TrashKind, (id: string) => Promise<Captured | null>> = {
  async QUIZ(id) {
    const q = await prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: { include: { options: true } },
        batches: true,
        students: true,
        sources: true,
      },
    });
    if (!q) return null;
    return {
      title: q.title,
      subtitle: q.description?.slice(0, 120) ?? null,
      snapshot: { quiz: q, groupIds: await groupsOf("QUIZ", id) },
    };
  },

  async ASSIGNMENT(id) {
    const a = await prisma.assignment.findUnique({
      where: { id },
      include: {
        questions: { include: { options: true } },
        batches: true,
        students: true,
        course: { select: { title: true } },
      },
    });
    if (!a) return null;
    const { course, ...row } = a;
    return {
      title: a.title,
      subtitle: course?.title ?? null,
      snapshot: { assignment: row, groupIds: await groupsOf("ASSIGNMENT", id) },
    };
  },

  async STUDY_MATERIAL(id) {
    const m = await prisma.studyMaterial.findUnique({
      where: { id },
      include: {
        assets: true,
        batches: true,
        courses: true,
        students: true,
        course: { select: { title: true } },
      },
    });
    if (!m) return null;
    const { course, ...row } = m;
    return {
      title: m.title,
      subtitle: course?.title ?? null,
      snapshot: { material: row, groupIds: await groupsOf("MATERIAL", id) },
    };
  },

  async BATCH_NOTE(id) {
    const n = await prisma.batchNote.findUnique({
      where: { id },
      include: { batch: { select: { name: true } } },
    });
    if (!n) return null;
    const { batch, ...row } = n;
    return { title: n.title, subtitle: batch?.name ?? null, snapshot: { note: row } };
  },

  async NOTE(id) {
    const n = await prisma.note.findUnique({
      where: { id },
      include: { lesson: { select: { title: true } }, quiz: { select: { title: true } } },
    });
    if (!n) return null;
    const { lesson, quiz, ...row } = n;
    return {
      // A note has no title of its own — its first line is what it is called.
      title: n.content.trim().split("\n")[0].slice(0, 90) || "Note",
      subtitle: lesson?.title ?? quiz?.title ?? null,
      snapshot: { note: row },
    };
  },

  async BLOG_POST(id) {
    const p = await prisma.blogPost.findUnique({ where: { id } });
    if (!p) return null;
    return { title: p.title, subtitle: p.excerpt?.slice(0, 120) ?? null, snapshot: { post: p } };
  },
};

/**
 * Copy a record into the bin before it is deleted. Never throws: a bin that
 * breaks a delete is worse than one that misses an entry, so a failure is
 * logged and the delete goes ahead.
 */
export async function moveToTrash(
  kind: TrashKind,
  id: string,
  deletedById: string,
): Promise<void> {
  try {
    const taken = await capture[kind](id);
    if (!taken) return;
    await prisma.trashItem.create({
      data: {
        kind,
        originalId: id,
        title: taken.title.slice(0, 190) || TRASH_KIND_LABEL[kind],
        subtitle: taken.subtitle?.slice(0, 190) ?? null,
        snapshot: taken.snapshot as object,
        deletedById,
      },
    });
  } catch (error) {
    logger.error("trash.capture_failed", { kind, id, error: String(error) });
  }
}

// ── Putting it back ──────────────────────────────────────────────────────────

/** Children are written separately, so they are stripped off the parent row. */
function strip<T extends Record<string, unknown>>(row: T, children: string[]) {
  const out = { ...row };
  for (const key of children) delete out[key];
  return out;
}

/** JSON gives dates back as strings; Prisma wants Dates. */
function reviveDates<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)
    ) {
      out[key] = new Date(value);
    }
  }
  return out as T;
}

const prepare = <T extends Record<string, unknown>>(row: T, children: string[] = []) =>
  reviveDates(strip(row, children));

type Snapshot = Record<string, never> & Record<string, unknown>;

const restoreOne: Record<TrashKind, (snap: Snapshot) => Promise<void>> = {
  async QUIZ(snap) {
    const q = snap.quiz as Record<string, unknown>;
    const questions = (q.questions ?? []) as Record<string, unknown>[];
    await prisma.quiz.create({
      data: prepare(q, ["questions", "batches", "students", "sources"]) as never,
    });
    for (const question of questions) {
      const options = (question.options ?? []) as Record<string, unknown>[];
      await prisma.question.create({ data: prepare(question, ["options"]) as never });
      if (options.length > 0) {
        await prisma.questionOption.createMany({
          data: options.map((o) => prepare(o)) as never,
        });
      }
    }
    await restoreRows((rows) => prisma.quizBatch.createMany({ data: rows }), snap.quiz, "batches");
    await restoreRows((rows) => prisma.quizStudent.createMany({ data: rows }), snap.quiz, "students");
    await restoreRows((rows) => prisma.quizSource.createMany({ data: rows }), snap.quiz, "sources");
    await setGroupsFor("QUIZ", String(q.id), (snap.groupIds ?? []) as string[]);
  },

  async ASSIGNMENT(snap) {
    const a = snap.assignment as Record<string, unknown>;
    const questions = (a.questions ?? []) as Record<string, unknown>[];
    await prisma.assignment.create({
      data: prepare(a, ["questions", "batches", "students"]) as never,
    });
    for (const question of questions) {
      const options = (question.options ?? []) as Record<string, unknown>[];
      await prisma.assignmentQuestion.create({ data: prepare(question, ["options"]) as never });
      if (options.length > 0) {
        await prisma.assignmentQuestionOption.createMany({
          data: options.map((o) => prepare(o)) as never,
        });
      }
    }
    await restoreRows((rows) => prisma.assignmentBatch.createMany({ data: rows }), snap.assignment, "batches");
    await restoreRows((rows) => prisma.assignmentStudent.createMany({ data: rows }), snap.assignment, "students");
    await setGroupsFor("ASSIGNMENT", String(a.id), (snap.groupIds ?? []) as string[]);
  },

  async STUDY_MATERIAL(snap) {
    const m = snap.material as Record<string, unknown>;
    await prisma.studyMaterial.create({
      data: prepare(m, ["assets", "batches", "courses", "students"]) as never,
    });
    await restoreRows((rows) => prisma.materialAsset.createMany({ data: rows }), snap.material, "assets");
    await restoreRows((rows) => prisma.studyMaterialBatch.createMany({ data: rows }), snap.material, "batches");
    await restoreRows((rows) => prisma.studyMaterialCourse.createMany({ data: rows }), snap.material, "courses");
    await restoreRows((rows) => prisma.studyMaterialStudent.createMany({ data: rows }), snap.material, "students");
    await setGroupsFor("MATERIAL", String(m.id), (snap.groupIds ?? []) as string[]);
  },

  async BATCH_NOTE(snap) {
    await prisma.batchNote.create({
      data: prepare(snap.note as Record<string, unknown>) as never,
    });
  },

  async NOTE(snap) {
    await prisma.note.create({
      data: prepare(snap.note as Record<string, unknown>) as never,
    });
  },

  async BLOG_POST(snap) {
    await prisma.blogPost.create({
      data: prepare(snap.post as Record<string, unknown>) as never,
    });
  },
};

/**
 * Write back a list of child rows held under `key` on the parent snapshot.
 * The caller passes the writer rather than the delegate: Prisma's `createMany`
 * is generic per model, so there is no one type every delegate satisfies.
 */
async function restoreRows(
  write: (rows: never[]) => Promise<unknown>,
  parent: unknown,
  key: string,
): Promise<void> {
  const rows = ((parent as Record<string, unknown>)?.[key] ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return;
  await write(rows.map((r) => prepare(r)) as never[]);
}

// ── The bin itself ───────────────────────────────────────────────────────────

export interface TrashRow {
  id: string;
  kind: TrashKind;
  kindLabel: string;
  title: string;
  subtitle: string | null;
  deletedBy: string;
  deletedAt: string;
  /** False once something else has taken the original id back. */
  canRestore: boolean;
}

export interface Viewer {
  id: string;
  roles: string[];
}

const isStaff = (v: Viewer) =>
  v.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);

/**
 * What this person may see. Staff see the whole bin; everyone else sees only
 * what they threw away themselves, so one instructor cannot restore another's
 * paper and a learner sees nothing but their own notes.
 */
function scopeFor(viewer: Viewer) {
  if (isStaff(viewer)) return {};
  const learnerOnly = viewer.roles.every((r) => r === ROLES.STUDENT);
  return {
    deletedById: viewer.id,
    ...(learnerOnly ? { kind: { in: LEARNER_KINDS } } : {}),
  };
}

export async function listTrash(
  viewer: Viewer,
  page = 1,
  pageSize = 25,
): Promise<{ rows: TrashRow[]; total: number }> {
  const where = scopeFor(viewer);
  const [rows, total] = await Promise.all([
    prisma.trashItem.findMany({
      where,
      orderBy: { deletedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        kind: true,
        originalId: true,
        title: true,
        subtitle: true,
        deletedAt: true,
        deletedBy: { select: { name: true } },
      },
    }),
    prisma.trashItem.count({ where }),
  ]);

  // Something may have been created under the old id since — rare, but the
  // button should say so rather than failing when it is pressed.
  const taken = await occupiedIds(rows.map((r) => ({ kind: r.kind as TrashKind, id: r.originalId })));

  return {
    rows: rows.map((r) => ({
      id: r.id,
      kind: r.kind as TrashKind,
      kindLabel: TRASH_KIND_LABEL[r.kind as TrashKind],
      title: r.title,
      subtitle: r.subtitle,
      deletedBy: r.deletedBy.name,
      deletedAt: r.deletedAt.toISOString(),
      canRestore: !taken.has(`${r.kind}:${r.originalId}`),
    })),
    total,
  };
}

/** Which original ids are in use again, as `KIND:id`. */
async function occupiedIds(items: { kind: TrashKind; id: string }[]): Promise<Set<string>> {
  const out = new Set<string>();
  const byKind = new Map<TrashKind, string[]>();
  for (const item of items) {
    byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item.id]);
  }
  await Promise.all(
    [...byKind.entries()].map(async ([kind, ids]) => {
      const found = await existingIds(kind, ids);
      found.forEach((id) => out.add(`${kind}:${id}`));
    }),
  );
  return out;
}

async function existingIds(kind: TrashKind, ids: string[]): Promise<string[]> {
  const where = { id: { in: ids } };
  const pick = { id: true } as const;
  switch (kind) {
    case "QUIZ":
      return (await prisma.quiz.findMany({ where, select: pick })).map((r) => r.id);
    case "ASSIGNMENT":
      return (await prisma.assignment.findMany({ where, select: pick })).map((r) => r.id);
    case "STUDY_MATERIAL":
      return (await prisma.studyMaterial.findMany({ where, select: pick })).map((r) => r.id);
    case "BATCH_NOTE":
      return (await prisma.batchNote.findMany({ where, select: pick })).map((r) => r.id);
    case "NOTE":
      return (await prisma.note.findMany({ where, select: pick })).map((r) => r.id);
    case "BLOG_POST":
      return (await prisma.blogPost.findMany({ where, select: pick })).map((r) => r.id);
  }
}

/** Only what this person is allowed to act on. */
async function ownRow(viewer: Viewer, trashId: string) {
  const row = await prisma.trashItem.findFirst({
    where: { id: trashId, ...scopeFor(viewer) },
  });
  if (!row) throw AppError.notFound("That item isn't in your recycle bin.");
  return row;
}

export async function restoreFromTrash(viewer: Viewer, trashId: string): Promise<string> {
  const row = await ownRow(viewer, trashId);
  const kind = row.kind as TrashKind;

  const already = await existingIds(kind, [row.originalId]);
  if (already.length > 0) {
    throw AppError.badRequest(
      `Something else is using that ${TRASH_KIND_LABEL[kind].toLowerCase()}'s place now, so it can't be put back.`,
    );
  }

  await restoreOne[kind](row.snapshot as Snapshot);
  await prisma.trashItem.delete({ where: { id: row.id } });
  logger.info("trash.restored", { kind, originalId: row.originalId, by: viewer.id });
  return `${TRASH_KIND_LABEL[kind]} restored.`;
}

/** Throw it away for good. */
export async function purgeFromTrash(viewer: Viewer, trashId: string): Promise<void> {
  const row = await ownRow(viewer, trashId);
  await prisma.trashItem.delete({ where: { id: row.id } });
}

/** Empty everything this person can see. Returns how many went. */
export async function emptyTrash(viewer: Viewer): Promise<number> {
  const { count } = await prisma.trashItem.deleteMany({ where: scopeFor(viewer) });
  return count;
}
