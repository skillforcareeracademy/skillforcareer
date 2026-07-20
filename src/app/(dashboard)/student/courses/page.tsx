import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listPublicCourses } from "@/server/services/course-service";
import { listCategories } from "@/server/services/category-service";
import { getEnrolledCourseIds } from "@/server/services/enrollment-service";
import { StudentCoursesClient } from "@/components/student/student-courses-client";

export const metadata: Metadata = { title: "Courses" };
export const dynamic = "force-dynamic";

export default async function StudentCoursesPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const [courses, categories, enrolledIds] = await Promise.all([
    listPublicCourses({ take: 100 }),
    listCategories(),
    getEnrolledCourseIds(user.id),
  ]);

  return (
    <StudentCoursesClient
      courses={courses}
      categories={categories.filter((c) => c.isActive).map((c) => ({ slug: c.slug, name: c.name }))}
      enrolledIds={enrolledIds}
    />
  );
}
