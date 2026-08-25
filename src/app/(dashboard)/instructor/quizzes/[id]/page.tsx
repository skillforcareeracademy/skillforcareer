import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require";
import { ROLES, PERMISSIONS } from "@/config/roles";
import {
  getQuizEdit,
  listCoursesForSelect,
  listBatchesForSelect,
} from "@/server/services/quiz-service";
import { prisma } from "@/lib/prisma";
import { QuizEditor } from "@/components/admin/quizzes/quiz-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit quiz" };

export default async function InstructorQuizEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  const { id } = await params;

  const quiz = await getQuizEdit(id).catch(() => null);
  if (!quiz) notFound();

  // Instructors may only open quizzes they created or that belong to their courses.
  const isStaff = user.permissions.includes(PERMISSIONS.UPDATE_ANY_COURSE);
  if (!isStaff) {
    const owned = await prisma.quiz.findFirst({
      where: {
        id,
        OR: [{ createdById: user.id }, { course: { instructorId: user.id } }],
      },
      select: { id: true },
    });
    if (!owned) notFound();
  }

  const [courses, batches] = await Promise.all([
    listCoursesForSelect(isStaff ? undefined : user.id),
    listBatchesForSelect(undefined, isStaff ? undefined : user.id),
  ]);
  return (
    <QuizEditor
      quiz={quiz}
      courses={courses}
      batches={batches}
      basePath="/instructor/quizzes"
      canExport={isStaff}
    />
  );
}
