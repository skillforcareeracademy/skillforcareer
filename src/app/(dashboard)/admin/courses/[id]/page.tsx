import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getCourseForEdit } from "@/server/services/course-service";
import { listCategories } from "@/server/services/category-service";
import { CourseEditor } from "@/components/admin/courses/course-editor";

export const metadata: Metadata = { title: "Edit course" };

export default async function CourseEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const { id } = await params;
  const [course, categories] = await Promise.all([
    getCourseForEdit(id),
    listCategories(),
  ]);
  if (!course) notFound();

  return (
    <CourseEditor
      course={course}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
