import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_LABELS,
  type ActivityRow,
  type ActivityAction,
  type LoginSummary,
} from "@/lib/activity";

// The vocabulary lives in `lib/activity` so the admin table can import it in
// the browser without dragging Prisma into the client bundle. Re-exported here
// because every server-side caller already reaches for this module.
export {
  ACTIVITY_ACTIONS,
  ACTIVITY_LABELS,
  type ActivityRow,
  type ActivityAction,
  type LoginSummary,
};

/**
 * Login and activity tracking — the client's "student ki login tracking,
 * activity tracking honi chahiye".
 *
 * Everything lands in the `ActivityLog` table that has existed since the Step-2
 * schema and, until now, was never written to. Writes are deliberately
 * best-effort: an audit row failing must never take down the action it was
 * describing, so every helper here swallows its own errors and logs them.
 */

export interface LogActivityInput {
  userId: string | null;
  action: ActivityAction | string;
  entityType?: string | null;
  entityId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  /** The incoming request, when one is in scope — IP and user agent come off it. */
  request?: Request | null;
}

/** Best-effort IP from the proxy headers Vercel and most reverse proxies set. */
function ipFrom(request: Request | null | undefined): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 60) || null;
  return request.headers.get("x-real-ip")?.slice(0, 60) ?? null;
}

/**
 * Record one thing a user did. Never throws — call it without awaiting when the
 * caller has nothing to do with the result.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        description: input.description ?? null,
        ip: ipFrom(input.request),
        userAgent: input.request?.headers.get("user-agent")?.slice(0, 255) ?? null,
        metadata: (input.metadata ?? undefined) as never,
      },
    });
  } catch (error) {
    logger.warn("Couldn't write an activity log row", {
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Stamp a successful sign-in: `User.lastLoginAt` for the "last seen" column,
 * plus a log row so the full history survives the next sign-in overwriting it.
 *
 * The stamp is raw SQL for the reason `auth-service.touchLogin` documents at
 * length — under `relationMode = "prisma"` a `user.update()` SELECTs from all
 * ~30 tables that reference User first, which cost ~6s against TiDB. Password
 * sign-in already stamps itself there; this is for the routes that don't.
 */
export async function recordLogin(
  userId: string,
  request?: Request | null,
): Promise<void> {
  try {
    const now = new Date();
    await prisma.$executeRaw`
      UPDATE \`User\` SET lastLoginAt = ${now}, updatedAt = ${now} WHERE id = ${userId}
    `;
  } catch (error) {
    logger.warn("Couldn't stamp lastLoginAt", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await logActivity({
    userId,
    action: ACTIVITY_ACTIONS.LOGIN,
    entityType: "User",
    entityId: userId,
    request,
  });
}

export interface ActivityQuery {
  page?: number;
  pageSize?: number;
  userId?: string;
  action?: string;
  search?: string;
  from?: string;
  to?: string;
}

function toRow(r: {
  id: string;
  action: string;
  description: string | null;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: { id: string; name: string; email: string; avatarUrl: string | null } | null;
}): ActivityRow {
  return {
    id: r.id,
    action: r.action,
    label: ACTIVITY_LABELS[r.action] ?? r.action,
    description: r.description,
    entityType: r.entityType,
    entityId: r.entityId,
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
    user: r.user,
  };
}

/** The admin activity feed, filtered and paged. */
export async function listActivity(q: ActivityQuery = {}): Promise<{
  rows: ActivityRow[];
  total: number;
}> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, q.pageSize ?? 25));

  const where: Record<string, unknown> = {};
  if (q.userId) where.userId = q.userId;
  if (q.action && q.action !== "ALL") where.action = q.action;
  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      // Inclusive of the chosen end day, not midnight at its start.
      ...(q.to ? { lt: new Date(new Date(q.to).getTime() + 86_400_000) } : {}),
    };
  }
  if (q.search?.trim()) {
    const term = q.search.trim();
    where.OR = [
      { description: { contains: term } },
      { action: { contains: term } },
      { ip: { contains: term } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { rows: rows.map(toRow), total };
}

/** One learner's recent trail — shown on their 360 profile and their own panel. */
export async function listUserActivity(
  userId: string,
  take = 50,
): Promise<ActivityRow[]> {
  const rows = await prisma.activityLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
  return rows.map(toRow);
}

/** The "is this learner actually turning up?" numbers, for the admin profile. */
export async function getLoginSummary(userId: string): Promise<LoginSummary> {
  const now = Date.now();
  const d7 = new Date(now - 7 * 86_400_000);
  const d30 = new Date(now - 30 * 86_400_000);

  const [user, logins7d, logins30d, totalLogins, recent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { lastLoginAt: true } }),
    prisma.activityLog.count({
      where: { userId, action: ACTIVITY_ACTIONS.LOGIN, createdAt: { gte: d7 } },
    }),
    prisma.activityLog.count({
      where: { userId, action: ACTIVITY_ACTIONS.LOGIN, createdAt: { gte: d30 } },
    }),
    prisma.activityLog.count({ where: { userId, action: ACTIVITY_ACTIONS.LOGIN } }),
    prisma.activityLog.findMany({
      where: { userId, createdAt: { gte: d30 } },
      select: { createdAt: true },
    }),
  ]);

  const days = new Set(recent.map((r) => r.createdAt.toISOString().slice(0, 10)));

  return {
    lastLoginAt: user?.lastLoginAt?.toISOString() ?? null,
    logins7d,
    logins30d,
    totalLogins,
    activeDays30d: days.size,
  };
}
