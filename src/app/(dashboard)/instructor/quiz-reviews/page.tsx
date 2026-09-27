import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES, PERMISSIONS } from "@/config/roles";
import { listQuestionReviews } from "@/server/services/question-review-service";
import { QuizReviewsClient } from "@/components/admin/quizzes/quiz-reviews-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Question reviews" };

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function InstructorQuizReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = str(sp.status);
  // An instructor sees the requests on their own quizzes; staff see them all.
  const isStaff = user.permissions.includes(PERMISSIONS.UPDATE_ANY_COURSE);
  const { reviews, total, open } = await listQuestionReviews({
    page,
    pageSize: 10,
    status,
    ownerId: isStaff ? undefined : user.id,
  });

  return (
    <QuizReviewsClient
      reviews={reviews}
      total={total}
      open={open}
      status={status}
      page={page}
      pageSize={10}
      basePath="/instructor/quiz-reviews"
      quizBasePath="/instructor/quizzes"
    />
  );
}
