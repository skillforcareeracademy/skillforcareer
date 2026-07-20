import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from "@/lib/validations/preferences";

function asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Stored notification prefs merged over defaults, so new toggles get sane values. */
export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  if (!u) throw AppError.notFound("Account not found.");
  const stored = asRecord(asRecord(u.preferences).notifications as Prisma.JsonValue);
  return { ...DEFAULT_NOTIFICATION_PREFS, ...stored } as NotificationPrefs;
}

export async function updateNotificationPrefs(
  userId: string,
  prefs: NotificationPrefs,
): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  if (!u) throw AppError.notFound("Account not found.");
  const base = asRecord(u.preferences);
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: { ...base, notifications: prefs } as Prisma.InputJsonValue },
  });
}
