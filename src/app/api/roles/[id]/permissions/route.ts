import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { setRolePermissions } from "@/server/services/role-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ keys: z.array(z.string()).max(200) });

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_ROLES);
  const id = String((await params).id);
  const { keys } = schema.parse(await req.json().catch(() => ({})));
  await setRolePermissions(id, keys);
  return ok({ message: "Permissions saved." });
});
