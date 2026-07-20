import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  getStudentPerformance,
  getBatchPerformance,
} from "@/server/services/analytics-service";
import { PerformanceView } from "@/components/admin/performance/performance-view";

export const metadata: Metadata = { title: "Performance" };
export const dynamic = "force-dynamic";

export default async function InstructorPerformancePage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  // Scoped: an instructor only sees analytics for their own courses/batches/students.
  const [students, batches] = await Promise.all([
    getStudentPerformance(user.id),
    getBatchPerformance(user.id),
  ]);
  return (
    <PerformanceView
      students={students}
      batches={batches}
      title="Performance"
      description="Outcomes for your students and batches."
    />
  );
}
