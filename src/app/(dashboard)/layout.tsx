import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/require";
import { readImpersonator } from "@/lib/auth/impersonation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getSettings } from "@/server/services/settings-service";
import { showsCodingPractice } from "@/server/services/coding-practice-service";

/**
 * Authenticated app shell. Guards every dashboard route (redirects to /login if
 * unauthenticated) and renders the collapsible sidebar, top bar, command
 * palette and mobile nav around the routed page.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [user, impersonator, { settings }] = await Promise.all([
    requireUser(),
    readImpersonator(),
    getSettings(),
  ]);
  // Free unless it's switched on for an enrolled-only audience and this is a
  // learner — then it's one small lookup.
  const codingPractice = await showsCodingPractice(user, settings);
  return (
    <DashboardShell
      user={user}
      impersonating={Boolean(impersonator)}
      tourEnabled={settings.tourEnabled}
      voiceGuideEnabled={settings.voiceGuideEnabled}
      assistantEnabled={settings.chatbotEnabled}
      codingPractice={codingPractice}
    >
      {children}
    </DashboardShell>
  );
}
