import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { companyPersonSchema } from "@/lib/validations/company";
import { createCompanyPerson } from "@/server/services/company-service";
import { requireAcademyOwner } from "@/lib/auth/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A brand-new account that belongs to this company from the start. */
export const POST = withRoute(async (req, { params }) => {
  await requireAcademyOwner();
  const id = String((await params).id);
  const input = companyPersonSchema.parse(await req.json().catch(() => ({})));
  const person = await createCompanyPerson(id, input);
  return created({ id: person.id, message: `${input.name} is in.` });
});
