import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { curriculumSchema } from "@/lib/validations/curriculum-plan";
import { deleteCurriculum, updateCurriculum } from "@/server/services/curriculum-plan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_CURRICULUM);
  const id = String((await params).id);
  const input = curriculumSchema.parse(await req.json().catch(() => ({})));
  await updateCurriculum(id, input, user.id);
  return ok({ message: "Curriculum saved. Learners on it have been told." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_CURRICULUM);
  await deleteCurriculum(String((await params).id));
  return ok({ message: "Curriculum deleted." });
});
