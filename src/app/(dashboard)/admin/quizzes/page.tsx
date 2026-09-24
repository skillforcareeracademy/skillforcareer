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
    batchId: str(sp.batch),
    status: str(sp.status),
    categoryId: str(sp.category),
    subCategoryId: str(sp.sub),
    sort: str(sp.sort),
  };

  // Anything still unnumbered gets its number here, so the list an admin sees
  // and the order the learners get are never out of step.
  await backfillQuizSequences();

  const [{ quizzes, total }, stats, courses, batches, categories] = await Promise.all([
    listQuizzesAdmin(query),
    quizStats(),
    listCoursesForSelect(),
    listBatchesForSelect(),
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
    />
  );
}
