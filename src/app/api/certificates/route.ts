import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, userOwnsCourse } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { issueCertificateInputSchema } from "@/lib/validations/certificate";
import { issueCertificate } from "@/server/services/certificate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.ISSUE_CERTIFICATE);
  const input = issueCertificateInputSchema.parse(await req.json().catch(() => ({})));

  // Instructors may only issue certificates for their own courses. An award
  // with no course at all (appreciation) is a staff decision, not a teaching
  // one, so it stays with staff.
  if (!(await userOwnsCourse(user, input.courseId || null))) {
    throw AppError.forbidden(
      input.courseId
        ? "You can only issue certificates for your own courses."
        : "Only staff can issue certificates that aren't tied to a course.",
    );
  }

  const id = await issueCertificate(input);
  return created({ id, message: "Certificate issued." });
});
