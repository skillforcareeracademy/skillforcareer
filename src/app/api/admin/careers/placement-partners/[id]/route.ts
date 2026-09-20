import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { partnerUpdateSchema } from "@/lib/validations/careers";
import {
  deletePlacementPartner,
  updatePlacementPartner,
} from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edit details, or flip `isActive` on its own from the list's switch. */
export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const id = String((await params).id);
  const input = partnerUpdateSchema.parse(await req.json().catch(() => ({})));
  await updatePlacementPartner(id, input);
  return ok({ message: "Placement partner updated." });
});

/** Candidates keep their records; only their link to this partner is cleared. */
export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const id = String((await params).id);
  await deletePlacementPartner(id);
  return ok({ message: "Placement partner deleted." });
});
