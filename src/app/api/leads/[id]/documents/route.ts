import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { leadDocumentSchema } from "@/lib/validations/lead";
import { addLeadDocument } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Attach a document already stored by POST /api/upload. */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const id = String((await params).id);
  const input = leadDocumentSchema.parse(await req.json().catch(() => ({})));
  const documentId = await addLeadDocument(id, input, user.id);
  return created({ id: documentId, message: "Document attached." });
});
