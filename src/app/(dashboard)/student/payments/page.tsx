import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getStudentFees } from "@/server/services/student-payment-service";
import { StudentFeesView } from "@/components/student/student-fees-view";

export const metadata: Metadata = { title: "Fees & payments" };
export const dynamic = "force-dynamic";

export default async function StudentPaymentsPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const fees = await getStudentFees(user.id);
  return <StudentFeesView fees={fees} />;
}
