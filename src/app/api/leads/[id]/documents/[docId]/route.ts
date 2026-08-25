import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { deleteLeadDocument } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const { id, docId } = await params;
  await deleteLeadDocument(String(id), String(docId));
  return ok({ message: "Document removed." });
});
