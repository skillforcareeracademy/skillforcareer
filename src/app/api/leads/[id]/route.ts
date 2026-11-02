import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiLeadAdmin, requireApiLeadAccess } from "@/lib/auth/api-guard";
import { updateLeadSchema } from "@/lib/validations/lead";
import {
  updateLead,
  deleteLead,
  getLeadDetail,
} from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireApiLeadAccess(id, { write: false });
  return ok(await getLeadDetail(id));
});

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const guard = await requireApiLeadAccess(id, { write: true });
  const input = updateLeadSchema.parse(await req.json().catch(() => ({})));
  // A sales agent may work their lead but not hand it to someone else — only an
  // admin reassigns, so drop any assignee change from an own-scoped editor.
  if (!guard.all) delete input.assignedToId;
  await updateLead(id, input);
  return ok({ message: "Lead updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiLeadAdmin();
  const id = String((await params).id);
  await deleteLead(id);
  return ok({ message: "Lead deleted." });
});
