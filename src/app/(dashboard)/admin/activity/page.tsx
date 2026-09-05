import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listActivity } from "@/server/services/activity-service";
import { ActivityClient } from "@/components/admin/activity/activity-client";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 25,
    search: str(sp.search),
    action: str(sp.action),
    userId: str(sp.user),
  };

  const { rows, total } = await listActivity(query);
  return <ActivityClient rows={rows} total={total} query={query} />;
}
