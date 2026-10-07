import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { deleteDraft, senderFrom } from "@/server/services/broadcast-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Throw away a draft. Sent announcements stay as the record of what went out. */
export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.SEND_BROADCAST);
  await deleteDraft(String((await params).id), senderFrom(user));
  return ok({ message: "Draft deleted." });
});
