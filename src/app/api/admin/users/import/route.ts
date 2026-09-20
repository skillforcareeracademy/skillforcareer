import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importUsersSchema } from "@/lib/validations/user";
import { importUsers } from "@/server/services/user-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A few hundred rows, each an account write and a welcome email.
export const maxDuration = 300;

/** Bulk-create accounts from a CSV; bad rows come back in `errors`. */
export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const input = importUsersSchema.parse(await req.json().catch(() => ({})));
  const result = await importUsers(input);
  const parts = [`${result.created} created`];
  if (result.rolesAdded) parts.push(`${result.rolesAdded} existing given the role`);
  if (result.skipped) parts.push(`${result.skipped} skipped`);
  return created({ ...result, message: `${parts.join(", ")}.` });
});
