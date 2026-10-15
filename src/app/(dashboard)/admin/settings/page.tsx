import type { Metadata } from "next";
import { DatabaseBackup, FolderArchive } from "lucide-react";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { getSettings } from "@/server/services/settings-service";
import { SettingsClient } from "@/components/dashboard/settings-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requirePermission(PERMISSIONS.MANAGE_SETTINGS);
  const data = await getSettings();
  return (
    <div className="space-y-6">
      <SettingsClient
        data={data}
        // Whether the secret exists, never its value.
        codingPracticeServer={{
          url: env.CODING_PRACTICE_URL || "",
          secretSet: Boolean(env.CODING_PRACTICE_SSO_SECRET),
        }}
      />

      {/* "An option to backup complete database or everything on LMS." */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup className="size-4" /> Full backup
          </CardTitle>
          <CardDescription>
            Download everything on the platform as one ZIP — every table as
            JSON, and every uploaded file. A large library can take a little
            while to gather; the download begins once it is ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button nativeButton={false} render={<a href="/api/admin/backup" download />}>
            <FolderArchive className="size-4" /> Download full backup
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
