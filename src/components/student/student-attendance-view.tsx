"use client";

import { format } from "date-fns";
import {
  CalendarCheck,
  CalendarClock,
  CircleHelp,
  Clock,
  Percent,
  UserCheck,
  UserX,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type {
  AttendanceEntry,
  StudentAttendanceReport,
} from "@/server/services/student-attendance-service";

const STATUS: Record<
  AttendanceEntry["status"],
  { label: string; className: string }
> = {
  PRESENT: {
    label: "Present",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  LATE: {
    label: "Late",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  LEFT_EARLY: {
    label: "Left early",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  ABSENT: {
    label: "Absent",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  UNMARKED: { label: "Not marked", className: "bg-muted text-muted-foreground" },
  UPCOMING: {
    label: "Scheduled",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
};

/** The learner's own register — every class their cohort was scheduled for. */
export function StudentAttendanceView({ report }: { report: StudentAttendanceReport }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Every class your batch was scheduled for, and whether you were there."
      />

      {report.entries.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No classes yet"
          description="Once your batch has live or offline sessions scheduled, your register appears here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Attendance"
              value={report.percent != null ? `${report.percent}%` : "—"}
              icon={Percent}
              tint="from-emerald-500 to-teal-600"
              hint={
                report.percent != null
                  ? `${report.present} of ${report.present + report.absent} marked classes`
                  : "No register taken yet"
              }
            />
            <StatCard label="Attended" value={report.present} icon={UserCheck} />
            <StatCard
              label="Missed"
              value={report.absent}
              icon={UserX}
              tint="from-rose-500 to-red-600"
            />
            <StatCard
              label="Coming up"
              value={report.upcoming}
              icon={CalendarClock}
              tint="from-sky-500 to-indigo-600"
              hint={report.unmarked > 0 ? `${report.unmarked} not yet marked` : undefined}
            />
          </div>

          {report.percent != null && (
            <Card>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Your attendance</span>
                  <span className="text-muted-foreground">{report.percent}%</span>
                </div>
                <Progress value={report.percent} />
                <p className="text-muted-foreground text-xs">
                  Measured against classes where the register was actually taken —
                  a session nobody marked doesn&apos;t count against you.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-medium">Class register</h2>
            {report.entries.map((e) => {
              const tone = STATUS[e.status];
              return (
                <Card key={`${e.id}-${e.meetingId ?? ""}`}>
                  <CardContent className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[e.courseTitle, e.batchName].filter(Boolean).join(" · ") ||
                          "Class"}
                      </p>
                    </div>
                    <div className="text-muted-foreground flex shrink-0 items-center gap-3 text-xs">
                      <span className="flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" />
                        {format(new Date(e.scheduledAt), "d MMM yyyy, h:mm a")}
                      </span>
                      {e.durationSeconds > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3.5" />
                          {Math.round(e.durationSeconds / 60)} min
                        </span>
                      )}
                    </div>
                    <Badge variant="secondary" className={tone.className}>
                      {e.status === "UNMARKED" && (
                        <CircleHelp className="mr-1 size-3" />
                      )}
                      {tone.label}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
