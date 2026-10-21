import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getQuizForAttempt } from "@/server/services/student-quiz-service";
import { QuizRunner } from "@/components/student/quiz-runner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quiz preview" };

/**
 * An admin or instructor takes the quiz exactly as a learner would — "I should
 * be able to see as a student and attempt quiz". It records nothing: the
 * service grades a preview without writing an attempt.
 */
export default async function QuizPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole([
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.INSTRUCTOR,
  ]);
  const { id } = await params;
  const quiz = await getQuizForAttempt(user.id, id, true);
  if (!quiz) notFound();
  return <QuizRunner quiz={quiz} />;
}
