import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { partnerSchema } from "@/lib/validations/careers";
import {
  createHiringPartner,
  listHiringPartners,
} from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hiring partners, each with its posts and hire counts. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  return ok(await listHiringPartners());
});

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const input = partnerSchema.parse(await req.json().catch(() => ({})));
  const id = await createHiringPartner(input);
  return created({ id, message: "Hiring partner added." });
});
