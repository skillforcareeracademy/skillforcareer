import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listStudentAssignments } from "@/server/services/student-assignment-service";
import { StudentAssignmentsClient } from "@/components/student/student-assignments-client";

export const metadata: Metadata = { title: "Assignments" };
export const dynamic = "force-dynamic";

export default async function StudentAssignmentsPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const assignments = await listStudentAssignments(user.id);
  return <StudentAssignmentsClient assignments={assignments} />;
}
