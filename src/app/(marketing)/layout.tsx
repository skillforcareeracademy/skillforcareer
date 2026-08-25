import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/marketing/announcement-bar";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { CtaBand } from "@/components/marketing/cta-band";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AnnouncementBar />
      <MarketingHeader />
      <main className="flex-1">
        {children}
        {/* One conversion band above the footer, on every public page — asked
            for by the client, and it means individual pages don't each have to
            remember to end on a call to action. */}
        <CtaBand />
      </main>
      <MarketingFooter />
    </div>
  );
}
