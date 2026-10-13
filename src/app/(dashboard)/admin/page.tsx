import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Users,
  BookOpen,
  Layers,
  IndianRupee,
  Radio,
  GraduationCap,
} from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  getAdminStats,
  getRevenueSeries,
  getRecentActivity,
} from "@/server/services/admin-service";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { RecentActivity } from "@/components/admin/recent-activity";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin dashboard" };

/**
 * The dashboard paints as soon as it knows who you are. Each panel of numbers
 * is its own query, and each streams in under its own skeleton rather than the
 * whole page waiting behind one spinner for the slowest of the three — on a
 * cold start that wait was several seconds of a blank screen, which read as
 * "stuck loading". Now the shell is there at once and the figures arrive into
 * it.
 */
export default async function AdminHome() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description="Platform overview across users, courses and revenue."
      />

      <Suspense fallback={<StatsSkeleton />}>
        <StatsCards />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="pr-4 pl-0">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <RevenueSection />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest across the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ActivitySkeleton />}>
              <ActivitySection />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** The six headline figures, each a link to the list it counts. */
async function StatsCards() {
  const stats = await getAdminStats();
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="Total users" value={stats.users} icon={Users} tint="from-rose-500 to-pink-600" href="/admin/users" />
      <StatCard label="Courses" value={stats.courses} icon={BookOpen} tint="from-violet-500 to-purple-600" href="/admin/courses" />
      <StatCard label="Batches" value={stats.batches} icon={Layers} tint="from-sky-500 to-blue-600" href="/admin/batches" />
      <StatCard label="Enrollments" value={stats.enrollments} icon={GraduationCap} tint="from-fuchsia-500 to-pink-600" href="/admin/users?role=STUDENT" />
      <StatCard label="Revenue" value={inr(stats.revenue)} icon={IndianRupee} tint="from-emerald-500 to-teal-600" href="/admin/payments?status=PAID" />
      <StatCard label="Live classes" value={stats.liveClasses} icon={Radio} tint="from-amber-500 to-orange-600" href="/admin/live" />
    </div>
  );
}

async function RevenueSection() {
  const series = await getRevenueSeries(14);
  return <RevenueChart data={series} />;
}

async function ActivitySection() {
  const activity = await getRecentActivity(8);
  return <RecentActivity items={activity} />;
}

/** Six card-shaped placeholders, matching the real grid so nothing jumps. */
function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="bg-card ring-foreground/10 flex flex-row items-center gap-4 rounded-xl p-5 ring-1"
        >
          <Skeleton className="size-11 shrink-0 rounded-xl" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
