import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { getSettings } from "@/server/services/settings-service";
import { SettingsClient } from "@/components/dashboard/settings-client";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requirePermission(PERMISSIONS.MANAGE_SETTINGS);
  const data = await getSettings();
  return <SettingsClient data={data} />;
}
