"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Building2, Handshake, UserSearch } from "lucide-react";
import type {
  CandidateListQuery,
  CandidateRow,
  CourseOption,
  HiringPartnerRow,
  PartnerRow,
  StatusCounts,
} from "@/server/services/careers-service";
import type { CareersTab } from "@/lib/validations/careers";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CandidatesPanel } from "@/components/admin/careers/candidates-panel";
import { PlacementPartnersPanel } from "@/components/admin/careers/placement-partners-panel";
import { HiringPartnersPanel } from "@/components/admin/careers/hiring-partners-panel";

/**
 * Admin → Careers: the CVs from the careers page, the placement partners who
 * help place them, and the hiring partners (with their posts) who hire them.
 *
 * The tab lives in the URL (`?tab=`) so a reload or a shared link lands on the
 * same list; switching tabs rewrites the address in place rather than
 * navigating, because every tab's data is already on the page.
 */
export function CareersClient({
  initialTab,
  candidates,
  total,
  query,
  counts,
  courses,
  placementPartners,
  hiringPartners,
  openCandidateId,
}: {
  initialTab: CareersTab;
  candidates: CandidateRow[];
  total: number;
  query: CandidateListQuery;
  counts: StatusCounts;
  courses: CourseOption[];
  placementPartners: PartnerRow[];
  hiringPartners: HiringPartnerRow[];
  openCandidateId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<CareersTab>(initialTab);

  function switchTab(next: CareersTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "candidates") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  /** From a partner row: the candidates tab, filtered to that partner. */
  function viewCandidates(filter: "placementPartnerId" | "hiringPartnerId", id: string) {
    setTab("candidates");
    router.push(`${pathname}?${filter}=${encodeURIComponent(id)}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Careers"
        description="CVs from the careers page, and the partners who place and hire your candidates."
      />

      <Tabs value={tab} onValueChange={(v) => switchTab(v as CareersTab)}>
        <TabsList>
          <TabsTrigger value="candidates" className="px-3">
            <UserSearch className="size-4" /> Candidates
            <span className="text-muted-foreground tabular-nums">{counts.total}</span>
          </TabsTrigger>
          <TabsTrigger value="placement" className="px-3">
            <Handshake className="size-4" /> Placement partners
            <span className="text-muted-foreground tabular-nums">{placementPartners.length}</span>
          </TabsTrigger>
          <TabsTrigger value="hiring" className="px-3">
            <Building2 className="size-4" /> Hiring partners
            <span className="text-muted-foreground tabular-nums">{hiringPartners.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="pt-2">
          <CandidatesPanel
            rows={candidates}
            total={total}
            query={query}
            counts={counts}
            courses={courses}
            placementPartners={placementPartners}
            hiringPartners={hiringPartners}
            openCandidateId={openCandidateId}
          />
        </TabsContent>
        <TabsContent value="placement" className="pt-2">
          <PlacementPartnersPanel
            partners={placementPartners}
            onViewCandidates={(id) => viewCandidates("placementPartnerId", id)}
          />
        </TabsContent>
        <TabsContent value="hiring" className="pt-2">
          <HiringPartnersPanel
            partners={hiringPartners}
            onViewCandidates={(id) => viewCandidates("hiringPartnerId", id)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
