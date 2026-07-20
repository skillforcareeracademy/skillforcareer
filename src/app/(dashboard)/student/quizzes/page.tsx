import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listStudentQuizzes } from "@/server/services/student-quiz-service";
import { StudentQuizzesClient } from "@/components/student/student-quizzes-client";

export const metadata: Metadata = { title: "Quizzes" };
export const dynamic = "force-dynamic";

export default async function StudentQuizzesPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const quizzes = await listStudentQuizzes(user.id);
  return <StudentQuizzesClient quizzes={quizzes} />;
}
