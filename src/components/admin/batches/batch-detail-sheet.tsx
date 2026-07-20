"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  BookOpen,
  CalendarClock,
  Clock,
  GraduationCap,
  Users,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { BATCH_STATUS_LABEL } from "@/lib/validations/batch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  progress: number;
  enrolledAt: string;
}
interface Detail {
  id: string;
  name: string;
  code: string;
  status: string;
  capacity: number | null;
  enrolledCount: number;
  startDate: string | null;
  endDate: string | null;
  schedule: { days: string[]; startTime: string; endTime: string } | null;
  course: { title: string; slug: string };
  instructor: { name: string; avatarUrl: string | null; headline: string | null } | null;
  students: Student[];
}

const STATUS_BADGE: Record<string, string> = {
  UPCOMING: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  ONGOING: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function BatchDetailSheet({
  batchId,
  onOpenChange,
}: {
  batchId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={batchId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {batchId && <DetailBody key={batchId} batchId={batchId} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ batchId }: { batchId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadedAt = Date.now(); // captured off-render (purity-safe)
    api
      .get<Detail>(`/api/batches/${batchId}`)
      .then((d) => {
        if (alive) {
          setData(d);
          setNow(loadedAt);
        }
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [batchId]);

  if (error) {
    return (
      <div className="p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Batch</SheetTitle>
          <SheetDescription>Couldn&apos;t load this batch.</SheetDescription>
        </SheetHeader>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const cap = data.capacity ?? 0;
  const seatsLeft = cap ? Math.max(0, cap - data.enrolledCount) : null;
  const fillPct = cap ? Math.min(100, Math.round((data.enrolledCount / cap) * 100)) : 0;

  // Timeline (computed against the load-time "now" captured in the effect)
  const start = data.startDate ? new Date(data.startDate).getTime() : null;
  const end = data.endDate ? new Date(data.endDate).getTime() : null;
  const weeks =
    start && end ? Math.max(1, Math.round((end - start) / (7 * 86_400_000))) : null;
  const DAY = 86_400_000;
  let timeNote = "";
  if (start && now < start) {
    timeNote = `Starts in ${Math.ceil((start - now) / DAY)} days`;
  } else if (start && end && now >= start && now <= end) {
    const elapsed = Math.round(((now - start) / (end - start)) * 100);
    timeNote = `In progress · ${elapsed}% elapsed`;
  } else if (end && now > end) {
    timeNote = "Ended";
  }
  const elapsedPct =
    start && end && now >= start
      ? Math.min(100, Math.round(((now - start) / (end - start)) * 100))
      : now && start && now < start
        ? 0
        : 100;

  const fmt = (iso: string | null) => (iso ? format(new Date(iso), "d MMM yyyy") : "—");

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <div className="flex items-start justify-between gap-3 pr-8">
          <SheetTitle className="text-xl leading-snug">{data.name}</SheetTitle>
          <Badge variant="secondary" className={cn("shrink-0", STATUS_BADGE[data.status])}>
            {BATCH_STATUS_LABEL[data.status] ?? data.status}
          </Badge>
        </div>
        <SheetDescription className="font-mono text-xs">{data.code}</SheetDescription>
      </SheetHeader>

      <div className="space-y-6 p-6">
        {/* Course + instructor */}
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
              <BookOpen className="size-4 text-rose-500" />
            </span>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Course</p>
              <p className="truncate text-sm font-medium">{data.course.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              {data.instructor?.avatarUrl && (
                <AvatarImage src={data.instructor.avatarUrl} alt={data.instructor.name} />
              )}
              <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-xs text-white">
                {data.instructor ? initials(data.instructor.name) : "—"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Instructor</p>
              <p className="truncate text-sm font-medium">
                {data.instructor?.name ?? "Unassigned"}
              </p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <section className="rounded-xl border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4 text-muted-foreground" /> Timeline
          </div>
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Start</p>
              <p className="font-medium">{fmt(data.startDate)}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs">End</p>
              <p className="font-medium">{fmt(data.endDate)}</p>
            </div>
          </div>
          {start && end && (
            <>
              <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
                <div className="bg-primary h-full rounded-full" style={{ width: `${elapsedPct}%` }} />
              </div>
              <p className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
                <span>{timeNote}</span>
                {weeks ? <span>{weeks} weeks</span> : null}
              </p>
            </>
          )}
        </section>

        {/* Schedule + capacity */}
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Clock className="size-4 text-muted-foreground" /> Schedule
            </div>
            {data.schedule && (data.schedule.days.length || data.schedule.startTime) ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {data.schedule.days.map((d) => (
                    <span key={d} className="bg-muted rounded px-1.5 py-0.5 text-xs">
                      {d}
                    </span>
                  ))}
                </div>
                {data.schedule.startTime && (
                  <p className="text-muted-foreground text-sm">
                    {data.schedule.startTime}
                    {data.schedule.endTime ? `–${data.schedule.endTime}` : ""}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Not set</p>
            )}
          </section>

          <section className="rounded-xl border p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Users className="size-4 text-muted-foreground" /> Capacity
            </div>
            <p className="text-sm">
              <span className="text-lg font-semibold tabular-nums">{data.enrolledCount}</span>
              <span className="text-muted-foreground">{cap ? ` / ${cap} seats` : " enrolled"}</span>
            </p>
            {cap > 0 && (
              <>
                <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full", fillPct >= 100 ? "bg-rose-500" : "bg-primary")}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-1.5 text-xs">
                  {seatsLeft === 0 ? "Full" : `${seatsLeft} seats left`} · {fillPct}%
                </p>
              </>
            )}
          </section>
        </div>

        {/* Roster */}
        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <GraduationCap className="size-4 text-muted-foreground" />
            Learners
            <span className="text-muted-foreground font-normal">({data.students.length})</span>
          </div>

          {data.students.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center">
              <Users className="text-muted-foreground mx-auto mb-2 size-6" />
              <p className="text-sm font-medium">No learners enrolled yet</p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-xs">
                {data.enrolledCount > 0
                  ? `${data.enrolledCount} seats are reserved. Learners appear here once enrolment goes live.`
                  : "Enrolled learners will appear here."}
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-xl border">
              {data.students.map((s) => (
                <li key={s.id} className="flex items-center gap-3 p-3">
                  <Avatar className="size-9">
                    {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.name} />}
                    <AvatarFallback className="text-xs">{initials(s.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{s.email}</p>
                  </div>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {Math.round(s.progress)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
