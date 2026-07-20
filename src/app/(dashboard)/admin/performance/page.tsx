import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  getStudentPerformance,
  getBatchPerformance,
  getInstructorPerformance,
} from "@/server/services/analytics-service";
import { PerformanceView } from "@/components/admin/performance/performance-view";

export const metadata: Metadata = { title: "Performance" };
export const dynamic = "force-dynamic";

export default async function AdminPerformancePage() {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const [students, batches, instructors] = await Promise.all([
    getStudentPerformance(),
    getBatchPerformance(),
    getInstructorPerformance(),
  ]);
  return <PerformanceView students={students} batches={batches} instructors={instructors} />;
}
