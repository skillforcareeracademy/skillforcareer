import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listDiscussionsAdmin,
  discussionStats,
  listCoursesForSelect,
} from "@/server/services/discussion-service";
import { DiscussionsClient } from "@/components/admin/discussions/discussions-client";

export const metadata: Metadata = { title: "Discussions" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function InstructorDiscussionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 10,
    search: str(sp.search),
    courseId: str(sp.course),
    status: str(sp.status),
    instructorId: user.id,
  };

  const [{ threads, total }, stats, courses] = await Promise.all([
    listDiscussionsAdmin(query),
    discussionStats(user.id),
    listCoursesForSelect(user.id),
  ]);

  return (
    <DiscussionsClient
      threads={threads}
      total={total}
      query={query}
      stats={stats}
      courses={courses}
    />
  );
}
