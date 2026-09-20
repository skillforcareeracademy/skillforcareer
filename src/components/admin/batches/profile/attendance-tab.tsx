"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, ChevronDown, ChevronRight } from "lucide-react";
import type { BatchProfile } from "@/server/services/batch-profile-service";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { percent, toneFor, when } from "./format";
import { cn } from "@/lib/utils";

/** How many of the latest classes the matrix shows before it gets unreadable. */
const MATRIX_COLUMNS = 20;

/**
 * Attendance three ways: per class (how full was each session), per learner
 * (who missed what), and a register-style matrix of the most recent classes.
 */
export function AttendanceTab({ profile }: { profile: BatchProfile }) {
  const [view, setView] = useState<"learners" | "classes" | "matrix">(
    "learners",
  );
  const [open, setOpen] = useState<Set<string>>(new Set());

  const held = useMemo(
    () => profile.classes.filter((c) => c.phase === "completed"),
    [profile.classes],
  );
  const byId = useMemo(
    () => new Map(profile.classes.map((c) => [c.id, c])),
    [profile.classes],
  );
  const newestFirst = useMemo(() => [...held].reverse(), [held]);
  const matrixClasses = useMemo(() => held.slice(-MATRIX_COLUMNS), [held]);
  const notHeld = profile.classes.filter((c) => c.phase === "not_held");
  const k = profile.kpis;

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (held.length === 0 && notHeld.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No classes held yet"
        description="Attendance shows up here once this batch's classes have run and the register is taken."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Average attendance{" "}
          <span className={cn("font-semibold", toneFor(k.averageAttendance))}>
            {percent(k.averageAttendance)}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {held.length} class{held.length === 1 ? "" : "es"} held
            {k.classes.unmarked > 0
              ? ` · ${k.classes.unmarked} without a register`
              : ""}
          </span>
        </p>
        <div className="bg-muted inline-flex rounded-lg p-[3px]">
          {(
            [
              ["learners", "By learner"],
              ["classes", "By class"],
              ["matrix", "Register"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                view === v
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "learners" && (
        <Card className="gap-0 p-0">
          {profile.learners.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">
              No learners on this batch.
            </p>
          ) : (
            <ul className="divide-y">
              {profile.learners.map((l) => {
                const expanded = open.has(l.userId);
                return (
                  <li key={l.userId} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {l.attended} attended · {l.missed} missed
                        </p>
                      </div>
                      <span
                        className={cn(
                          "w-12 text-right text-sm font-semibold tabular-nums",
                          toneFor(l.attendancePercent),
                        )}
                      >
                        {percent(l.attendancePercent)}
                      </span>
                      {l.missed > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggle(l.userId)}
                        >
                          {expanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                          Missed
                        </Button>
                      ) : (
                        <span className="w-[74px]" />
                      )}
                    </div>
                    {expanded && (
                      <ul className="bg-muted/40 mt-2 space-y-1 rounded-lg p-3 text-sm">
                        {[...l.missedClassIds].reverse().map((id) => {
                          const c = byId.get(id);
                          return (
                            <li
                              key={id}
                              className="flex flex-wrap justify-between gap-x-3"
                            >
                              <span className="min-w-0 truncate">
                                {c?.title ?? "Class"}
                              </span>
                              <span className="text-muted-foreground text-xs whitespace-nowrap">
                                {when(c?.scheduledStart ?? null)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {view === "classes" && (
        <Card className="gap-0 p-0">
          <ul className="divide-y">
            {newestFirst.map((c) => {
              const rate =
                c.registerTaken && c.expectedCount
                  ? Math.round((c.presentCount / c.expectedCount) * 100)
                  : null;
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {when(c.scheduledStart)}
                      {c.hostName ? ` · ${c.hostName}` : ""}
                    </p>
                  </div>
                  {c.registerTaken ? (
                    <div className="text-right">
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          toneFor(rate),
                        )}
                      >
                        {c.presentCount} / {c.expectedCount}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {percent(rate)} present
                      </p>
                    </div>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    >
                      Register not taken
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {view === "matrix" && (
        <Card className="gap-0 overflow-hidden p-0">
          {matrixClasses.length === 0 || profile.learners.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">
              Nothing to show yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="bg-muted/40 sticky left-0 z-10 min-w-40 px-3 py-2 text-left font-medium">
                      Learner
                    </th>
                    {matrixClasses.map((c) => (
                      <th
                        key={c.id}
                        title={`${c.title} · ${when(c.scheduledStart)}`}
                        className="px-1.5 py-2 text-center font-medium whitespace-nowrap"
                      >
                        {when(c.scheduledStart, { time: false })
                          .split(" ")
                          .slice(0, 2)
                          .join(" ")}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.learners.map((l) => {
                    const present = new Set(l.attendedClassIds);
                    const absent = new Set(l.missedClassIds);
                    return (
                      <tr key={l.userId} className="border-t">
                        <td className="bg-background sticky left-0 z-10 max-w-48 truncate px-3 py-2 font-medium">
                          {l.name}
                        </td>
                        {matrixClasses.map((c) => (
                          <td key={c.id} className="px-1.5 py-2 text-center">
                            {present.has(c.id) ? (
                              <span className="inline-grid size-5 place-items-center rounded bg-emerald-100 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                P
                              </span>
                            ) : absent.has(c.id) ? (
                              <span className="inline-grid size-5 place-items-center rounded bg-rose-100 font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                                A
                              </span>
                            ) : (
                              <span className="text-muted-foreground">–</span>
                            )}
                          </td>
                        ))}
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-semibold tabular-nums",
                            toneFor(l.attendancePercent),
                          )}
                        >
                          {percent(l.attendancePercent)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-muted-foreground border-t px-3 py-2 text-xs">
            P present · A absent · – register not taken, or not on the batch
            yet.
            {held.length > MATRIX_COLUMNS
              ? ` Showing the latest ${MATRIX_COLUMNS} classes.`
              : ""}
          </p>
        </Card>
      )}

      {notHeld.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Classes that didn&apos;t happen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3 text-sm">
              Scheduled, but the class was never started. Reschedule or cancel
              them so the record is straight.
            </p>
            <ul className="divide-y rounded-lg border">
              {[...notHeld].reverse().map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">
                    {c.title}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {when(c.scheduledStart)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
