import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { createMeetingSchema } from "@/lib/validations/live";
import { createMeeting } from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const input = createMeetingSchema.parse(await req.json().catch(() => ({})));
  // Instructors always host their own classes; only staff may assign a host.
  const hostId = isStaffRole(user.role) ? input.hostId : user.id;
  const id = await createMeeting({ ...input, hostId }, user.id);
  return created({ id, message: "Live class scheduled." });
});
