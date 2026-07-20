import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireCourseWrite } from "@/lib/auth/api-guard";
import { chapterSchema } from "@/lib/validations/curriculum";
import {
  updateChapter,
  deleteChapter,
  courseIdForChapter,
} from "@/server/services/curriculum-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const courseId = await courseIdForChapter(id);
  if (!courseId) throw AppError.notFound("Chapter not found.");
  await requireCourseWrite(courseId);
  const input = chapterSchema.parse(await req.json().catch(() => ({})));
  await updateChapter(id, input);
  return ok({ message: "Chapter updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  const courseId = await courseIdForChapter(id);
  if (!courseId) throw AppError.notFound("Chapter not found.");
  await requireCourseWrite(courseId);
  await deleteChapter(id);
  return ok({ message: "Chapter deleted." });
});
