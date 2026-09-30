import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importCandidatesSchema } from "@/lib/validations/careers";
import { importCandidates } from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Load candidates collected off-site — a drive, a WhatsApp group — in bulk. */
export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const input = importCandidatesSchema.parse(
    await req.json().catch(() => ({})),
  );
  return ok(await importCandidates(input));
});
