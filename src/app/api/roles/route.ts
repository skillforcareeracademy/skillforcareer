import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { createRole } from "@/server/services/role-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "Enter a role name").max(40),
  description: z.string().trim().max(200).optional().or(z.literal("")),
});

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_ROLES);
  const { name, description } = schema.parse(await req.json().catch(() => ({})));
  const id = await createRole(name, description || undefined);
  return created({ id, message: "Role created." });
});
