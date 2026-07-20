import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { getQuizForAttempt } from "@/server/services/student-quiz-service";
import { QuizRunner } from "@/components/student/quiz-runner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quiz" };

export default async function TakeQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const quiz = await getQuizForAttempt(user.id, id);
  if (!quiz) notFound();

  return <QuizRunner quiz={quiz} />;
}
