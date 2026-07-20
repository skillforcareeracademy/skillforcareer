"use client";

import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardHeader } from "./dashboard-header";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { AuthHydrator } from "./auth-hydrator";
import { ImpersonationBanner } from "./impersonation-banner";
import type { SessionUser } from "@/stores/auth-store";

/** Composes the full authenticated app shell around the routed page content. */
export function DashboardShell({
  user,
  impersonating = false,
  children,
}: {
  user: SessionUser;
  impersonating?: boolean;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AuthHydrator user={user} />
      <DashboardSidebar role={user.role} />
      <SidebarInset>
        {impersonating && (
          <ImpersonationBanner name={user.name} email={user.email} />
        )}
        <DashboardHeader user={user} />
        <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 md:pb-6">{children}</main>
      </SidebarInset>
      <CommandPalette role={user.role} />
      <MobileNav role={user.role} />
    </SidebarProvider>
  );
}
