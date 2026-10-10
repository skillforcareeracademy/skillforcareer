import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireAcademyOwner } from "@/lib/auth/api-guard";
import {
  addDomain,
  listDomains,
  subdomainAvailable,
} from "@/server/services/company-domain-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req, { params }) => {
  await requireAcademyOwner();
  const companyId = String((await params).id);
  // `?check=acme` asks whether a free subdomain is still going.
  const check = new URL(req.url).searchParams.get("check");
  if (check !== null) return ok(await subdomainAvailable(check));
  return ok({ domains: await listDomains(companyId) });
});

const bodySchema = z.object({
  host: z.string().trim().min(1, "Enter an address").max(255),
  kind: z.enum(["SUBDOMAIN", "CUSTOM"]).default("CUSTOM"),
});

export const POST = withRoute(async (req, { params }) => {
  await requireAcademyOwner();
  const companyId = String((await params).id);
  const input = bodySchema.parse(await req.json().catch(() => ({})));
  const id = await addDomain(companyId, input);
  return created({
    id,
    message:
      input.kind === "SUBDOMAIN"
        ? "Subdomain ready to use."
        : "Added. Put the records below in your DNS, then verify.",
  });
});
