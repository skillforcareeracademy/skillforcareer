import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiLeadAccess } from "@/lib/auth/api-guard";
import { deleteLeadDocument } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute(async (_req, { params }) => {
  const { id, docId } = await params;
  await requireApiLeadAccess(String(id), { write: true });
  await deleteLeadDocument(String(id), String(docId));
  return ok({ message: "Document removed." });
});
