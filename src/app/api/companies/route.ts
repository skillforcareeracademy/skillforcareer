import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireAcademyOwner } from "@/lib/auth/api-guard";
import { companySchema } from "@/lib/validations/company";
import { createCompany, listCompanies } from "@/server/services/company-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Companies belong to the academy alone — see `requireAcademyOwner`. */
export const GET = withRoute(async () => {
  await requireAcademyOwner();
  return ok({ companies: await listCompanies() });
});

export const POST = withRoute(async (req) => {
  await requireAcademyOwner();
  const input = companySchema.parse(await req.json().catch(() => ({})));
  const id = await createCompany(input);
  return created({ id, message: `${input.name} added.` });
});
