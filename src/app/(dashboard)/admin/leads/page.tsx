import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import {
  listLeadsAdmin,
  leadStats,
  listAssignees,
  listLeadCourses,
} from "@/server/services/lead-service";
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
    stage: str(sp.stage),
    subStatus: str(sp.subStatus),
    source: str(sp.source),
    classMode: str(sp.classMode),
    courseId: str(sp.courseId),
    assignedToId: str(sp.assignedToId),
    quality: str(sp.quality),
    minScore: str(sp.minScore),
    due: str(sp.due),
    from: str(sp.from),
    to: str(sp.to),
  };

  const [{ leads, total }, stats, assignees, courses] = await Promise.all([
    listLeadsAdmin(query),
    leadStats(),
    listAssignees(),
    listLeadCourses(),
  ]);

  return (
    <LeadsClient
      leads={leads}
      total={total}
      query={query}
      stats={stats}
      assignees={assignees}
      courses={courses}
    />
  );
}
