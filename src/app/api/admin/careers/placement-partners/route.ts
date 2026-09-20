import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { partnerSchema } from "@/lib/validations/careers";
import {
  createPlacementPartner,
  listPlacementPartners,
} from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Placement partners with how many candidates each has taken and placed. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  return ok(await listPlacementPartners());
});

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const input = partnerSchema.parse(await req.json().catch(() => ({})));
  const id = await createPlacementPartner(input);
  return created({ id, message: "Placement partner added." });
});
