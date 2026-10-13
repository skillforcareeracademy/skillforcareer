import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { removePersonFromCompany } from "@/server/services/company-service";
import { requireAcademyOwner } from "@/lib/auth/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute(async (_req, { params }) => {
  await requireAcademyOwner();
  const { id, userId } = await params;
  await removePersonFromCompany(String(id), String(userId));
  return ok({ message: "Taken out of the company." });
});
