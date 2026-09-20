import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { AppError } from "@/lib/api/errors";
import { getBatchProfile } from "@/server/services/batch-profile-service";
import { BatchProfileView } from "@/components/admin/batches/profile/batch-profile-view";

export const metadata: Metadata = { title: "Batch profile" };
export const dynamic = "force-dynamic";

/**
 * One cohort on one screen: attendance, performance, classes, notes, the
 * quizzes set for it and its sister batches.
 */
export default async function AdminBatchProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  let profile;
  try {
    profile = await getBatchProfile(id, { id: user.id, isStaff: true });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  const canManage = user.permissions.includes(PERMISSIONS.MANAGE_BATCHES);
  return (
    <BatchProfileView
      profile={profile}
      initialTab={typeof sp.tab === "string" ? sp.tab : undefined}
      access={{
        canManageRoster: canManage,
        canTeach: canManage,
        isStaff: true,
        basePath: "/admin",
      }}
    />
  );
}
