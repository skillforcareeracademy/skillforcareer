import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listQuizzesAdmin,
  quizStats,
  listCoursesForSelect,
  listBatchesForSelect,
  backfillQuizSequences,
  backfillQuizNumbers,
} from "@/server/services/quiz-service";
import { listQuizCategoryOptions } from "@/server/services/quiz-category-service";
import { groupOptions } from "@/server/services/content-group-service";
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
    // Folder view shows the whole tree, so it is not paged — a folder holding
    // page two of its own contents would be worse than no folder at all. The
    // client opens on the folder view, so no `view` param means folders too;
    // only an explicit `table` pages down to 10. (Before this, a first load
    // fetched 10 and the folder view silently dropped the rest — "quiz create
    // krne ke baad folder me nazar nhi aa rhi".)
    pageSize: str(sp.view) === "table" ? 10 : 500,
    search: str(sp.search),
    courseId: str(sp.course),
    batchId: str(sp.batch),
    status: str(sp.status),
    categoryId: str(sp.category),
    subCategoryId: str(sp.sub),
    difficulty: str(sp.difficulty),
    quizType: str(sp.type),
    sort: str(sp.sort),
    view: str(sp.view),
  };

  // Anything still unnumbered gets its numbers here — the permanent quiz
  // number and the order inside its group — so the list an admin sees and the
  // order the learners get are never out of step.
  await Promise.all([backfillQuizSequences(), backfillQuizNumbers()]);

  const [{ quizzes, total }, stats, courses, batches, categories, groups] =
    await Promise.all([
    listQuizzesAdmin(query),
    quizStats(),
    listCoursesForSelect(),
    listBatchesForSelect(),
    listQuizCategoryOptions(),
    groupOptions("QUIZ"),
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
      groups={groups}
    />
  );
}
