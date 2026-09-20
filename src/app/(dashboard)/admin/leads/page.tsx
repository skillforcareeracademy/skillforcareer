import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { leadViewFrom } from "@/lib/validations/lead";
import {
  listLeadsAdmin,
  leadStats,
  listAssignees,
  listLeadCourses,
} from "@/server/services/lead-service";
import { getLeadCards } from "@/server/services/lead-preferences-service";
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
  const user = await requirePermission(PERMISSIONS.MANAGE_LEADS);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 12,
    ...leadViewFrom((key) => str(sp[key])),
  };

  const [{ leads, total }, stats, assignees, courses, cards] =
    await Promise.all([
      listLeadsAdmin({ ...query, viewerId: user.id }),
      leadStats(user.id),
      listAssignees(),
      listLeadCourses(),
      getLeadCards(user.id),
    ]);

  return (
    <LeadsClient
      leads={leads}
      total={total}
      query={query}
      stats={stats}
      cards={cards}
      viewer={{ id: user.id, name: user.name, role: user.role }}
      assignees={assignees}
      courses={courses}
    />
  );
}
