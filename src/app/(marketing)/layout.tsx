import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/marketing/announcement-bar";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { CtaBand } from "@/components/marketing/cta-band";
import { getHomeSection } from "@/server/services/homepage-service";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // Shares the single homepage read with the page below it.
  const cta = await getHomeSection("cta");

  return (
    <div className="flex min-h-dvh flex-col">
      <AnnouncementBar />
      <MarketingHeader />
      <main className="flex-1">
        {children}
        {/* One conversion band above the footer, on every public page — asked
            for by the client, and it means individual pages don't each have to
            remember to end on a call to action. Edited under
            Admin → Homepage → Closing banner, and switched off there too. */}
        {cta.enabled && <CtaBand data={cta.data} />}
      </main>
      <MarketingFooter />
    </div>
  );
}
