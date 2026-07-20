import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { listWebinarsAdmin, webinarStats } from "@/server/services/webinar-service";
import { WebinarsClient } from "@/components/admin/webinars/webinars-client";

export const metadata: Metadata = { title: "Webinars" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function WebinarsPage({
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
    status: str(sp.status),
  };

  const [{ webinars, total }, stats] = await Promise.all([
    listWebinarsAdmin(query),
    webinarStats(),
  ]);

  return <WebinarsClient webinars={webinars} total={total} query={query} stats={stats} />;
}
