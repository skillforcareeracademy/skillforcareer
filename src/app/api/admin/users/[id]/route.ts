import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { updateUserAdminSchema } from "@/lib/validations/user";
import { updateUserAdmin, deleteUserAdmin } from "@/server/services/user-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const id = String((await params).id);
  const input = updateUserAdminSchema.parse(await req.json().catch(() => ({})));
  await updateUserAdmin(id, input);
  return ok({ message: "User updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const actor = await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const id = String((await params).id);
  await deleteUserAdmin(id, actor.id);
  return ok({ message: "User deleted." });
});
