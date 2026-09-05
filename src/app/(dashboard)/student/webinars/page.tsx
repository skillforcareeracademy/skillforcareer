import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listWebinarsForStudent } from "@/server/services/webinar-service";
import { StudentWebinarsClient } from "@/components/student/student-webinars-client";

export const metadata: Metadata = { title: "Webinars" };
export const dynamic = "force-dynamic";

export default async function StudentWebinarsPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const webinars = await listWebinarsForStudent(user.id, user.email);
  return <StudentWebinarsClient webinars={webinars} />;
}
