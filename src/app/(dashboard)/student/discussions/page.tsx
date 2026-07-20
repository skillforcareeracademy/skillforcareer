import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listStudentDiscussions,
  listDiscussionCourses,
} from "@/server/services/discussion-service";
import { StudentDiscussionsClient } from "@/components/student/student-discussions-client";

export const metadata: Metadata = { title: "Discussions" };
export const dynamic = "force-dynamic";

export default async function StudentDiscussionsPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const [threads, courses] = await Promise.all([
    listStudentDiscussions(user.id),
    listDiscussionCourses(user.id),
  ]);

  return (
    <StudentDiscussionsClient threads={threads} courses={courses} currentUserId={user.id} />
  );
}
