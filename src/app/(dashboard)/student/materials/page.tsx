import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listMaterialsForLearner } from "@/server/services/material-learner-service";
import { PageHeader } from "@/components/shared/page-header";
import { StudentMaterialsClient } from "@/components/student/materials-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Study material" };

/** The reading set for this learner, grouped as the academy grouped it. */
export default async function StudentMaterialsPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const materials = await listMaterialsForLearner(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Study material"
        description="Everything your instructors have set to read — highlight what matters and keep your notes on it."
      />
      <StudentMaterialsClient materials={materials} />
    </div>
  );
}
