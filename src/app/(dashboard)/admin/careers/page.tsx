import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import {
  candidateStatusCounts,
  listCandidateCourses,
  listCandidates,
  listHiringPartners,
  listPlacementPartners,
} from "@/server/services/careers-service";
import { CAREERS_TABS, type CareersTab } from "@/lib/validations/careers";
import { CareersClient } from "@/components/admin/careers/careers-client";

export const metadata: Metadata = { title: "Careers" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

/**
 * CVs, placement partners and hiring partners. Every tab's data is loaded up
 * front: the partner lists are small and the candidates tab needs them anyway
 * for its filters, its partner columns and the candidate sheet's pickers.
 */
export default async function CareersAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const sp = await searchParams;

  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 15,
    search: str(sp.search),
    status: str(sp.status),
    level: str(sp.level),
    courseId: str(sp.courseId),
    mode: str(sp.mode),
    location: str(sp.location),
    placementPartnerId: str(sp.placementPartnerId),
    hiringPartnerId: str(sp.hiringPartnerId),
  };
  const tab = str(sp.tab);
  const initialTab: CareersTab = (CAREERS_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as CareersTab)
    : "candidates";

  const [{ rows, total }, counts, placementPartners, hiringPartners, courses] =
    await Promise.all([
      listCandidates(query),
      candidateStatusCounts(query),
      listPlacementPartners(),
      listHiringPartners(),
      listCandidateCourses(),
    ]);

  return (
    <CareersClient
      initialTab={initialTab}
      candidates={rows}
      total={total}
      query={query}
      counts={counts}
      courses={courses}
      placementPartners={placementPartners}
      hiringPartners={hiringPartners}
      openCandidateId={str(sp.candidate)}
    />
  );
}
