import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require";
import { ROLES, PERMISSIONS } from "@/config/roles";
import { getCourseForEdit } from "@/server/services/course-service";
import { listCategories } from "@/server/services/category-service";
import { CourseEditor } from "@/components/admin/courses/course-editor";

export const metadata: Metadata = { title: "Edit course" };
export const dynamic = "force-dynamic";

export default async function InstructorCourseEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  const { id } = await params;
  const [course, categories] = await Promise.all([
    getCourseForEdit(id),
    listCategories(),
  ]);
  if (!course) notFound();

  // Instructors may only open their own courses; staff (UPDATE_ANY) may open any.
  const canEditAny = user.permissions.includes(PERMISSIONS.UPDATE_ANY_COURSE);
  if (!canEditAny && course.instructorId !== user.id) notFound();

  return (
    <CourseEditor
      course={course}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      basePath="/instructor/courses"
    />
  );
}
