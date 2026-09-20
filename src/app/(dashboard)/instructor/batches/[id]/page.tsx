import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { AppError } from "@/lib/api/errors";
import { isStaffRole } from "@/lib/auth/api-guard";
import { getBatchProfile } from "@/server/services/batch-profile-service";
import { batchRoleFor } from "@/server/services/batch-associate-service";
import { BatchProfileView } from "@/components/admin/batches/profile/batch-profile-view";

export const metadata: Metadata = { title: "Batch profile" };
export const dynamic = "force-dynamic";

/**
 * The batch profile for the people teaching it. The lead instructor runs the
 * roster; associates see everything and can share notes and quizzes.
 */
export default async function InstructorBatchProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole([
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.INSTRUCTOR,
  ]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  const staff = isStaffRole(user.role);
  const role = staff ? null : await batchRoleFor(id, user.id);
  // Someone else's batch looks the same as no batch at all.
  if (!staff && !role) notFound();

  let profile;
  try {
    profile = await getBatchProfile(id, { id: user.id, isStaff: staff });
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
        canManageRoster: canManage && (staff || role === "lead"),
        canTeach: canManage,
        isStaff: staff,
        basePath: "/instructor",
      }}
    />
  );
}
