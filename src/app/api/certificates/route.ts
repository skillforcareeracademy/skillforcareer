import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, userOwnsCourse } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { issueCertificateSchema } from "@/lib/validations/certificate";
import { issueCertificate } from "@/server/services/certificate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.ISSUE_CERTIFICATE);
  const { userId, courseId } = issueCertificateSchema.parse(await req.json().catch(() => ({})));
  // Instructors may only issue certificates for their own courses.
  if (!(await userOwnsCourse(user, courseId))) {
    throw AppError.forbidden("You can only issue certificates for your own courses.");
  }
  const id = await issueCertificate(userId, courseId);
  return created({ id, message: "Certificate issued." });
});
