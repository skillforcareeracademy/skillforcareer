import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { getCoursePlayer } from "@/server/services/learning-service";
import { CoursePlayer } from "@/components/student/course-player";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Learning" };

export default async function LearnPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const player = await getCoursePlayer(user.id, slug);
  if (!player) notFound();
  if (!player.enrolled) redirect(`/courses/${slug}`);

  return <CoursePlayer player={player} viewerLabel={user.email} />;
}
