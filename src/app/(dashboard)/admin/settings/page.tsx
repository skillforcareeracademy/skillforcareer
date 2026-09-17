import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { getSettings } from "@/server/services/settings-service";
import { SettingsClient } from "@/components/dashboard/settings-client";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requirePermission(PERMISSIONS.MANAGE_SETTINGS);
  const data = await getSettings();
  return (
    <SettingsClient
      data={data}
      // Whether the secret exists, never its value.
      codingPracticeServer={{
        url: env.CODING_PRACTICE_URL || "",
        secretSet: Boolean(env.CODING_PRACTICE_SSO_SECRET),
      }}
    />
  );
}
