import type { Metadata } from "next";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { listQuizCategories } from "@/server/services/quiz-category-service";
import { QuizGroupsClient } from "@/components/admin/quizzes/quiz-groups-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quiz groups" };

/**
 * Quiz grouping on a page of its own — a dialog was fine for three subjects
 * and unusable for thirty ("this should have a seperate page as it will be
 * difficult to manage it here").
 */
export default async function QuizGroupsPage() {
  await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const categories = await listQuizCategories();
  return <QuizGroupsClient categories={categories} />;
}
