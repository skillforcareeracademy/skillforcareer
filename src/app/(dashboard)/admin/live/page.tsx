import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listMeetingsAdmin,
  meetingStats,
  listHosts,
  listCoursesForSelect,
  listBatchesForSelect,
} from "@/server/services/live-service";
import { LiveClient } from "@/components/admin/live/live-client";

export const metadata: Metadata = { title: "Live Classes" };

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 10,
    search: str(sp.search),
    status: str(sp.status),
    courseId: str(sp.course),
  };

  const [{ meetings, total }, stats, hosts, courses, batches] = await Promise.all([
    listMeetingsAdmin(query),
    meetingStats(),
    listHosts(),
    listCoursesForSelect(),
    listBatchesForSelect(),
  ]);

  return (
    <LiveClient
      meetings={meetings}
      total={total}
      query={query}
      stats={stats}
      hosts={hosts}
      courses={courses}
      batches={batches}
    />
  );
}
