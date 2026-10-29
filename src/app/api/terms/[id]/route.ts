import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { termSchema } from "@/lib/validations/term";
import { deleteTerm, updateTerm } from "@/server/services/term-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const id = String((await params).id);
  const input = termSchema.parse(await req.json().catch(() => ({})));
  await updateTerm(id, input);
  return ok({ message: "Saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  await deleteTerm(String((await params).id), user.id);
  return ok({ message: "Moved to the recycle bin." });
});
