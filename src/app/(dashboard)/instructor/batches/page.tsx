import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listBatchesAdmin,
  batchStats,
  listCoursesForBatch,
} from "@/server/services/batch-service";
import { BatchesClient } from "@/components/admin/batches/batches-client";

export const metadata: Metadata = { title: "Batches" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function InstructorBatchesPage({
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
    instructorId: user.id,
  };

  const [{ batches, total }, stats, courses] = await Promise.all([
    listBatchesAdmin(query),
    batchStats(user.id),
    listCoursesForBatch(user.id),
  ]);

  return (
    <BatchesClient
      batches={batches}
      total={total}
      query={query}
      stats={stats}
      courses={courses}
      instructors={[{ id: user.id, name: user.name }]}
    />
  );
}
