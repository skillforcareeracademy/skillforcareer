import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { removeDuplicatesSchema } from "@/lib/validations/lead";
import {
  findDuplicateLeads,
  removeDuplicateLeads,
} from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Leads that share a phone number (last 10 digits) or an email. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  return ok(await findDuplicateLeads());
});

/** Delete the copies the admin chose to drop. */
export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const input = removeDuplicatesSchema.parse(
    await req.json().catch(() => ({})),
  );
  const { removed } = await removeDuplicateLeads(input);
  return ok({
    removed,
    message: `${removed} duplicate lead${removed === 1 ? "" : "s"} removed.`,
  });
});
