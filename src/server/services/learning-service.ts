import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { issueCertificate } from "@/server/services/certificate-service";
import type { ProgressInput, NoteInput, BookmarkInput } from "@/lib/validations/learning";

// ── Player data ──────────────────────────────────────────────────────────────

export async function getCoursePlayer(userId: string, slug: string) {
  const course = await prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      instructor: { select: { name: true, avatarUrl: true, headline: true } },
      chapters: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            include: {
              video: { select: { url: true, durationSeconds: true } },
              // The lesson's single replaceable document (PDF, Drive link, …),
              // so document lessons render something instead of "no video".
              attachments: {
                take: 1,
                orderBy: { createdAt: "desc" },
                select: { url: true, name: true },
              },
            },
          },
        },
      },
    },
  });
  if (!course) return null;

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
    select: { id: true },
  });
  if (!enrollment) return { enrolled: false as const };

  const lessonIds = course.chapters.flatMap((c) => c.lessons.map((l) => l.id));
  const progress = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: lessonIds } },
    select: { lessonId: true, completed: true, lastPositionSeconds: true },
  });
  const progMap = new Map(progress.map((p) => [p.lessonId, p]));

  const chapters = course.chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    lessons: ch.lessons.map((l) => {
      const p = progMap.get(l.id);
      return {
        id: l.id,
        title: l.title,
        type: l.type,
        durationSeconds: l.video?.durationSeconds || l.durationSeconds,
        isPreview: l.isPreview,
        content: l.content,
        videoUrl: l.video?.url ?? null,
        attachmentUrl: l.attachments[0]?.url ?? null,
        attachmentName: l.attachments[0]?.name ?? null,
        completed: p?.completed ?? false,
        lastPosition: p?.lastPositionSeconds ?? 0,
      };
    }),
  }));

  const flat = chapters.flatMap((c) => c.lessons);
  const total = flat.length;
  const completed = flat.filter((l) => l.completed).length;
  const resume = flat.find((l) => !l.completed) ?? flat[0];

  return {
    enrolled: true as const,
    id: course.id,
    title: course.title,
    slug: course.slug,
    instructor: course.instructor,
    chapters,
    totalLessons: total,
    completedLessons: completed,
    progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
    resumeLessonId: resume?.id ?? null,
  };
}

// ── Progress ─────────────────────────────────────────────────────────────────

async function recompute(userId: string, courseId: string, enrollmentId: string) {
  const [total, completed] = await Promise.all([
    prisma.lesson.count({ where: { chapter: { courseId } } }),
    prisma.lessonProgress.count({
      where: { userId, completed: true, lesson: { chapter: { courseId } } },
    }),
  ]);
  const isDone = total > 0 && completed >= total;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      progressPercent: pct,
      status: isDone ? "COMPLETED" : "ACTIVE",
      completedAt: isDone ? new Date() : null,
    },
  });
  let certificateIssued = false;
  if (isDone) {
    try {
      await issueCertificate({ userId, courseId, type: "COURSE_COMPLETION" });
      certificateIssued = true;
    } catch {
      /* already has one — fine */
    }
  }
  return { progressPercent: pct, completedLessons: completed, totalLessons: total, isDone, certificateIssued };
}

export async function updateLessonProgress(userId: string, lessonId: string, input: ProgressInput) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, chapter: { select: { courseId: true } } },
  });
  if (!lesson) throw AppError.notFound("Lesson not found.");
  const courseId = lesson.chapter.courseId;

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  if (!enrollment) throw AppError.forbidden("You're not enrolled in this course.");

  const markComplete = input.completed === true;
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: {
      userId,
      lessonId,
      enrollmentId: enrollment.id,
      watchedSeconds: input.watched ?? 0,
      lastPositionSeconds: input.position ?? 0,
      completed: markComplete,
      status: markComplete ? "COMPLETED" : "IN_PROGRESS",
      completedAt: markComplete ? new Date() : null,
    },
    update: {
      ...(input.position != null ? { lastPositionSeconds: input.position } : {}),
      ...(input.watched != null ? { watchedSeconds: input.watched } : {}),
      ...(input.completed !== undefined
        ? {
            completed: input.completed,
            status: input.completed ? "COMPLETED" : "IN_PROGRESS",
            completedAt: input.completed ? new Date() : null,
          }
        : { status: "IN_PROGRESS" }),
    },
  });

  // Only recompute course progress when completion state changed (cheap path
  // for frequent position saves).
  if (input.completed !== undefined) {
    return recompute(userId, courseId, enrollment.id);
  }
  return null;
}

// ── Notes and bookmarks ──────────────────────────────────────────────────────

/**
 * What a note or bookmark is attached to. A learner writes them against a
 * lesson while watching, or against a quiz while revising, and both land in the
 * same two tables — so everything below takes the target rather than a lesson
 * id, and `student/notes` can list the two side by side.
 */
export type SavedTarget = { kind: "lesson"; id: string } | { kind: "quiz"; id: string };

export function savedTarget(kind: string, id: string): SavedTarget {
  if (kind !== "lesson" && kind !== "quiz") throw AppError.badRequest("Unknown target.");
  return { kind, id };
}

/** The `where` fragment for one target, and the `data` fragment for a create. */
function targetWhere(target: SavedTarget) {
  return target.kind === "lesson" ? { lessonId: target.id } : { quizId: target.id };
}

/**
 * Refuse to write against something that isn't there. Worth the round trip:
 * `relationMode = "prisma"` means the database enforces no foreign key, so a
 * bad id would otherwise be stored happily and only surface as an orphan row
 * on the notes page.
 */
async function assertTargetExists(target: SavedTarget): Promise<void> {
  const found =
    target.kind === "lesson"
      ? await prisma.lesson.findUnique({ where: { id: target.id }, select: { id: true } })
      : await prisma.quiz.findUnique({ where: { id: target.id }, select: { id: true } });
  if (!found) {
    throw AppError.notFound(target.kind === "lesson" ? "Lesson not found." : "Quiz not found.");
  }
}

export async function listNotes(userId: string, target: SavedTarget) {
  const notes = await prisma.note.findMany({
    where: { userId, ...targetWhere(target) },
    orderBy: { timestampSeconds: "asc" },
  });
  return notes.map((n) => ({
    id: n.id,
    content: n.content,
    timestampSeconds: n.timestampSeconds,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function addNote(
  userId: string,
  target: SavedTarget,
  input: NoteInput,
): Promise<string> {
  await assertTargetExists(target);
  const n = await prisma.note.create({
    data: {
      userId,
      ...targetWhere(target),
      content: input.content,
      timestampSeconds: input.timestampSeconds,
    },
    select: { id: true },
  });
  return n.id;
}

export async function updateNote(
  userId: string,
  noteId: string,
  content: string,
): Promise<void> {
  const res = await prisma.note.updateMany({ where: { id: noteId, userId }, data: { content } });
  if (res.count === 0) throw AppError.notFound("Note not found.");
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const res = await prisma.note.deleteMany({ where: { id: noteId, userId } });
  if (res.count === 0) throw AppError.notFound("Note not found.");
}

export async function listBookmarks(userId: string, target: SavedTarget) {
  const bms = await prisma.bookmark.findMany({
    where: { userId, ...targetWhere(target) },
    orderBy: { timestampSeconds: "asc" },
  });
  return bms.map((b) => ({
    id: b.id,
    label: b.label,
    timestampSeconds: b.timestampSeconds,
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function addBookmark(
  userId: string,
  target: SavedTarget,
  input: BookmarkInput,
): Promise<string> {
  await assertTargetExists(target);
  const b = await prisma.bookmark.create({
    data: {
      userId,
      ...targetWhere(target),
      timestampSeconds: input.timestampSeconds,
      label: input.label || null,
    },
    select: { id: true },
  });
  return b.id;
}

export async function deleteBookmark(userId: string, bookmarkId: string): Promise<void> {
  const res = await prisma.bookmark.deleteMany({ where: { id: bookmarkId, userId } });
  if (res.count === 0) throw AppError.notFound("Bookmark not found.");
}

/**
 * Save or unsave a whole quiz in one call — the quiz list and the quiz page
 * both show a single toggle, and a quiz-level bookmark has no timestamp to
 * distinguish two of them, so a second tap should remove rather than duplicate.
 */
export async function toggleQuizBookmark(
  userId: string,
  quizId: string,
): Promise<{ saved: boolean }> {
  const existing = await prisma.bookmark.findFirst({
    where: { userId, quizId },
    select: { id: true },
  });
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return { saved: false };
  }
  await assertTargetExists({ kind: "quiz", id: quizId });
  await prisma.bookmark.create({ data: { userId, quizId } });
  return { saved: true };
}

// ── Everything a learner has saved ───────────────────────────────────────────

export interface SavedItem {
  id: string;
  kind: "note" | "bookmark";
  /** The note's text, or the bookmark's label — blank for an unlabelled one. */
  text: string;
  timestampSeconds: number;
  createdAt: string;
  source: {
    type: "lesson" | "quiz";
    /** Lesson or quiz title. */
    title: string;
    courseTitle: string | null;
    /** Where "Open" goes; null when the course is gone or unpublished. */
    href: string | null;
  };
}

/**
 * Every note and bookmark this learner holds, newest first, with enough context
 * to show where each came from and to jump back to it.
 *
 * Deliberately six flat queries rather than nested `include`s: `relationMode =
 * "prisma"` turns each level of nesting into its own round trip, and this
 * database is a region away — so the ids are collected and resolved in batches
 * and stitched together here.
 */
export async function getSavedItems(userId: string): Promise<SavedItem[]> {
  const [notes, bookmarks] = await Promise.all([
    prisma.note.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.bookmark.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  if (notes.length === 0 && bookmarks.length === 0) return [];

  const lessonIds = unique([...notes, ...bookmarks].map((r) => r.lessonId));
  const quizIds = unique([...notes, ...bookmarks].map((r) => r.quizId));

  const [lessons, quizzes] = await Promise.all([
    lessonIds.length
      ? prisma.lesson.findMany({
          where: { id: { in: lessonIds } },
          select: { id: true, title: true, chapterId: true },
        })
      : [],
    quizIds.length
      ? prisma.quiz.findMany({
          where: { id: { in: quizIds } },
          select: { id: true, title: true, courseId: true },
        })
      : [],
  ]);

  const chapterIds = unique(lessons.map((l) => l.chapterId));
  const chapters = chapterIds.length
    ? await prisma.chapter.findMany({
        where: { id: { in: chapterIds } },
        select: { id: true, courseId: true },
      })
    : [];

  const courseIds = unique([
    ...chapters.map((c) => c.courseId),
    ...quizzes.map((q) => q.courseId),
  ]);
  const courses = courseIds.length
    ? await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true, slug: true },
      })
    : [];

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const courseOfChapter = new Map(chapters.map((c) => [c.id, c.courseId]));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const quizById = new Map(quizzes.map((q) => [q.id, q]));

  function sourceFor(row: { lessonId: string | null; quizId: string | null }) {
    if (row.lessonId) {
      const lesson = lessonById.get(row.lessonId);
      if (!lesson) return null;
      const course = courseById.get(courseOfChapter.get(lesson.chapterId) ?? "");
      return {
        type: "lesson" as const,
        title: lesson.title,
        courseTitle: course?.title ?? null,
        href: course ? `/student/learn/${course.slug}?lesson=${lesson.id}` : null,
      };
    }
    if (row.quizId) {
      const quiz = quizById.get(row.quizId);
      if (!quiz) return null;
      return {
        type: "quiz" as const,
        title: quiz.title,
        courseTitle: (quiz.courseId ? courseById.get(quiz.courseId)?.title : null) ?? null,
        href: `/student/quizzes/${quiz.id}`,
      };
    }
    return null;
  }

  const items: SavedItem[] = [];
  for (const n of notes) {
    const source = sourceFor(n);
    // A lesson or quiz deleted since is dropped rather than shown as an
    // orphan — nothing enforces the reference at the database level.
    if (!source) continue;
    items.push({
      id: n.id,
      kind: "note",
      text: n.content,
      timestampSeconds: n.timestampSeconds,
      createdAt: n.createdAt.toISOString(),
      source,
    });
  }
  for (const b of bookmarks) {
    const source = sourceFor(b);
    if (!source) continue;
    items.push({
      id: b.id,
      kind: "bookmark",
      text: b.label ?? "",
      timestampSeconds: b.timestampSeconds,
      createdAt: b.createdAt.toISOString(),
      source,
    });
  }

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function unique(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}
