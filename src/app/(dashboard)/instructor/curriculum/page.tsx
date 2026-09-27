import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { listCurriculums } from "@/server/services/curriculum-plan-service";
import { listCoursesForSelect, listBatchesForSelect } from "@/server/services/quiz-service";
import { CurriculumClient } from "@/components/admin/curriculum/curriculum-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Curriculum" };

/**
 * Instructors reach this only when an admin has granted them
 * `curriculum:manage` from Roles — the academy's "if admin allows".
 */
export default async function InstructorCurriculumPage() {
  const user = await requirePermission(PERMISSIONS.MANAGE_CURRICULUM);
  const [curriculums, courses, batches] = await Promise.all([
    listCurriculums(),
    listCoursesForSelect(user.id),
    listBatchesForSelect(undefined, user.id),
  ]);

  return (
    <CurriculumClient
      curriculums={curriculums}
      courses={courses}
      batches={batches.map((b) => ({ id: b.id, name: b.name, courseTitle: b.courseTitle }))}
      canManage
    />
  );
}
