import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { sendBroadcastSchema } from "@/lib/validations/broadcast";
import { listBroadcasts, sendBroadcast, senderFrom } from "@/server/services/broadcast-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What has been sent — everything for staff, their own for an instructor. */
export const GET = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.SEND_BROADCAST);
  const page = Number(new URL(req.url).searchParams.get("page") ?? 1) || 1;
  return ok(await listBroadcasts(senderFrom(user), page));
});

/** Send an announcement. */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.SEND_BROADCAST);
  const input = sendBroadcastSchema.parse(await req.json().catch(() => ({})));
  return created(await sendBroadcast(input, senderFrom(user)));
});
