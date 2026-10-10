import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireAcademyOwner } from "@/lib/auth/api-guard";
import {
  removeDomain,
  setPrimaryDomain,
  verifyDomain,
} from "@/server/services/company-domain-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["verify", "primary"]),
});

export const POST = withRoute(async (req, { params }) => {
  await requireAcademyOwner();
  const { domainId } = await params;
  const { action } = bodySchema.parse(await req.json().catch(() => ({})));

  if (action === "primary") {
    await setPrimaryDomain(String(domainId));
    return ok({ message: "That's the main address now." });
  }
  const domain = await verifyDomain(String(domainId));
  return ok({
    domain,
    message:
      domain.status === "VERIFIED"
        ? "Verified — the domain is live."
        : (domain.lastError ?? "Not pointed here yet. DNS can take a while."),
  });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireAcademyOwner();
  await removeDomain(String((await params).domainId));
  return ok({ message: "Domain removed." });
});
