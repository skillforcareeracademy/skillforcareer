import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { z } from "zod";
import {
  getUserPermissions,
  setUserPermissions,
} from "@/server/services/role-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One person's own permissions, on top of whatever their role gives them.
 *
 * Behind MANAGE_ROLES rather than MANAGE_USERS: this is granting access, not
 * editing a profile, and it should sit with whoever looks after the roles.
 */
export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_ROLES);
  return ok(await getUserPermissions(String((await params).id)));
});

const bodySchema = z.object({
  overrides: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(100),
        allow: z.boolean(),
      }),
    )
    .max(200),
});

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_ROLES);
  const { overrides } = bodySchema.parse(await req.json().catch(() => ({})));
  await setUserPermissions(String((await params).id), overrides);
  return ok({ message: "Permissions updated." });
});
