import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import {
  listOfflineClasses,
  listCoursesForSelect,
  listBatchesForSelect,
} from "@/server/services/live-service";
import { OfflineClient } from "@/components/admin/offline/offline-client";

export const metadata: Metadata = { title: "Offline classes" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function OfflinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.HOST_LIVE_CLASS);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 12,
    search: str(sp.search),
  };

  const [{ classes, total }, courses, batches] = await Promise.all([
    listOfflineClasses(query),
    listCoursesForSelect(),
    listBatchesForSelect(),
  ]);

  return <OfflineClient classes={classes} total={total} query={query} courses={courses} batches={batches} />;
}
