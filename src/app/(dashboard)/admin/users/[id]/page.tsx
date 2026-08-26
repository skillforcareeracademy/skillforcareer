import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getStudentProfile } from "@/server/services/student-profile-service";
import { StudentProfileView } from "@/components/admin/users/student-profile-view";

export const metadata: Metadata = { title: "Student profile" };

/**
 * The one place that answers "where is this learner up to?" — cohort and
 * timings, attendance, assessments, fees and certificate, on a single screen.
 */
export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const { id } = await params;

  let profile;
  try {
    profile = await getStudentProfile(id);
  } catch {
    notFound();
  }

  return <StudentProfileView profile={profile} />;
}
