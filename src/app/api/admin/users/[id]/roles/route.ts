import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { addExtraRoleSchema, setExtraRolesSchema } from "@/lib/validations/user";
import { addExtraRole, setExtraRoles } from "@/server/services/user-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH — replace the extra roles someone holds besides their primary one. */
export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const id = String((await params).id);
  const { extraRoles } = setExtraRolesSchema.parse(await req.json().catch(() => ({})));
  return ok({ extraRoles: await setExtraRoles(id, extraRoles) });
});

/** POST — add one role to an existing account ("they're a student and now teach too"). */
export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const id = String((await params).id);
  const { roleSlug } = addExtraRoleSchema.parse(await req.json().catch(() => ({})));
  await addExtraRole(id, roleSlug);
  return ok({ message: "Role added." });
});
