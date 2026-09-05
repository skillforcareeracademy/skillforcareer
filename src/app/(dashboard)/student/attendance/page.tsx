import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getStudentAttendance } from "@/server/services/student-attendance-service";
import { StudentAttendanceView } from "@/components/student/student-attendance-view";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

export default async function StudentAttendancePage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const report = await getStudentAttendance(user.id);
  return <StudentAttendanceView report={report} />;
}
