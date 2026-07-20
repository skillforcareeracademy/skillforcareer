import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listAssignmentsAdmin,
  assignmentStats,
  listCoursesForSelect,
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
    instructorId: user.id,
  };

  const [{ assignments, total }, stats, courses] = await Promise.all([
    listAssignmentsAdmin(query),
    assignmentStats(user.id),
    listCoursesForSelect(user.id),
  ]);

  return (
    <AssignmentsClient
      assignments={assignments}
      total={total}
      query={query}
      stats={stats}
      courses={courses}
    />
  );
}
