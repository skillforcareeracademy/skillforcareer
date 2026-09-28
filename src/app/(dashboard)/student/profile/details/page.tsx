import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getStudentDetail } from "@/server/services/student-detail-service";
import { PageHeader } from "@/components/shared/page-header";
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="My details"
        description="What the academy needs on file — address, documents, schooling and your CV."
      />
      <StudentDetailsClient view={view} />
    </div>
  );
}
