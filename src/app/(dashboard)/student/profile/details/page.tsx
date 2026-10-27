import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getStudentDetail } from "@/server/services/student-detail-service";
import { StudentDetailsClient } from "@/components/student/student-details-client";

export const metadata: Metadata = { title: "My details" };
export const dynamic = "force-dynamic";

/**
 * The onboarding form the academy emails a link to after sign-up and again
 * once a fee is recorded.
 */
export default async function StudentDetailsPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const view = await getStudentDetail(user.id);

  // The client renders its own gradient header (the completion ring + status),
  // so no PageHeader here. Centred to a comfortable reading width.
  return (
    <div className="mx-auto max-w-3xl">
      <StudentDetailsClient view={view} />
    </div>
  );
}
