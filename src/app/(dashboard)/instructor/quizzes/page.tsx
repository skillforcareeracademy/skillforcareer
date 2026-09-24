import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listQuizzesAdmin,
  quizStats,
  listCoursesForSelect,
  listBatchesForSelect,
  backfillQuizSequences,
} from "@/server/services/quiz-service";
import { listQuizCategoryOptions } from "@/server/services/quiz-category-service";
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
    batchId: str(sp.batch),
    status: str(sp.status),
    categoryId: str(sp.category),
    subCategoryId: str(sp.sub),
    sort: str(sp.sort),
    ownerId: user.id,
  };

  await backfillQuizSequences();

  const [{ quizzes, total }, stats, courses, batches, categories] = await Promise.all([
    listQuizzesAdmin(query),
    quizStats(user.id),
    listCoursesForSelect(user.id),
    listBatchesForSelect(undefined, user.id),
    listQuizCategoryOptions(),
  ]);

  return (
    <QuizzesClient
      quizzes={quizzes}
      total={total}
      query={query}
      stats={stats}
      courses={courses}
      batches={batches}
      categories={categories}
      basePath="/instructor/quizzes"
    />
  );
}
