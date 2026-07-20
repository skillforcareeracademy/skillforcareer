import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, PlayCircle, Award, CalendarClock, ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getLearningStats, getMyLearning } from "@/server/services/enrollment-service";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/shared/button-link";

export const metadata: Metadata = { title: "My learning" };
export const dynamic = "force-dynamic";

export default async function StudentHome() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const [stats, courses] = await Promise.all([
    getLearningStats(user.id),
    getMyLearning(user.id),
  ]);
  const recent = courses.filter((c) => c.progressPercent < 100).slice(0, 4);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hi ${user.name.split(" ")[0]}, ready to learn?`}
        description="Continue where you left off and track your progress."
        actions={<ButtonLink href="/courses">Browse courses</ButtonLink>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Enrolled courses" value={String(stats.enrolled)} icon={GraduationCap} tint="from-rose-500 to-pink-600" />
        <StatCard label="In progress" value={String(stats.inProgress)} icon={PlayCircle} tint="from-violet-500 to-purple-600" />
        <StatCard label="Certificates" value={String(stats.certificates)} icon={Award} tint="from-amber-500 to-orange-600" />
        <StatCard label="Completed" value={String(stats.completed)} icon={CalendarClock} tint="from-sky-500 to-blue-600" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Continue learning</CardTitle>
          <ButtonLink href="/student/learning" variant="ghost" size="sm">
            View all <ArrowRight className="size-4" />
          </ButtonLink>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {stats.enrolled === 0
                ? "You haven't enrolled in any courses yet. "
                : "You're all caught up! "}
              <Link href="/courses" className="text-primary hover:underline">
                Browse courses
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.map((c) => (
                <Link
                  key={c.enrollmentId}
                  href={`/student/learn/${c.slug}`}
                  className="hover:bg-accent flex items-center gap-3 rounded-xl border p-3 transition-colors"
                >
                  <div className="ring-border relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-rose-500/15 to-pink-600/15 ring-1">
                    {c.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnailUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center">
                        <PlayCircle className="size-5 text-rose-500/60" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                      <div className="bg-primary h-full rounded-full" style={{ width: `${c.progressPercent}%` }} />
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">{c.progressPercent}% complete</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
