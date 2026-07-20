import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listMeetingsAdmin,
  meetingStats,
  listCoursesForSelect,
  listBatchesForSelect,
} from "@/server/services/live-service";
import { LiveClient } from "@/components/admin/live/live-client";

export const metadata: Metadata = { title: "Live Classes" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function InstructorLivePage({
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
    status: str(sp.status),
    courseId: str(sp.course),
    hostId: user.id,
  };

  const [{ meetings, total }, stats, courses, batches] = await Promise.all([
    listMeetingsAdmin(query),
    meetingStats(user.id),
    listCoursesForSelect(user.id),
    listBatchesForSelect(user.id),
  ]);

  return (
    <LiveClient
      meetings={meetings}
      total={total}
      query={query}
      stats={stats}
      hosts={[{ id: user.id, name: user.name }]}
      courses={courses}
      batches={batches}
    />
  );
}
