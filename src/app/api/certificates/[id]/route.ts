import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireCertificateWrite } from "@/lib/auth/api-guard";
import { setCertificateStatusSchema } from "@/lib/validations/certificate";
import { setCertificateStatus, deleteCertificate } from "@/server/services/certificate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireCertificateWrite(id);
  const { status } = setCertificateStatusSchema.parse(await req.json().catch(() => ({})));
  await setCertificateStatus(id, status);
  return ok({ message: status === "REVOKED" ? "Certificate revoked." : "Certificate reinstated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireCertificateWrite(id);
  await deleteCertificate(id);
  return ok({ message: "Certificate deleted." });
});
