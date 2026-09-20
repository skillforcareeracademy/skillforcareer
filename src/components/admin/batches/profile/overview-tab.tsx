"use client";

import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  ClipboardList,
  FileQuestion,
  GraduationCap,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type {
  BatchProfile,
  BatchProfileLearner,
} from "@/server/services/batch-profile-service";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { initials, percent, toneFor } from "./format";
import { cn } from "@/lib/utils";

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone: string;
  valueClassName?: string;
}) {
  return (
    <Card className="gap-0 p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            tone,
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <p className="text-muted-foreground text-xs">{label}</p>
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </Card>
  );
}

/**
 * Learners worth a word: under 75 % attendance, or coming to class but barely
 * started on the recorded course.
 */
function needsAttention(l: BatchProfileLearner): string | null {
  if (l.attendancePercent != null && l.attendancePercent < 75) {
    return `${l.attendancePercent}% attendance · missed ${l.missed}`;
  }
  if (l.progress < 10 && l.attended > 0)
    return `Attends class, but ${l.progress}% through the course`;
  return null;
}

export function OverviewTab({
  profile,
  onOpenTab,
}: {
  profile: BatchProfile;
  onOpenTab: (tab: string) => void;
}) {
  const k = profile.kpis;
  const c = k.classes;

  const flagged = profile.learners
    .map((l) => ({ l, why: needsAttention(l) }))
    .filter((x): x is { l: BatchProfileLearner; why: string } => Boolean(x.why))
    .sort(
      (a, b) => (a.l.attendancePercent ?? 101) - (b.l.attendancePercent ?? 101),
    )
    .slice(0, 6);

  const top = [...profile.learners]
    .filter((l) => l.quizAverage != null || l.progress > 0)
    .sort(
      (a, b) =>
        (b.quizAverage ?? 0) +
        b.progress +
        (b.attendancePercent ?? 0) -
        ((a.quizAverage ?? 0) + a.progress + (a.attendancePercent ?? 0)),
    )
    .slice(0, 5);

  const breakdown = [
    { label: "Completed", value: c.completed, className: "bg-emerald-500" },
    { label: "Live now", value: c.live, className: "bg-rose-500" },
    { label: "Upcoming", value: c.upcoming, className: "bg-sky-500" },
    { label: "Not held", value: c.notHeld, className: "bg-amber-500" },
    {
      label: "Cancelled",
      value: c.cancelled,
      className: "bg-muted-foreground/40",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          icon={CalendarCheck}
          label="Average attendance"
          value={percent(k.averageAttendance)}
          valueClassName={toneFor(k.averageAttendance)}
          hint={
            c.completed === 0
              ? "No classes held yet"
              : `Across ${c.completed - c.unmarked} marked class${c.completed - c.unmarked === 1 ? "" : "es"}`
          }
          tone="bg-emerald-500/10 text-emerald-600"
        />
        <Kpi
          icon={CalendarClock}
          label="Classes completed"
          value={`${c.completed} / ${c.total}`}
          hint={`${c.upcoming} upcoming · ${c.cancelled} cancelled`}
          tone="bg-sky-500/10 text-sky-600"
        />
        <Kpi
          icon={Users}
          label="Learners"
          value={String(k.learners)}
          hint={
            k.completedLearners
              ? `${k.completedLearners} finished the course`
              : undefined
          }
          tone="bg-violet-500/10 text-violet-600"
        />
        <Kpi
          icon={TrendingUp}
          label="Average course progress"
          value={percent(k.averageProgress)}
          tone="bg-rose-500/10 text-rose-600"
        />
        <Kpi
          icon={FileQuestion}
          label="Average quiz score"
          value={percent(k.averageQuizScore)}
          valueClassName={toneFor(k.averageQuizScore)}
          hint={`${profile.quizzes.length} quiz${profile.quizzes.length === 1 ? "" : "zes"} for this batch`}
          tone="bg-amber-500/10 text-amber-600"
        />
        <Kpi
          icon={ClipboardList}
          label="Assignment submission rate"
          value={percent(k.assignmentSubmissionRate)}
          valueClassName={toneFor(k.assignmentSubmissionRate)}
          hint={`${profile.assignments.length} assignment${profile.assignments.length === 1 ? "" : "s"} for this batch`}
          tone="bg-indigo-500/10 text-indigo-600"
        />
        <Kpi
          icon={CalendarX}
          label="Classes not held"
          value={String(c.notHeld)}
          hint="Scheduled, but never started"
          tone="bg-orange-500/10 text-orange-600"
        />
        <Kpi
          icon={GraduationCap}
          label="Register not taken"
          value={String(c.unmarked)}
          hint="Completed classes with no attendance"
          tone="bg-slate-500/10 text-slate-600"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Classes breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Classes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {c.total === 0 ? (
              <p className="text-muted-foreground text-sm">
                No classes scheduled for this batch yet.
              </p>
            ) : (
              <>
                <div className="bg-muted flex h-2 overflow-hidden rounded-full">
                  {breakdown.map((b) =>
                    b.value > 0 ? (
                      <div
                        key={b.label}
                        className={b.className}
                        style={{ width: `${(b.value / c.total) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
                <ul className="space-y-1.5 text-sm">
                  {breakdown.map((b) => (
                    <li key={b.label} className="flex items-center gap-2">
                      <span
                        className={cn("size-2 rounded-full", b.className)}
                      />
                      <span className="flex-1">{b.label}</span>
                      <span className="tabular-nums">{b.value}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenTab("classes")}
                >
                  See all classes
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Needs attention */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Needs attention</CardTitle>
          </CardHeader>
          <CardContent>
            {flagged.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {k.learners === 0
                  ? "No learners on this batch yet."
                  : "Nobody is falling behind on attendance."}
              </p>
            ) : (
              <ul className="space-y-3">
                {flagged.map(({ l, why }) => (
                  <LearnerLine key={l.userId} learner={l} note={why} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Doing well */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Doing well</CardTitle>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Progress and quiz scores show up here once learners get going.
              </p>
            ) : (
              <ul className="space-y-3">
                {top.map((l) => (
                  <LearnerLine
                    key={l.userId}
                    learner={l}
                    note={[
                      `${l.progress}% progress`,
                      l.quizAverage != null
                        ? `quiz avg ${l.quizAverage}%`
                        : null,
                      l.attendancePercent != null
                        ? `${l.attendancePercent}% attendance`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LearnerLine({
  learner,
  note,
}: {
  learner: BatchProfileLearner;
  note: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <Avatar className="size-8 shrink-0">
        {learner.avatarUrl && (
          <AvatarImage src={learner.avatarUrl} alt={learner.name} />
        )}
        <AvatarFallback className="text-xs">
          {initials(learner.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{learner.name}</p>
        <p className="text-muted-foreground truncate text-xs">{note}</p>
      </div>
    </li>
  );
}
