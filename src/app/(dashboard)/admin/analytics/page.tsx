import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import {
  IndianRupee,
  GraduationCap,
  UserPlus,
  Award,
  ArrowUp,
  ArrowDown,
  BookOpen,
  Star,
  Users,
  TrendingUp,
} from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  getAnalyticsKpis,
  getTrendSeries,
  getEnrollmentStatusBreakdown,
  getUsersByRole,
  getRevenueByCategory,
  getTopCourses,
  normalizeRange,
  type Kpi,
} from "@/server/services/analytics-service";
import { PageHeader } from "@/components/shared/page-header";
import {
  RangeTabs,
  RevenueTrend,
  ActivityTrend,
  BreakdownDonut,
  CategoryBar,
} from "@/components/admin/analytics/analytics-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const range = normalizeRange((await searchParams).range);

  const [kpis, trend, statusBreakdown, roleBreakdown, revenueByCategory, topCourses] =
    await Promise.all([
      getAnalyticsKpis(range),
      getTrendSeries(range),
      getEnrollmentStatusBreakdown(),
      getUsersByRole(),
      getRevenueByCategory(6),
      getTopCourses(6),
    ]);

  const maxTopEnroll = Math.max(1, ...topCourses.map((c) => c.enrollments));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Revenue, growth and engagement across the platform."
        actions={<RangeTabs current={range} />}
      />

      {/* Headline KPIs with period-over-period trend */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Revenue" kpi={kpis.revenue} icon={IndianRupee} tint="from-emerald-500 to-teal-600" money />
        <KpiCard label="Enrollments" kpi={kpis.enrollments} icon={GraduationCap} tint="from-rose-500 to-pink-600" />
        <KpiCard label="New sign-ups" kpi={kpis.signups} icon={UserPlus} tint="from-violet-500 to-purple-600" />
        <KpiCard label="Completions" kpi={kpis.completions} icon={Award} tint="from-amber-500 to-orange-600" />
      </div>

      {/* Secondary totals */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat label="Published courses" value={kpis.publishedCourses} icon={BookOpen} />
        <MiniStat label="Active learners" value={kpis.activeLearners} icon={Users} />
        <MiniStat label="Avg. rating" value={kpis.avgRating ? kpis.avgRating.toFixed(2) : "—"} icon={Star} />
        <MiniStat
          label="Period"
          value={`${range} days`}
          icon={TrendingUp}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="Revenue" description={`Daily paid revenue · last ${range} days`}>
          <RevenueTrend data={trend} />
        </ChartCard>
        <ChartCard title="Enrollment status" description="All-time distribution">
          <BreakdownDonut data={statusBreakdown} />
        </ChartCard>

        <ChartCard className="lg:col-span-2" title="Activity" description={`Enrollments & sign-ups · last ${range} days`}>
          <ActivityTrend data={trend} />
        </ChartCard>
        <ChartCard title="Users by role" description="Account distribution">
          <BreakdownDonut data={roleBreakdown} />
        </ChartCard>

        <ChartCard title="Revenue by category" description="All-time, top categories">
          <CategoryBar data={revenueByCategory} money />
        </ChartCard>

        {/* Top courses */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top courses</CardTitle>
            <CardDescription>By enrollments, with lifetime revenue</CardDescription>
          </CardHeader>
          <CardContent>
            {topCourses.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No courses yet.</p>
            ) : (
              <ol className="space-y-3">
                {topCourses.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="text-muted-foreground w-5 shrink-0 text-center text-sm font-semibold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-medium">{c.title}</p>
                        <span className="text-muted-foreground shrink-0 text-xs">{inr(c.revenue)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-pink-600"
                            style={{ width: `${Math.round((c.enrollments / maxTopEnroll) * 100)}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground w-24 shrink-0 text-right text-xs">
                          {c.enrollments} enrolled
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  kpi,
  icon: Icon,
  tint,
  money = false,
}: {
  label: string;
  kpi: Kpi;
  icon: LucideIcon;
  tint: string;
  money?: boolean;
}) {
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center justify-between">
        <span className={cn("grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm", tint)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <DeltaBadge delta={kpi.delta} />
      </div>
      <p className="mt-3 text-2xl font-bold">{money ? inr(kpi.value) : kpi.value.toLocaleString("en-IN")}</p>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-muted-foreground/70 mt-1 text-xs">
        vs {money ? inr(kpi.prev) : kpi.prev.toLocaleString("en-IN")} prev. period
      </p>
    </Card>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="text-muted-foreground text-xs font-medium">No change</span>;
  }
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        up
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
      )}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(delta)}%
    </span>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return (
    <Card className="flex-row items-center gap-3 p-4">
      <Icon className="text-muted-foreground size-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-lg leading-none font-bold">{value}</p>
        <p className="text-muted-foreground truncate text-xs">{label}</p>
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
