import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listCoursesAdmin, courseStats } from "@/server/services/course-service";
import { listCategories } from "@/server/services/category-service";
import { CoursesClient } from "@/components/admin/courses/courses-client";

export const metadata: Metadata = { title: "My courses" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function InstructorCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 10,
    search: str(sp.search),
    status: str(sp.status),
    categoryId: str(sp.category),
    instructorId: user.id,
  };
  const [{ courses, total }, categories, stats] = await Promise.all([
    listCoursesAdmin(query),
    listCategories(),
    courseStats(user.id),
  ]);

  return (
    <CoursesClient
      courses={courses}
      total={total}
      query={query}
      stats={stats}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      basePath="/instructor/courses"
      canDelete={false}
    />
  );
}
