import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { reorderMaterials } from "@/server/services/study-material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });

/** Renumber a group 1…n; the body is the ids in their new order. */
export const PATCH = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const { ids } = schema.parse(await req.json().catch(() => ({})));
  const staff = user.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);
  const count = await reorderMaterials(ids, staff ? undefined : user.id);
  return ok({ count, message: "Order saved." });
});
