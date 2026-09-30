"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import type { BreakdownRow, StudentBreakdown } from "@/server/services/student-breakdown-service";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * What one of the profile's figures is actually made of.
 *
 * The academy asked for the cards to open: which days they attended, which
 * quizzes are done and which are waiting, what has been read and for how long.
 * Loaded when a card is tapped rather than with the page — five lists nobody
 * has asked for yet are five queries nobody needs.
 */

export type BreakdownKind = keyof StudentBreakdown;

const TITLES: Record<BreakdownKind, { title: string; blurb: string }> = {
  attendance: { title: "Attendance", blurb: "Every class their batch has held." },
  quizzes: { title: "Quizzes", blurb: "Taken and still waiting." },
  assignments: { title: "Assignments", blurb: "Handed in and outstanding." },
  lessons: { title: "Lectures", blurb: "Watched, part-watched and untouched." },
  materials: { title: "Study material", blurb: "Read, and for how long." },
};

const STATE_ICON = {
  done: CheckCircle2,
  pending: Circle,
  missed: XCircle,
  none: Circle,
} as const;

const STATE_TONE = {
  done: "text-emerald-600 dark:text-emerald-400",
  pending: "text-muted-foreground",
  missed: "text-rose-600 dark:text-rose-400",
  none: "text-muted-foreground/50",
} as const;

export function StudentBreakdownSheet({
  userId,
  kind,
  onOpenChange,
}: {
  userId: string;
  kind: BreakdownKind | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<StudentBreakdown | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!kind || data) return;
    let alive = true;
    // Deferred a tick: the compiler's `set-state-in-effect` rule rejects a
    // synchronous setState from an effect body.
    const started = setTimeout(() => {
      if (!alive) return;
      setLoading(true);
      api
        .get<StudentBreakdown>(`/api/admin/students/${userId}/breakdown`)
        .then((d) => {
          if (alive) setData(d);
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(started);
    };
  }, [kind, userId, data]);

  const rows: BreakdownRow[] = kind && data ? data[kind] : [];
  const done = rows.filter((r) => r.state === "done").length;

  return (
    <Sheet open={kind !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{kind ? TITLES[kind].title : ""}</SheetTitle>
          <SheetDescription>
            {kind ? TITLES[kind].blurb : ""}
            {rows.length > 0 ? ` ${done} of ${rows.length}.` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-8">
          {loading && (
            <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          )}
          {!loading && rows.length === 0 && (
            <p className="text-muted-foreground py-6 text-sm">Nothing here yet.</p>
          )}
          <ul className="divide-y">
            {rows.map((r) => {
              const Icon = STATE_ICON[r.state];
              return (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <Icon className={cn("size-4 shrink-0", STATE_TONE[r.state])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    {r.subtitle && (
                      <p className="text-muted-foreground truncate text-xs">{r.subtitle}</p>
                    )}
                  </div>
                  {r.value && (
                    <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">
                      {r.value}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
