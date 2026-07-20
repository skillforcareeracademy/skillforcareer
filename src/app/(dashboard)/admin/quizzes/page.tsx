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

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function QuizzesPage({
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
    courseId: str(sp.course),
    status: str(sp.status),
  };

  const [{ quizzes, total }, stats, courses] = await Promise.all([
    listQuizzesAdmin(query),
    quizStats(),
    listCoursesForSelect(),
  ]);

  return (
    <QuizzesClient
      quizzes={quizzes}
      total={total}
      query={query}
      stats={stats}
      courses={courses}
    />
  );
}
