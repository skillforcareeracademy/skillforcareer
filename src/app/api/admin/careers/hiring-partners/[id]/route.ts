import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { partnerUpdateSchema } from "@/lib/validations/careers";
import {
  deleteHiringPartner,
  updateHiringPartner,
} from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const id = String((await params).id);
  const input = partnerUpdateSchema.parse(await req.json().catch(() => ({})));
  await updateHiringPartner(id, input);
  return ok({ message: "Hiring partner updated." });
});

/** Removes the partner and its posts; candidates stay, unlinked. */
export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const id = String((await params).id);
  await deleteHiringPartner(id);
  return ok({ message: "Hiring partner deleted." });
});
