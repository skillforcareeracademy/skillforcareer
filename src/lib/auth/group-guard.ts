import type { GroupKind } from "@/generated/prisma/client";
import { PERMISSIONS, type Permission } from "@/config/roles";
import { requireApiPermission, requireApiStaff } from "@/lib/auth/api-guard";

/**
 * Who may rearrange each library's filing.
 *
 * A group is part of the module it files, so the permission that governs the
 * module governs its folders. Discussions have no permission of their own —
 * staff moderate them — so they fall through to the staff check.
 */
const PERMISSION_FOR: Partial<Record<GroupKind, Permission>> = {
  QUIZ: PERMISSIONS.MANAGE_QUIZ,
  MATERIAL: PERMISSIONS.MANAGE_MATERIAL,
  CURRICULUM: PERMISSIONS.MANAGE_CURRICULUM,
  ASSIGNMENT: PERMISSIONS.GRADE_ASSIGNMENT,
  BATCH: PERMISSIONS.MANAGE_BATCHES,
  CERTIFICATE: PERMISSIONS.ISSUE_CERTIFICATE,
};

export async function requireGroupWrite(kind: GroupKind) {
  const permission = PERMISSION_FOR[kind];
  return permission ? requireApiPermission(permission) : requireApiStaff();
}
