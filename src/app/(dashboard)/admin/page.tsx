import type { Metadata } from "next";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminHome() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const [stats, series, activity] = await Promise.all([
    getAdminStats(),
    getRevenueSeries(14),
    getRecentActivity(8),
  ]);
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description="Platform overview across users, courses and revenue."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total users" value={stats.users} icon={Users} tint="from-rose-500 to-pink-600" />
        <StatCard label="Courses" value={stats.courses} icon={BookOpen} tint="from-violet-500 to-purple-600" />
        <StatCard label="Batches" value={stats.batches} icon={Layers} tint="from-sky-500 to-blue-600" />
        <StatCard label="Enrollments" value={stats.enrollments} icon={GraduationCap} tint="from-fuchsia-500 to-pink-600" />
        <StatCard label="Revenue" value={inr(stats.revenue)} icon={IndianRupee} tint="from-emerald-500 to-teal-600" />
        <StatCard label="Live classes" value={stats.liveClasses} icon={Radio} tint="from-amber-500 to-orange-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="pr-4 pl-0">
            <RevenueChart data={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest across the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentActivity items={activity} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
