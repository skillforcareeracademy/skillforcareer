import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { updateLeadSchema } from "@/lib/validations/lead";
import {
  updateLead,
  deleteLead,
  getLeadDetail,
} from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const id = String((await params).id);
  return ok(await getLeadDetail(id));
});

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const id = String((await params).id);
  const input = updateLeadSchema.parse(await req.json().catch(() => ({})));
  await updateLead(id, input);
  return ok({ message: "Lead updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const id = String((await params).id);
  await deleteLead(id);
  return ok({ message: "Lead deleted." });
});
