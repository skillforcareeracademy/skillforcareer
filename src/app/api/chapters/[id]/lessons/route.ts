import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireCourseWrite } from "@/lib/auth/api-guard";
import { lessonSchema, reorderSchema } from "@/lib/validations/curriculum";
import {
  createLesson,
  reorderLessons,
  courseIdForChapter,
} from "@/server/services/curriculum-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const chapterId = String((await params).id);
  const courseId = await courseIdForChapter(chapterId);
  if (!courseId) throw AppError.notFound("Chapter not found.");
  await requireCourseWrite(courseId);
  const input = lessonSchema.parse(await req.json().catch(() => ({})));
  const id = await createLesson(chapterId, input);
  return created({ id, message: "Lesson added." });
});

/** Reorder lessons within the chapter. Body: { ids: string[] } */
export const PATCH = withRoute(async (req, { params }) => {
  const chapterId = String((await params).id);
  const courseId = await courseIdForChapter(chapterId);
  if (!courseId) throw AppError.notFound("Chapter not found.");
  await requireCourseWrite(courseId);
  const { ids } = reorderSchema.parse(await req.json().catch(() => ({})));
  await reorderLessons(ids);
  return ok({ message: "Reordered." });
});
