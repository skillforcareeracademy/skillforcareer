import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { previewAudienceSchema } from "@/lib/validations/broadcast";
import { resolveAudience, senderFrom } from "@/server/services/broadcast-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How many people the current pick would reach, counted the same way the send
 * counts them — the composer shows this before anything goes out.
 */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.SEND_BROADCAST);
  const input = previewAudienceSchema.parse(await req.json().catch(() => ({})));
  const audience = await resolveAudience(input, senderFrom(user));
  return ok({
    total: audience.total,
    withAccounts: audience.userIds.length,
    emailOnly: audience.contacts.length,
  });
});
