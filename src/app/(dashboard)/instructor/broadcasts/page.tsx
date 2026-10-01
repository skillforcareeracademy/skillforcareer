import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { BroadcastsClient } from "@/components/admin/broadcasts/broadcasts-client";

export const metadata: Metadata = { title: "Broadcast" };

/**
 * The same composer the admin panel shows. What an instructor may reach is
 * decided by the service, not by this page — see `broadcast-service.ts`.
 */
export default async function InstructorBroadcastsPage() {
  const user = await requirePermission(PERMISSIONS.SEND_BROADCAST);
  const staff = user.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);
  return <BroadcastsClient canChooseAll={staff} />;
}
