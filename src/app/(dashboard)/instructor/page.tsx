import type { Metadata } from "next";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  BookOpen,
  Users,
  ClipboardCheck,
  Video,
  CalendarClock,
  Radio,
  ArrowRight,
  PencilRuler,
} from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  getInstructorStats,
  getInstructorUpcomingClasses,
  getSubmissionsToGrade,
  getInstructorTopCourses,
} from "@/server/services/instructor-service";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ButtonLink } from "@/components/shared/button-link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Instructor dashboard" };
export const dynamic = "force-dynamic";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function InstructorHome() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  const [stats, classes, grading, courses] = await Promise.all([
    getInstructorStats(user.id),
    getInstructorUpcomingClasses(user.id, 5),
    getSubmissionsToGrade(user.id, 6),
    getInstructorTopCourses(user.id, 5),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Your courses, students and upcoming classes."
        actions={<ButtonLink href="/instructor/courses">Manage courses</ButtonLink>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My courses" value={stats.courses} icon={BookOpen} tint="from-rose-500 to-pink-600" />
        <StatCard label="Students" value={stats.students} icon={Users} tint="from-violet-500 to-purple-600" />
        <StatCard label="To grade" value={stats.pendingGrading} icon={ClipboardCheck} tint="from-amber-500 to-orange-600" />
        <StatCard label="Live classes" value={stats.liveClasses} icon={Video} tint="from-sky-500 to-blue-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming classes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="text-muted-foreground size-4" /> Upcoming classes
            </CardTitle>
            <CardDescription>Live sessions you&apos;re hosting</CardDescription>
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">No classes scheduled.</p>
            ) : (
              <ul className="space-y-3">
                {classes.map((c) => {
                  const isLive = c.status === "LIVE";
                  return (
                    <li key={c.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{c.title}</p>
                          {isLive && (
                            <Badge className="gap-1 bg-rose-600 text-[10px] text-white">
                              <Radio className="size-2.5" /> LIVE
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground truncate text-xs">
                          {c.courseTitle ? `${c.courseTitle} · ` : ""}
                          {format(new Date(c.scheduledStart), "EEE, d MMM · h:mm a")}
                        </p>
                      </div>
                      <ButtonLink href={`/live/room/${c.roomCode}`} size="sm" variant={isLive ? "default" : "outline"}>
                        {isLive ? "Join" : "Start"}
                      </ButtonLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Awaiting grading */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="text-muted-foreground size-4" /> Awaiting grading
            </CardTitle>
            <CardDescription>Submissions in your courses</CardDescription>
          </CardHeader>
          <CardContent>
            {grading.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Nothing to grade — you&apos;re all caught up. 🎉</p>
            ) : (
              <ul className="space-y-3">
                {grading.map((g) => (
                  <li key={g.id} className="flex items-center gap-3">
                    <Avatar className="size-8 shrink-0">
                      {g.studentAvatar && <AvatarImage src={g.studentAvatar} alt={g.studentName} />}
                      <AvatarFallback className="text-[10px]">{initials(g.studentName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{g.studentName}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {g.assignmentTitle}
                        {g.courseTitle ? ` · ${g.courseTitle}` : ""}
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {g.status === "LATE" ? (
                        <Badge variant="secondary" className="bg-amber-100 text-[10px] text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          Late
                        </Badge>
                      ) : g.submittedAt ? (
                        formatDistanceToNow(new Date(g.submittedAt), { addSuffix: true })
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Your courses */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle>Your courses</CardTitle>
            <CardDescription>Author content and manage curriculum</CardDescription>
          </div>
          <ButtonLink href="/instructor/courses" variant="outline" size="sm">
            View all <ArrowRight className="size-4" />
          </ButtonLink>
        </CardHeader>
        <CardContent>
          {courses.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-muted-foreground text-sm">You haven&apos;t created any courses yet.</p>
              <ButtonLink href="/instructor/courses" size="sm" className="mt-3">
                <PencilRuler className="size-4" /> Create your first course
              </ButtonLink>
            </div>
          ) : (
            <ul className="divide-y">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/instructor/courses/${c.id}`}
                    className="hover:bg-accent/50 -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                        <BookOpen className="text-muted-foreground size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.title}</p>
                        <p className="text-muted-foreground text-xs">{c.enrollments} enrolled</p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={
                        c.status === "PUBLISHED"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : ""
                      }
                    >
                      {c.status.charAt(0) + c.status.slice(1).toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
