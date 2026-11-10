import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { ROLE_HOME } from "@/config/roles";
import { leadScopeOf } from "@/lib/auth/scopes";
import { leadViewFrom } from "@/lib/validations/lead";
import {
  listLeadsAdmin,
  leadStats,
  listAssignees,
  listLeadCourses,
  listLeadSourceNames,
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
  const user = await requireUser();
  const scope = leadScopeOf(user.permissions);
  if (!scope.canView) redirect(ROLE_HOME[user.role] ?? "/login");
  // A sales agent sees only the leads assigned to them; an admin sees all.
  const ownOnly = !scope.all;
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 12,
    ...leadViewFrom((key) => str(sp[key])),
  };

  const [{ leads, total }, stats, assignees, courses, cards, sourceNames] =
    await Promise.all([
      listLeadsAdmin({ ...query, viewerId: user.id, ownOnly }),
      leadStats(user.id, ownOnly),
      listAssignees(),
      listLeadCourses(),
      getLeadCards(user.id),
      listLeadSourceNames(),
    ]);

  return (
    <LeadsClient
      leads={leads}
      total={total}
      query={query}
      stats={stats}
      cards={cards}
      viewer={{ id: user.id, name: user.name, role: user.role }}
      canManage={scope.all}
      canEdit={scope.canEdit}
      assignees={assignees}
      courses={courses}
      sourceNames={sourceNames}
    />
  );
}
