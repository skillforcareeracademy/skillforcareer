import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listStudentMeetings } from "@/server/services/live-service";
import { StudentLiveClient } from "@/components/student/student-live-client";

export const metadata: Metadata = { title: "Live Classes" };
export const dynamic = "force-dynamic";

export default async function StudentLivePage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const meetings = await listStudentMeetings(user.id);
  return <StudentLiveClient meetings={meetings} />;
}
