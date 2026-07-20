import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/require";
import { readImpersonator } from "@/lib/auth/impersonation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

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
  const [user, impersonator] = await Promise.all([
    requireUser(),
    readImpersonator(),
  ]);
  return (
    <DashboardShell user={user} impersonating={Boolean(impersonator)}>
      {children}
    </DashboardShell>
  );
}
