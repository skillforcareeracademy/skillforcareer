import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listAssignmentsAdmin,
  assignmentStats,
  listCoursesForSelect,
  listBatchesForSelect,
  listStudentsForSelect,
} from "@/server/services/assignment-service";
import { AssignmentsClient } from "@/components/admin/assignments/assignments-client";

export const metadata: Metadata = { title: "Assignments" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function InstructorAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 10,
    search: str(sp.search),
    courseId: str(sp.course),
    batchId: str(sp.batch),
    type: str(sp.type),
    dueFrom: str(sp.from),
    dueTo: str(sp.to),
    instructorId: user.id,
  };

  const [{ assignments, total }, stats, courses, batches, students] = await Promise.all([
    listAssignmentsAdmin(query),
    assignmentStats(user.id),
    listCoursesForSelect(user.id),
    listBatchesForSelect(undefined, user.id),
    listStudentsForSelect(),
  ]);

  return (
    <AssignmentsClient
      assignments={assignments}
      total={total}
      query={query}
      stats={stats}
      courses={courses}
      batches={batches}
      students={students}
      canExport={false}
    />
  );
}
