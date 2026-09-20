import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { candidateUpdateSchema } from "@/lib/validations/careers";
import {
  deleteCandidate,
  getCandidate,
  updateCandidate,
} from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One candidate with everything they sent, plus the timeline of changes. */
export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const id = String((await params).id);
  return ok(await getCandidate(id));
});

/** Status, partners, placement details and notes. */
export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const id = String((await params).id);
  const input = candidateUpdateSchema.parse(await req.json().catch(() => ({})));
  const candidate = await updateCandidate(id, input, user.id);
  return ok({ candidate, message: "Candidate updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const id = String((await params).id);
  await deleteCandidate(id);
  return ok({ message: "Candidate deleted." });
});
