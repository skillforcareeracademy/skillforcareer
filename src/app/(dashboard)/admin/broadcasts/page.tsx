import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { BroadcastsClient } from "@/components/admin/broadcasts/broadcasts-client";

export const metadata: Metadata = { title: "Broadcast" };

export default async function AdminBroadcastsPage() {
  const user = await requirePermission(PERMISSIONS.SEND_BROADCAST);
  const staff = user.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);
  return <BroadcastsClient canChooseAll={staff} />;
}
