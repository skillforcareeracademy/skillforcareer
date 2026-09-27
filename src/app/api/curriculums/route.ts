import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { curriculumSchema, reorderCurriculumsSchema } from "@/lib/validations/curriculum-plan";
import { createCurriculum, reorderCurriculums } from "@/server/services/curriculum-plan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_CURRICULUM);
  const input = curriculumSchema.parse(await req.json().catch(() => ({})));
  const id = await createCurriculum(input, user.id);
  return created({ id, message: "Curriculum created." });
});

/** Renumber the list — the order learners see it in. */
export const PATCH = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_CURRICULUM);
  const { ids } = reorderCurriculumsSchema.parse(await req.json().catch(() => ({})));
  const count = await reorderCurriculums(ids);
  return ok({ count, message: "Order saved." });
});
