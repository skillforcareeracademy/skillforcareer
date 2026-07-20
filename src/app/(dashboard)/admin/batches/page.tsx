import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listBatchesAdmin,
  batchStats,
  listCoursesForBatch,
  listInstructors,
} from "@/server/services/batch-service";
import { BatchesClient } from "@/components/admin/batches/batches-client";

export const metadata: Metadata = { title: "Batches" };

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function BatchesPage({
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

  const [{ batches, total }, stats, courses, instructors] = await Promise.all([
    listBatchesAdmin(query),
    batchStats(),
    listCoursesForBatch(),
    listInstructors(),
  ]);

  return (
    <BatchesClient
      batches={batches}
      total={total}
      query={query}
      stats={stats}
      courses={courses}
      instructors={instructors}
    />
  );
}
