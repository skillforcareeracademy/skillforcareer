import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireCourseWrite } from "@/lib/auth/api-guard";
import { chapterSchema, reorderSchema } from "@/lib/validations/curriculum";
import { createChapter, reorderChapters } from "@/server/services/curriculum-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const courseId = String((await params).id);
  await requireCourseWrite(courseId);
  const input = chapterSchema.parse(await req.json().catch(() => ({})));
  const id = await createChapter(courseId, input);
  return created({ id, message: "Chapter added." });
});

/** Reorder chapters within the course. Body: { ids: string[] } */
export const PATCH = withRoute(async (req, { params }) => {
  const courseId = String((await params).id);
  await requireCourseWrite(courseId);
  const { ids } = reorderSchema.parse(await req.json().catch(() => ({})));
  await reorderChapters(ids);
  return ok({ message: "Reordered." });
});
