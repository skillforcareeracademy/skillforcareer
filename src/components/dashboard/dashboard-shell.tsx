"use client";

import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardHeader } from "./dashboard-header";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { AuthHydrator } from "./auth-hydrator";
import { ImpersonationBanner } from "./impersonation-banner";
import { PanelTour } from "./panel-tour";
import { AmiWidget } from "@/components/chatbot/ami-widget";
import type { SessionUser } from "@/stores/auth-store";
import type { NavFeature } from "@/config/navigation";

/** Composes the full authenticated app shell around the routed page content. */
export function DashboardShell({
  user,
  impersonating = false,
  tourEnabled = true,
  voiceGuideEnabled = true,
  assistantEnabled = true,
  codingPractice = false,
  children,
}: {
  user: SessionUser;
  impersonating?: boolean;
  /** The walkthrough that runs on a first visit — switchable in Settings. */
  tourEnabled?: boolean;
  voiceGuideEnabled?: boolean;
  assistantEnabled?: boolean;
  /** Show the Coding Practice link — on, and this person is in its audience. */
  codingPractice?: boolean;
  children: ReactNode;
}) {
  const navFeatures: NavFeature[] = codingPractice ? ["codingPractice"] : [];
  return (
    <SidebarProvider>
      <AuthHydrator user={user} />
      <DashboardSidebar role={user.role} features={navFeatures} />
      <SidebarInset>
        {impersonating && (
          <ImpersonationBanner name={user.name} email={user.email} />
        )}
        <DashboardHeader user={user} />
        <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 md:pb-6">{children}</main>
      </SidebarInset>
      <CommandPalette role={user.role} features={navFeatures} />
      <MobileNav role={user.role} />
      {/* The guided walkthrough — "jaise hi panel khule tour guide and also
          voice guide honi chahiye". It decides for itself whether this is a
          first visit. */}
      {tourEnabled && (
        <PanelTour role={user.role} voiceEnabled={voiceGuideEnabled} />
      )}
      {/* Ami rides along inside the panels too, not only on the public site. */}
      {assistantEnabled && <AmiWidget />}
    </SidebarProvider>
  );
}
