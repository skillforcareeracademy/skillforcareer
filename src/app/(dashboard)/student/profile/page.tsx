import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getProfile } from "@/server/services/profile-service";
import { getStudentDetail } from "@/server/services/student-detail-service";
import { StudentProfileTabs } from "@/components/student/student-profile-tabs";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/**
 * The learner's profile as two tabs — Basic details and My details — rather
 * than the shared single-column view other roles get.
 */
export default async function StudentProfilePage() {
  const user = await requireRole([
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.STUDENT,
  ]);
  const [profile, detail] = await Promise.all([
    getProfile(user.id),
    getStudentDetail(user.id),
  ]);

  return <StudentProfileTabs profile={profile} detail={detail} />;
}
