import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import type { BatchSort } from "@/server/services/batch-service";
import {
  listBatchesAdmin,
  batchStats,
  listCoursesForBatch,
  listInstructors,
} from "@/server/services/batch-service";
import { listAssociateOptions } from "@/server/services/batch-associate-service";
import { backfillAcademyIds } from "@/server/services/academy-ids-service";
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
    createdFrom: str(sp.createdFrom),
    createdTo: str(sp.createdTo),
    timeFrom: str(sp.timeFrom),
    timeTo: str(sp.timeTo),
    sort: (str(sp.sort) ?? "sequence") as BatchSort,
  };

  // Anything made before the academy's numbering existed gets its identifier
  // here, so the ids on screen are always the ids in the database.
  await backfillAcademyIds();

  const [{ batches, total }, stats, courses, instructors, associateOptions] = await Promise.all([
    listBatchesAdmin(query),
    batchStats(),
    listCoursesForBatch(),
    listInstructors(),
    listAssociateOptions(),
  ]);

  return (
    <BatchesClient
      batches={batches}
      total={total}
      query={query}
      stats={stats}
      courses={courses}
      instructors={instructors}
      associateOptions={associateOptions}
    />
  );
}
