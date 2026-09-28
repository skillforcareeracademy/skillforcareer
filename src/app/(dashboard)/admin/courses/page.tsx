import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listCoursesAdmin, courseStats } from "@/server/services/course-service";
import { prisma } from "@/lib/prisma";
import { listCategories } from "@/server/services/category-service";
import { CoursesClient } from "@/components/admin/courses/courses-client";

export const metadata: Metadata = { title: "Courses" };

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 10,
    search: str(sp.search),
    status: str(sp.status),
    categoryId: str(sp.category),
    deliveryMode: str(sp.mode),
    instructorId: str(sp.instructor),
    from: str(sp.from),
    to: str(sp.to),
  };
  const [{ courses, total }, categories, stats, instructors] = await Promise.all([
    listCoursesAdmin(query),
    listCategories(),
    courseStats(),
    // For the instructor filter — the people who actually own courses.
    prisma.user.findMany({
      where: { coursesAuthored: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return (
    <CoursesClient
      courses={courses}
      total={total}
      query={query}
      stats={stats}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      instructors={instructors}
    />
  );
}
