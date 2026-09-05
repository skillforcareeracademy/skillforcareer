import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireCourseWrite } from "@/lib/auth/api-guard";
import { getReleaseBoard, setRelease, RELEASE_MODES } from "@/server/services/release-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  lessonIds: z.array(z.string().min(1)).min(1, "Pick at least one lesson"),
  releaseMode: z.enum(RELEASE_MODES).optional(),
  releaseAt: z.string().nullish(),
  dripDays: z.coerce.number().int().min(0).max(3650).nullish(),
  viewLimit: z.coerce.number().int().min(0).max(999).nullish(),
  downloadLimit: z.coerce.number().int().min(0).max(999).nullish(),
  batchIds: z.array(z.string().min(1)).optional(),
  studentIds: z.array(z.string().min(1)).optional(),
});

/** The course's whole release picture — lessons, cohorts and learners. */
export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireCourseWrite(id);
  return ok(await getReleaseBoard(id));
});

/**
 * Apply a rule to a selection of lessons. Whether that's one lesson or half a
 * module is the caller's business — "aadhe module lock krke bhi access de skta
 * hai" is a single call with half the ids.
 */
export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireCourseWrite(id);
  const input = patchSchema.parse(await req.json().catch(() => ({})));
  const count = await setRelease(id, input);
  return ok({
    count,
    message: `Access updated for ${count} ${count === 1 ? "lesson" : "lessons"}.`,
  });
});
