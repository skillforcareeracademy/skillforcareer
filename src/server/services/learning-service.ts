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
            include: { video: { select: { url: true, durationSeconds: true } } },
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
      await issueCertificate(userId, courseId);
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

// ── Notes ────────────────────────────────────────────────────────────────────

export async function listNotes(userId: string, lessonId: string) {
  const notes = await prisma.note.findMany({
    where: { userId, lessonId },
    orderBy: { timestampSeconds: "asc" },
  });
  return notes.map((n) => ({
    id: n.id,
    content: n.content,
    timestampSeconds: n.timestampSeconds,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function addNote(userId: string, lessonId: string, input: NoteInput): Promise<string> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
  if (!lesson) throw AppError.notFound("Lesson not found.");
  const n = await prisma.note.create({
    data: { userId, lessonId, content: input.content, timestampSeconds: input.timestampSeconds },
    select: { id: true },
  });
  return n.id;
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const res = await prisma.note.deleteMany({ where: { id: noteId, userId } });
  if (res.count === 0) throw AppError.notFound("Note not found.");
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export async function listBookmarks(userId: string, lessonId: string) {
  const bms = await prisma.bookmark.findMany({
    where: { userId, lessonId },
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
  lessonId: string,
  input: BookmarkInput,
): Promise<string> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
  if (!lesson) throw AppError.notFound("Lesson not found.");
  const b = await prisma.bookmark.create({
    data: { userId, lessonId, timestampSeconds: input.timestampSeconds, label: input.label || null },
    select: { id: true },
  });
  return b.id;
}

export async function deleteBookmark(userId: string, bookmarkId: string): Promise<void> {
  const res = await prisma.bookmark.deleteMany({ where: { id: bookmarkId, userId } });
  if (res.count === 0) throw AppError.notFound("Bookmark not found.");
}
