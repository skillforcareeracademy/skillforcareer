import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { companySchema } from "@/lib/validations/company";
import {
  deleteCompany,
  getCompany,
  updateCompany,
} from "@/server/services/company-service";
import { requireAcademyOwner } from "@/lib/auth/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  await requireAcademyOwner();
  return ok(await getCompany(String((await params).id)));
});

export const PATCH = withRoute(async (req, { params }) => {
  await requireAcademyOwner();
  const input = companySchema.parse(await req.json().catch(() => ({})));
  await updateCompany(String((await params).id), input);
  return ok({ message: "Saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireAcademyOwner();
  await deleteCompany(String((await params).id));
  return ok({ message: "Company removed." });
});
