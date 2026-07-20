import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;

export interface AdminStats {
  users: number;
  courses: number;
  batches: number;
  enrollments: number;
  revenue: number;
  liveClasses: number;
}

/** Headline metrics for the admin dashboard. */
export async function getAdminStats(): Promise<AdminStats> {
  const [users, courses, batches, enrollments, revenueAgg, liveClasses] =
    await Promise.all([
      prisma.user.count(),
      prisma.course.count(),
      prisma.batch.count(),
      prisma.enrollment.count(),
      prisma.payment.aggregate({
        _sum: { netAmount: true },
        where: { status: "PAID" },
      }),
      prisma.meeting.count({ where: { status: { in: ["SCHEDULED", "LIVE"] } } }),
    ]);

  return {
    users,
    courses,
    batches,
    enrollments,
    revenue: revenueAgg._sum.netAmount?.toNumber() ?? 0,
    liveClasses,
  };
}

export interface RevenuePoint {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Mon"
  revenue: number;
  enrollments: number;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Revenue + enrollment totals per day for the last `days` days. */
export async function getRevenueSeries(days = 14): Promise<RevenuePoint[]> {
  // UTC midnight so buckets match dayKey() (UTC via toISOString) on any TZ.
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setTime(start.getTime() - (days - 1) * DAY_MS);

  const [payments, enrollments] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "PAID", paidAt: { gte: start } },
      select: { netAmount: true, paidAt: true },
    }),
    prisma.enrollment.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    }),
  ]);

  const revenueBy = new Map<string, number>();
  const enrollBy = new Map<string, number>();
  for (const p of payments) {
    if (!p.paidAt) continue;
    const k = dayKey(p.paidAt);
    revenueBy.set(k, (revenueBy.get(k) ?? 0) + p.netAmount.toNumber());
  }
  for (const e of enrollments) {
    const k = dayKey(e.createdAt);
    enrollBy.set(k, (enrollBy.get(k) ?? 0) + 1);
  }

  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY_MS);
    const k = dayKey(d);
    return {
      date: k,
      label: fmt.format(d),
      revenue: revenueBy.get(k) ?? 0,
      enrollments: enrollBy.get(k) ?? 0,
    };
  });
}

export interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  at: string; // ISO
  kind: "user" | "payment" | "enrollment";
}

/** A lightweight recent-activity feed assembled from recent domain records. */
export async function getRecentActivity(limit = 8): Promise<ActivityItem[]> {
  const [users, payments, enrollments] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, name: true, email: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: limit,
      select: { id: true, netAmount: true, paidAt: true, user: { select: { name: true } } },
    }),
    prisma.enrollment.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        user: { select: { name: true } },
        course: { select: { title: true } },
      },
    }),
  ]);

  const items: ActivityItem[] = [
    ...users.map((u) => ({
      id: `u_${u.id}`,
      title: `${u.name} joined`,
      subtitle: u.email,
      at: u.createdAt.toISOString(),
      kind: "user" as const,
    })),
    ...payments.map((p) => ({
      id: `p_${p.id}`,
      title: `Payment received`,
      subtitle: `${p.user.name} · ₹${p.netAmount.toNumber().toLocaleString("en-IN")}`,
      at: (p.paidAt ?? new Date()).toISOString(),
      kind: "payment" as const,
    })),
    ...enrollments.map((e) => ({
      id: `e_${e.id}`,
      title: `New enrollment`,
      subtitle: `${e.user.name} · ${e.course.title}`,
      at: e.createdAt.toISOString(),
      kind: "enrollment" as const,
    })),
  ];

  return items
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);
}
