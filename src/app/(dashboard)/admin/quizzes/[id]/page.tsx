import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  getQuizEdit,
  listCoursesForSelect,
  listBatchesForSelect,
} from "@/server/services/quiz-service";
import { QuizEditor } from "@/components/admin/quizzes/quiz-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit quiz" };

export default async function QuizEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const { id } = await params;

  const quiz = await getQuizEdit(id).catch(() => null);
  if (!quiz) notFound();
  const [courses, batches] = await Promise.all([
    listCoursesForSelect(),
    listBatchesForSelect(),
  ]);

  return <QuizEditor quiz={quiz} courses={courses} batches={batches} />;
}
