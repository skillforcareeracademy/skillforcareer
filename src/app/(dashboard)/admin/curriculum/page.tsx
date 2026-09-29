import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { listCurriculums } from "@/server/services/curriculum-plan-service";
import { listCoursesForSelect, listBatchesForSelect } from "@/server/services/quiz-service";
import { CurriculumClient } from "@/components/admin/curriculum/curriculum-client";
import { backfillAcademyIds } from "@/server/services/academy-ids-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Curriculum" };

export default async function AdminCurriculumPage() {
  await requirePermission(PERMISSIONS.MANAGE_CURRICULUM);
  // Curriculums written before the academy's numbering existed get theirs here.
  await backfillAcademyIds();

  const [curriculums, courses, batches] = await Promise.all([
    listCurriculums(),
    listCoursesForSelect(),
    listBatchesForSelect(),
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
