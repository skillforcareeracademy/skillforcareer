import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { ChapterInput, LessonInput } from "@/lib/validations/curriculum";

// ── Chapters ─────────────────────────────────────────────────────────────────

export async function createChapter(
  courseId: string,
  input: ChapterInput,
): Promise<string> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true },
  });
  if (!course) throw AppError.notFound("Course not found.");

  const max = await prisma.chapter.aggregate({
    where: { courseId },
    _max: { order: true },
  });
  const chapter = await prisma.chapter.create({
    data: {
      courseId,
      title: input.title,
      description: input.description || null,
      order: (max._max.order ?? -1) + 1,
    },
    select: { id: true },
  });
  return chapter.id;
}

export async function updateChapter(id: string, input: ChapterInput): Promise<void> {
  await prisma.chapter.update({
    where: { id },
    data: { title: input.title, description: input.description || null },
  });
}

export async function deleteChapter(id: string): Promise<void> {
  await prisma.chapter.delete({ where: { id } });
}

export async function reorderChapters(ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.chapter.update({ where: { id }, data: { order: i } }),
    ),
  );
}

// ── Lessons ──────────────────────────────────────────────────────────────────

async function applyLessonMedia(
  lessonId: string,
  title: string,
  input: LessonInput,
): Promise<void> {
  if (input.videoUrl) {
    await prisma.video.upsert({
      where: { lessonId },
      create: { lessonId, url: input.videoUrl, durationSeconds: input.durationSeconds ?? 0 },
      update: { url: input.videoUrl, durationSeconds: input.durationSeconds ?? 0 },
    });
  } else {
    await prisma.video.deleteMany({ where: { lessonId } });
  }

  // Single replaceable attachment (e.g. PDF).
  await prisma.attachment.deleteMany({ where: { lessonId } });
  if (input.attachmentUrl) {
    await prisma.attachment.create({
      data: { lessonId, name: title, url: input.attachmentUrl, type: "PDF" },
    });
  }
}

export async function createLesson(
  chapterId: string,
  input: LessonInput,
): Promise<string> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true },
  });
  if (!chapter) throw AppError.notFound("Chapter not found.");

  const max = await prisma.lesson.aggregate({
    where: { chapterId },
    _max: { order: true },
  });
  const lesson = await prisma.lesson.create({
    data: {
      chapterId,
      title: input.title,
      type: input.type,
      order: (max._max.order ?? -1) + 1,
      isPreview: input.isPreview,
      durationSeconds: input.durationSeconds ?? 0,
      content: input.type === "ARTICLE" ? input.content || null : null,
    },
    select: { id: true },
  });
  await applyLessonMedia(lesson.id, input.title, input);
  return lesson.id;
}

export async function updateLesson(id: string, input: LessonInput): Promise<void> {
  await prisma.lesson.update({
    where: { id },
    data: {
      title: input.title,
      type: input.type,
      isPreview: input.isPreview,
      durationSeconds: input.durationSeconds ?? 0,
      content: input.type === "ARTICLE" ? input.content || null : null,
    },
  });
  await applyLessonMedia(id, input.title, input);
}

export async function deleteLesson(id: string): Promise<void> {
  await prisma.lesson.delete({ where: { id } });
}

export async function reorderLessons(ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.lesson.update({ where: { id }, data: { order: i } }),
    ),
  );
}

// ── Ownership resolution (for course-write guards) ───────────────────────────

/** The course a chapter belongs to, or null if the chapter doesn't exist. */
export async function courseIdForChapter(chapterId: string): Promise<string | null> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { courseId: true },
  });
  return chapter?.courseId ?? null;
}

/** The course a lesson belongs to (via its chapter), or null if it doesn't exist. */
export async function courseIdForLesson(lessonId: string): Promise<string | null> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { chapter: { select: { courseId: true } } },
  });
  return lesson?.chapter.courseId ?? null;
}
