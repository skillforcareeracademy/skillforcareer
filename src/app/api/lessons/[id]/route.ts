import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireCourseWrite } from "@/lib/auth/api-guard";
import { lessonSchema } from "@/lib/validations/curriculum";
import {
  updateLesson,
  deleteLesson,
  courseIdForLesson,
} from "@/server/services/curriculum-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const courseId = await courseIdForLesson(id);
  if (!courseId) throw AppError.notFound("Lesson not found.");
  await requireCourseWrite(courseId);
  const input = lessonSchema.parse(await req.json().catch(() => ({})));
  await updateLesson(id, input);
  return ok({ message: "Lesson updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  const courseId = await courseIdForLesson(id);
  if (!courseId) throw AppError.notFound("Lesson not found.");
  await requireCourseWrite(courseId);
  await deleteLesson(id);
  return ok({ message: "Lesson deleted." });
});
