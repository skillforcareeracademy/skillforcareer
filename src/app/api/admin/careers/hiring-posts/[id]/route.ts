import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { hiringPostUpdateSchema } from "@/lib/validations/careers";
import {
  deleteHiringPost,
  updateHiringPost,
} from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edit a post, or open/close it from the list's switch. */
export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const id = String((await params).id);
  const input = hiringPostUpdateSchema.parse(await req.json().catch(() => ({})));
  await updateHiringPost(id, input);
  return ok({ message: "Post updated." });
});

/** Candidates filed against the post stay with the partner, just not the post. */
export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const id = String((await params).id);
  await deleteHiringPost(id);
  return ok({ message: "Post deleted." });
});
