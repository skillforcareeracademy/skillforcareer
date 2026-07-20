import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ROLES } from "@/config/roles";

/**
 * In-app notifications — the bell in the dashboard header.
 *
 * Anything worth telling a user about lands here via `notify`. Delivery is
 * deliberately best-effort: a notification failing must never take down the
 * action that triggered it (a payment must still record even if the alert
 * about it doesn't), so `notify` swallows and logs rather than throwing.
 */

export type NotificationType =
  | "SYSTEM"
  | "COURSE"
  | "PAYMENT"
  | "LIVE_CLASS"
  | "ASSIGNMENT"
  | "QUIZ"
  | "CERTIFICATE"
  | "ANNOUNCEMENT"
  | "DISCUSSION";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread: number;
}

/** How many the bell shows. The full history isn't paged — this is a peek. */
const FEED_LIMIT = 15;

export async function getNotificationFeed(
  userId: string,
): Promise<NotificationFeed> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, channel: "IN_APP" },
      orderBy: { createdAt: "desc" },
      take: FEED_LIMIT,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        actionUrl: true,
        isRead: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId, channel: "IN_APP", isRead: false },
    }),
  ]);

  return {
    unread,
    items: rows.map((n) => ({
      id: n.id,
      type: n.type as NotificationType,
      title: n.title,
      message: n.message,
      actionUrl: n.actionUrl,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

/** Scoped by userId so one user can't mark another's notification read. */
export async function markRead(userId: string, id: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<number> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return count;
}

export interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
}

/**
 * Fan a notification out to a set of users. Never throws — see the note above.
 * Returns how many were written, mostly so callers can log it.
 */
export async function notify(input: NotifyInput): Promise<number> {
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (userIds.length === 0) return 0;

  try {
    const { count } = await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.type,
        channel: "IN_APP" as const,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl ?? null,
      })),
    });
    return count;
  } catch (error) {
    logger.error("notification.deliver_failed", { error, type: input.type });
    return 0;
  }
}

/** Ids of the platform staff — who to tell about leads, payments, and the like. */
export async function staffUserIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      role: { slug: { in: [ROLES.SUPER_ADMIN, ROLES.ADMIN] } },
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Convenience wrapper: tell every admin / super admin about something. */
export async function notifyStaff(
  input: Omit<NotifyInput, "userIds">,
): Promise<number> {
  return notify({ ...input, userIds: await staffUserIds() });
}
