import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listQuizzesAdmin,
  quizStats,
  listCoursesForSelect,
} from "@/server/services/quiz-service";
import { QuizzesClient } from "@/components/admin/quizzes/quizzes-client";

export const metadata: Metadata = { title: "Quizzes" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function InstructorQuizzesPage({
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
    courseId: str(sp.course),
    status: str(sp.status),
    ownerId: user.id,
  };

  const [{ quizzes, total }, stats, courses] = await Promise.all([
    listQuizzesAdmin(query),
    quizStats(user.id),
    listCoursesForSelect(user.id),
  ]);

  return (
    <QuizzesClient
      quizzes={quizzes}
      total={total}
      query={query}
      stats={stats}
      courses={courses}
      basePath="/instructor/quizzes"
    />
  );
}
