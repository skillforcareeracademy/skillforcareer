import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { listLeadsAdmin, leadStats, listAssignees } from "@/server/services/lead-service";
import { LeadsClient } from "@/components/admin/leads/leads-client";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.MANAGE_LEADS);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 12,
    search: str(sp.search),
    status: str(sp.status),
    source: str(sp.source),
  };

  const [{ leads, total }, stats, assignees] = await Promise.all([
    listLeadsAdmin(query),
    leadStats(),
    listAssignees(),
  ]);

  return <LeadsClient leads={leads} total={total} query={query} stats={stats} assignees={assignees} />;
}
