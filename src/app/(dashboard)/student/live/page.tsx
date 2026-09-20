import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listStudentMeetings } from "@/server/services/live-service";
import { getHolidayToday } from "@/server/services/holiday-service";
import { istDateKey, istToday } from "@/lib/ist";
import { StudentLiveClient } from "@/components/student/student-live-client";

export const metadata: Metadata = { title: "Live Classes" };
export const dynamic = "force-dynamic";

export default async function StudentLivePage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const [meetings, holiday] = await Promise.all([listStudentMeetings(user.id), getHolidayToday()]);
  // An admin can still put a class on a holiday; then "no class today" isn't true.
  const today = istToday();
  const classToday = meetings.some(
    (m) => (m.phase === "upcoming" || m.phase === "live") && istDateKey(new Date(m.scheduledStart)) === today,
  );
  return (
    <StudentLiveClient
      meetings={meetings}
      holidayToday={holiday ? { ...holiday, classToday } : null}
    />
  );
}
