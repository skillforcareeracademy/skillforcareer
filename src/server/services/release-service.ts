import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { getSettings } from "./settings-service";

/**
 * Who can see which lesson, and when.
 *
 * The client's ask: "Students ko saare lessons ya assignment ya quiz ek saath
 * nhi denge hum. Humari marzi hai admin ya instructor chahe to batch ko ya
 * student ko sab kuch ek saath bhi access de skta hai aur aadhe module lock
 * krke bhi access de skta hai."
 *
 * So a lesson carries a release *rule* rather than a flag: open immediately
 * (what every course did before this existed, and still the default), open on a
 * date, open N days after this learner enrolled, or open only to the cohorts
 * and individuals staff have named. The same resolver also enforces the watch
 * cap from `Lesson.viewLimit`, so the player has one answer to "can they open
 * this?" instead of two that can disagree.
 */

export const RELEASE_MODES = ["IMMEDIATE", "SCHEDULED", "DRIP", "MANUAL"] as const;
export type ReleaseMode = (typeof RELEASE_MODES)[number];

export const RELEASE_MODE_LABEL: Record<ReleaseMode, string> = {
  IMMEDIATE: "Open to everyone enrolled",
  SCHEDULED: "Opens on a date",
  DRIP: "Opens days after enrolling",
  MANUAL: "Only the batches / learners I pick",
};

/** Why a lesson is shut, in words a learner can act on. */
export type LockReason =
  | "SCHEDULED"
  | "DRIP"
  | "MANUAL"
  | "VIEW_LIMIT";

export interface LessonLock {
  locked: boolean;
  reason: LockReason | null;
  /** When it opens, if that is a knowable moment. */
  unlocksAt: string | null;
  message: string | null;
  /** Watch allowance — null when unlimited. */
  viewLimit: number | null;
  viewsUsed: number;
  downloadLimit: number | null;
  downloadsUsed: number;
}

export const OPEN_LESSON: LessonLock = {
  locked: false,
  reason: null,
  unlocksAt: null,
  message: null,
  viewLimit: null,
  viewsUsed: 0,
  downloadLimit: null,
  downloadsUsed: 0,
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** A per-lesson cap, or the platform default, or nothing. 0 anywhere = unlimited. */
function effectiveLimit(perLesson: number | null, fallback: number): number | null {
  const value = perLesson ?? fallback;
  return value > 0 ? value : null;
}

export interface ReleaseInput {
  releaseMode: ReleaseMode;
  releaseAt: Date | null;
  dripDays: number | null;
  viewLimit: number | null;
  downloadLimit: number | null;
  isPreview: boolean;
}

export interface LearnerContext {
  userId: string;
  enrolledAt: Date;
  batchId: string | null;
  /** Lesson ids explicitly unlocked for this learner or their batch. */
  granted: Set<string>;
  progress: Map<string, { viewCount: number; downloadCount: number }>;
  defaults: { viewLimit: number; downloadLimit: number };
}

/**
 * Decide one lesson's state for one learner. Pure — the caller does the reads,
 * so a whole curriculum costs the same three queries as a single lesson.
 */
export function resolveLock(
  lessonId: string,
  lesson: ReleaseInput,
  ctx: LearnerContext,
): LessonLock {
  const used = ctx.progress.get(lessonId);
  const viewsUsed = used?.viewCount ?? 0;
  const downloadsUsed = used?.downloadCount ?? 0;
  const viewLimit = effectiveLimit(lesson.viewLimit, ctx.defaults.viewLimit);
  const downloadLimit = effectiveLimit(lesson.downloadLimit, ctx.defaults.downloadLimit);

  const base = { viewLimit, viewsUsed, downloadLimit, downloadsUsed };

  // A free preview is the academy's shop window — release rules are about
  // pacing enrolled learners, and locking the preview would hide it from the
  // public course page too.
  if (!lesson.isPreview) {
    if (lesson.releaseMode === "SCHEDULED") {
      const at = lesson.releaseAt;
      if (at && at.getTime() > Date.now()) {
        return {
          locked: true,
          reason: "SCHEDULED",
          unlocksAt: at.toISOString(),
          message: `Unlocks on ${formatDate(at)}`,
          ...base,
        };
      }
    }

    if (lesson.releaseMode === "DRIP") {
      const days = lesson.dripDays ?? 0;
      const at = new Date(ctx.enrolledAt.getTime() + days * 86_400_000);
      if (at.getTime() > Date.now()) {
        return {
          locked: true,
          reason: "DRIP",
          unlocksAt: at.toISOString(),
          message: `Unlocks on ${formatDate(at)}, day ${days} of your program`,
          ...base,
        };
      }
    }

    if (lesson.releaseMode === "MANUAL" && !ctx.granted.has(lessonId)) {
      return {
        locked: true,
        reason: "MANUAL",
        unlocksAt: null,
        message: "Your instructor hasn't unlocked this yet",
        ...base,
      };
    }
  }

  // Watch cap. Checked last so a learner who has run out is told *that*, not
  // that the lesson is scheduled — the lesson is open, their allowance isn't.
  if (viewLimit != null && viewsUsed >= viewLimit) {
    return {
      locked: true,
      reason: "VIEW_LIMIT",
      unlocksAt: null,
      message: `You've used all ${viewLimit} views of this lesson`,
      ...base,
    };
  }

  return { locked: false, reason: null, unlocksAt: null, message: null, ...base };
}

/**
 * Everything `resolveLock` needs for one learner on one course, in three
 * queries. `relationMode = "prisma"` makes nested includes a round-trip per
 * level, so these stay flat and are stitched in JS.
 */
export async function learnerContext(
  userId: string,
  lessonIds: string[],
): Promise<LearnerContext | null> {
  if (lessonIds.length === 0) return null;

  const [enrollments, grants, progress, settingsWithMeta] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId },
      select: { enrolledAt: true, batchId: true },
      orderBy: { enrolledAt: "asc" },
    }),
    prisma.lessonAccess.findMany({
      where: { lessonId: { in: lessonIds } },
      select: { lessonId: true, batchId: true, userId: true },
    }),
    prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: lessonIds } },
      select: { lessonId: true, viewCount: true, downloadCount: true },
    }),
    getSettings(),
  ]);
  const { settings } = settingsWithMeta;

  const enrolledAt = enrollments[0]?.enrolledAt ?? new Date();
  const batchIds = new Set(
    enrollments.map((e) => e.batchId).filter((b): b is string => Boolean(b)),
  );

  const granted = new Set<string>();
  for (const g of grants) {
    if (g.userId === userId) granted.add(g.lessonId);
    else if (g.batchId && batchIds.has(g.batchId)) granted.add(g.lessonId);
  }

  return {
    userId,
    enrolledAt,
    batchId: enrollments.find((e) => e.batchId)?.batchId ?? null,
    granted,
    progress: new Map(
      progress.map((p) => [p.lessonId, { viewCount: p.viewCount, downloadCount: p.downloadCount }]),
    ),
    defaults: {
      viewLimit: settings.lessonViewLimit,
      downloadLimit: settings.lessonDownloadLimit,
    },
  };
}

/**
 * The one check every learner-facing lesson route makes before handing
 * anything over. Throws rather than returning a flag, because there is no
 * caller that would sensibly carry on.
 */
export async function assertLessonOpen(
  userId: string,
  lessonId: string,
  opts: { ignoreViewLimit?: boolean } = {},
): Promise<void> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      releaseMode: true,
      releaseAt: true,
      dripDays: true,
      viewLimit: true,
      downloadLimit: true,
      isPreview: true,
    },
  });
  if (!lesson) throw AppError.notFound("Lesson not found.");

  const ctx = await learnerContext(userId, [lessonId]);
  if (!ctx) return;

  const lock = resolveLock(
    lessonId,
    { ...lesson, releaseMode: lesson.releaseMode as ReleaseMode },
    ctx,
  );
  // The watch cap is spent by *opening* a lesson, not by finishing one. A
  // learner on their last allowed view must still be able to save their
  // position and mark it complete, so those callers pass `ignoreViewLimit`.
  if (lock.locked && !(opts.ignoreViewLimit && lock.reason === "VIEW_LIMIT")) {
    // AppError.forbidden takes only a message; the reason travels in the text
    // the learner reads, which is the only part the player shows anyway.
    throw AppError.forbidden(lock.message ?? "This lesson isn't available yet.");
  }
}

/**
 * Spend one view of a lesson. Returns the lock as it stands *after* the view,
 * so the player can warn on the last one ("1 view left").
 */
export async function consumeLessonView(
  userId: string,
  lessonId: string,
): Promise<LessonLock> {
  await assertLessonOpen(userId, lessonId);

  const enrollment = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { chapter: { select: { courseId: true } } },
  });
  if (!enrollment) throw AppError.notFound("Lesson not found.");
  const courseId = enrollment.chapter.courseId;
  const row = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  if (!row) throw AppError.forbidden("You're not enrolled in this course.");

  /**
   * `INSERT … ON DUPLICATE KEY UPDATE` rather than `prisma.upsert`.
   *
   * Prisma's upsert is a SELECT followed by an INSERT or UPDATE, not one atomic
   * statement. The player opens a lesson and saves its progress within the same
   * second, so two writers race for the same `(userId, lessonId)` row, both
   * find nothing, and the second INSERT dies on
   * `LessonProgress_userId_lessonId_key`. MySQL/TiDB resolve that in the engine.
   */
  const id = randomUUID();
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO \`LessonProgress\`
      (id, userId, lessonId, enrollmentId, status, viewCount, updatedAt, createdAt)
    VALUES (${id}, ${userId}, ${lessonId}, ${row.id}, ${"IN_PROGRESS"}, 1, ${now}, ${now})
    ON DUPLICATE KEY UPDATE
      viewCount = viewCount + 1,
      status = ${"IN_PROGRESS"},
      updatedAt = ${now}
  `;

  return getLessonLock(userId, lessonId);
}

/** Spend one download of a lesson's material, under the same rules. */
export async function consumeLessonDownload(
  userId: string,
  lessonId: string,
): Promise<LessonLock> {
  await assertLessonOpen(userId, lessonId, { ignoreViewLimit: true });

  const current = await getLessonLock(userId, lessonId);
  if (current.downloadLimit != null && current.downloadsUsed >= current.downloadLimit) {
    throw AppError.forbidden(
      `You've used all ${current.downloadLimit} downloads of this material.`,
    );
  }

  await prisma.lessonProgress.updateMany({
    where: { userId, lessonId },
    data: { downloadCount: { increment: 1 } },
  });
  return getLessonLock(userId, lessonId);
}

/** One lesson's current state for one learner. */
export async function getLessonLock(userId: string, lessonId: string): Promise<LessonLock> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      releaseMode: true,
      releaseAt: true,
      dripDays: true,
      viewLimit: true,
      downloadLimit: true,
      isPreview: true,
    },
  });
  if (!lesson) throw AppError.notFound("Lesson not found.");
  const ctx = await learnerContext(userId, [lessonId]);
  if (!ctx) return OPEN_LESSON;
  return resolveLock(
    lessonId,
    { ...lesson, releaseMode: lesson.releaseMode as ReleaseMode },
    ctx,
  );
}

// ── Admin side ───────────────────────────────────────────────────────────────

export interface ReleaseLessonRow {
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  order: number;
  type: string;
  isPreview: boolean;
  releaseMode: ReleaseMode;
  releaseAt: string | null;
  dripDays: number | null;
  viewLimit: number | null;
  downloadLimit: number | null;
  batchIds: string[];
  studentIds: string[];
}

export interface ReleaseBoard {
  courseId: string;
  courseTitle: string;
  lessons: ReleaseLessonRow[];
  batches: { id: string; name: string; code: string; learners: number }[];
  students: { id: string; name: string; email: string }[];
}

/** Everything the "Content access" screen draws, for one course. */
export async function getReleaseBoard(courseId: string): Promise<ReleaseBoard> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true },
  });
  if (!course) throw AppError.notFound("Course not found.");

  const chapters = await prisma.chapter.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    select: { id: true, title: true, order: true },
  });
  const chapterIds = chapters.map((c) => c.id);

  const [lessons, batches, enrollments] = await Promise.all([
    chapterIds.length
      ? prisma.lesson.findMany({
          where: { chapterId: { in: chapterIds } },
          orderBy: [{ order: "asc" }],
          select: {
            id: true,
            title: true,
            chapterId: true,
            order: true,
            type: true,
            isPreview: true,
            releaseMode: true,
            releaseAt: true,
            dripDays: true,
            viewLimit: true,
            downloadLimit: true,
          },
        })
      : Promise.resolve([]),
    prisma.batch.findMany({
      where: { courseId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, code: true, enrolledCount: true },
    }),
    prisma.enrollment.findMany({
      where: { courseId, status: { in: ["ACTIVE", "COMPLETED"] } },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const grants = lessons.length
    ? await prisma.lessonAccess.findMany({
        where: { lessonId: { in: lessons.map((l) => l.id) } },
        select: { lessonId: true, batchId: true, userId: true },
      })
    : [];

  const byLesson = new Map<string, { batchIds: string[]; studentIds: string[] }>();
  for (const g of grants) {
    const entry = byLesson.get(g.lessonId) ?? { batchIds: [], studentIds: [] };
    if (g.batchId) entry.batchIds.push(g.batchId);
    if (g.userId) entry.studentIds.push(g.userId);
    byLesson.set(g.lessonId, entry);
  }

  const chapterTitle = new Map(chapters.map((c) => [c.id, c.title]));
  const chapterOrder = new Map(chapters.map((c, i) => [c.id, i]));

  const rows: ReleaseLessonRow[] = lessons
    .map((l) => {
      const grant = byLesson.get(l.id);
      return {
        id: l.id,
        title: l.title,
        chapterId: l.chapterId,
        chapterTitle: chapterTitle.get(l.chapterId) ?? "",
        order: l.order,
        type: l.type,
        isPreview: l.isPreview,
        releaseMode: l.releaseMode as ReleaseMode,
        releaseAt: l.releaseAt?.toISOString() ?? null,
        dripDays: l.dripDays,
        viewLimit: l.viewLimit,
        downloadLimit: l.downloadLimit,
        batchIds: grant?.batchIds ?? [],
        studentIds: grant?.studentIds ?? [],
      };
    })
    // Prisma can't order across the chapter join here without a second
    // round-trip, so the curriculum order is restored in memory.
    .sort(
      (a, b) =>
        (chapterOrder.get(a.chapterId) ?? 0) - (chapterOrder.get(b.chapterId) ?? 0) ||
        a.order - b.order,
    );

  const seen = new Set<string>();
  const students = enrollments
    .map((e) => e.user)
    .filter((u) => {
      if (!u || seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    courseId: course.id,
    courseTitle: course.title,
    lessons: rows,
    batches: batches.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      learners: b.enrolledCount,
    })),
    students,
  };
}

export interface SetReleaseInput {
  lessonIds: string[];
  releaseMode?: ReleaseMode;
  releaseAt?: string | null;
  dripDays?: number | null;
  viewLimit?: number | null;
  downloadLimit?: number | null;
  /** Only meaningful with MANUAL. Replaces the whole grant list. */
  batchIds?: string[];
  studentIds?: string[];
}

/**
 * Apply a release rule to one lesson or a whole selection — "unlock the first
 * module for batch B, leave the rest shut" is two calls, not two hundred.
 */
export async function setRelease(courseId: string, input: SetReleaseInput): Promise<number> {
  const lessons = await prisma.lesson.findMany({
    where: { id: { in: input.lessonIds }, chapter: { courseId } },
    select: { id: true },
  });
  const ids = lessons.map((l) => l.id);
  if (ids.length === 0) throw AppError.badRequest("Pick at least one lesson.");

  /**
   * Raw, and not by preference.
   *
   * `prisma.lesson.updateMany({ where: { id: { in: ids } } })` throws
   * "Expected zero or one element, got 3" the moment it matches more than one
   * row: `Lesson` owns three one-to-one relations (video, quiz, assignment) and
   * under `relationMode = "prisma"` the referential-integrity emulation runs a
   * read that expects a single row. One id at a time works, but "apply this to
   * half a module" is the whole feature, and N round-trips to a database a
   * region away is not a fix. One statement it is — the same reasoning as
   * `auth-service.touchLogin` and `repositories/counters`.
   *
   * Column names come from this fixed list and never from the caller; every
   * value is bound as a parameter.
   */
  const sets: Prisma.Sql[] = [];
  if (input.releaseMode) sets.push(Prisma.sql`releaseMode = ${input.releaseMode}`);
  if (input.releaseAt !== undefined) {
    sets.push(Prisma.sql`releaseAt = ${input.releaseAt ? new Date(input.releaseAt) : null}`);
  }
  if (input.dripDays !== undefined) sets.push(Prisma.sql`dripDays = ${input.dripDays}`);
  if (input.viewLimit !== undefined) sets.push(Prisma.sql`viewLimit = ${input.viewLimit}`);
  if (input.downloadLimit !== undefined) {
    sets.push(Prisma.sql`downloadLimit = ${input.downloadLimit}`);
  }

  if (sets.length > 0) {
    sets.push(Prisma.sql`updatedAt = ${new Date()}`);
    await prisma.$executeRaw`
      UPDATE \`Lesson\`
      SET ${Prisma.join(sets, ", ")}
      WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`))})
    `;
  }

  // The grant list is replaced wholesale rather than diffed: it is a set, the
  // editor always sends the whole thing, and two statements beat N upserts
  // against a database a region away.
  if (input.batchIds !== undefined || input.studentIds !== undefined) {
    const batchIds = [...new Set(input.batchIds ?? [])];
    const studentIds = [...new Set(input.studentIds ?? [])];
    await prisma.lessonAccess.deleteMany({ where: { lessonId: { in: ids } } });
    const rows = ids.flatMap((lessonId) => [
      ...batchIds.map((batchId) => ({ lessonId, batchId })),
      ...studentIds.map((userId) => ({ lessonId, userId })),
    ]);
    if (rows.length > 0) await prisma.lessonAccess.createMany({ data: rows });
  }

  return ids.length;
}
