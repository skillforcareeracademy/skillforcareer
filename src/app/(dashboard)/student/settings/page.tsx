import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getProfile } from "@/server/services/profile-service";
import { getNotificationPrefs } from "@/server/services/preferences-service";
import { StudentSettingsClient } from "@/components/student/student-settings-client";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function StudentSettingsPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const [profile, notifications] = await Promise.all([
    getProfile(user.id),
    getNotificationPrefs(user.id),
  ]);
  return <StudentSettingsClient profile={profile} notifications={notifications} />;
}
