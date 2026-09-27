import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/marketing/announcement-bar";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { CtaBand } from "@/components/marketing/cta-band";
import { CtaBandSlot } from "@/components/marketing/cta-band-slot";
import { getHomeSection } from "@/server/services/homepage-service";
import { getSettings } from "@/server/services/settings-service";
import { AmiWidget } from "@/components/chatbot/ami-widget";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { getSessionUser } from "@/lib/auth/api-guard";
import { ROLE_HOME } from "@/config/roles";
import { whatsappLink } from "@/lib/whatsapp";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // Shares the single homepage read with the page below it.
  const [cta, { settings }, user] = await Promise.all([
    getHomeSection("cta"),
    getSettings(),
    getSessionUser(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <AnnouncementBar />
      <MarketingHeader />
      <main className="flex-1">
        {children}
        {/* One conversion band above the footer, on every public page — asked
            for by the client, and it means individual pages don't each have to
            remember to end on a call to action. Edited under
            Admin → Homepage → Closing banner, and switched off there too.
            `CtaBandSlot` drops it on the handful of pages that close on a
            banner of their own, so the two never stack. */}
        {cta.enabled && (
          <CtaBandSlot>
            <CtaBand data={cta.data} />
          </CtaBandSlot>
        )}
      </main>
      <MarketingFooter />
      {/* Phone-only: the header has room for one button, so Home, Courses,
          WhatsApp and signing in live down here. */}
      <MobileBottomNav
        signedIn={Boolean(user)}
        whatsappUrl={whatsappLink(settings.whatsappNumber || settings.contactPhone)}
        dashboardHref={user ? (ROLE_HOME[user.role] ?? "/student") : "/student"}
      />
      {/* "Website pr Ami name se chatbot bhi hona chahiye" — trained from
          Admin → Assistant, and switchable there too. */}
      {settings.chatbotEnabled && <AmiWidget />}
    </div>
  );
}
