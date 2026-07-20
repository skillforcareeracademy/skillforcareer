"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, isToday, isTomorrow, isFuture, isSameDay } from "date-fns";
import {
  CalendarDays,
  Video,
  ClipboardList,
  Layers,
  CalendarClock,
  Radio,
  ChevronRight,
} from "lucide-react";
import type { ScheduleEvent, ScheduleEventType, ScheduleStats } from "@/server/services/schedule-service";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const TYPE_META: Record<
  ScheduleEventType,
  { label: string; Icon: typeof Video; tile: string; dot: string }
> = {
  LIVE: {
    label: "Live class",
    Icon: Video,
    tile: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  ASSIGNMENT: {
    label: "Assignment",
    Icon: ClipboardList,
    tile: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  BATCH: {
    label: "Batch",
    Icon: Layers,
    tile: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    dot: "bg-violet-500",
  },
};

const FILTERS: { value: "all" | ScheduleEventType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "LIVE", label: "Live classes" },
  { value: "ASSIGNMENT", label: "Assignments" },
  { value: "BATCH", label: "Batches" },
];

function dayLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEEE, d MMM");
}

export function ScheduleClient({
  events,
  stats,
}: {
  events: ScheduleEvent[];
  stats: ScheduleStats;
}) {
  const [type, setType] = useState<"all" | ScheduleEventType>("all");
  const [selected, setSelected] = useState<Date | undefined>(undefined);

  const filtered = useMemo(
    () => (type === "all" ? events : events.filter((e) => e.type === type)),
    [events, type],
  );

  const eventDays = useMemo(() => {
    const seen = new Set<string>();
    const days: Date[] = [];
    for (const e of filtered) {
      const d = new Date(e.at);
      const key = format(d, "yyyy-MM-dd");
      if (!seen.has(key)) {
        seen.add(key);
        days.push(d);
      }
    }
    return days;
  }, [filtered]);

  // Agenda: a specific selected day, or all upcoming (today onward).
  const agenda = useMemo(() => {
    const list = selected
      ? filtered.filter((e) => isSameDay(new Date(e.at), selected))
      : filtered.filter((e) => {
          const d = new Date(e.at);
          return isToday(d) || isFuture(d);
        });

    const groups: { key: string; date: Date; items: ScheduleEvent[] }[] = [];
    for (const e of list) {
      const d = new Date(e.at);
      const key = format(d, "yyyy-MM-dd");
      let g = groups.find((x) => x.key === key);
      if (!g) {
        g = { key, date: d, items: [] };
        groups.push(g);
      }
      g.items.push(e);
    }
    return groups;
  }, [filtered, selected]);

  const statCards = [
    { label: "This week", value: stats.thisWeek, icon: CalendarClock, tone: "text-rose-500" },
    { label: "Live classes", value: stats.liveClasses, icon: Radio, tone: "text-emerald-500" },
    { label: "Assignments due", value: stats.assignmentsDue, icon: ClipboardList, tone: "text-amber-500" },
    { label: "Batches running", value: stats.batchesOngoing, icon: Layers, tone: "text-violet-500" },
  ];

  const dotClass =
    "relative after:absolute after:bottom-1 after:left-1/2 after:size-1.5 after:-translate-x-1/2 after:rounded-full after:bg-rose-500";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule"
        description="All your live classes, assignment deadlines and batch milestones in one place."
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                <s.icon className={`size-5 ${s.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold leading-none tabular-nums">
                  {s.value.toLocaleString("en-IN")}
                </p>
                <p className="text-muted-foreground mt-1 truncate text-xs">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={type === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setType(f.value)}
          >
            {f.value !== "all" && (
              <span className={cn("size-2 rounded-full", TYPE_META[f.value as ScheduleEventType].dot)} />
            )}
            {f.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        {/* Calendar */}
        <Card className="h-fit p-2">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={setSelected}
            modifiers={{ event: eventDays }}
            modifiersClassNames={{ event: dotClass }}
            className="p-0"
          />
        </Card>

        {/* Agenda */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {selected ? format(selected, "d MMMM yyyy") : "Upcoming"}
            </h2>
            {selected && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(undefined)}>
                Show upcoming
              </Button>
            )}
          </div>

          {agenda.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-14 text-center">
                <CalendarDays className="text-muted-foreground mb-3 size-8" />
                <p className="text-sm font-medium">
                  {selected ? "No events on this day" : "Nothing scheduled"}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {selected
                    ? "Pick another day or show upcoming events."
                    : "Live classes, due dates and batch milestones will appear here."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {agenda.map((group) => (
                <div key={group.key}>
                  <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                    {dayLabel(group.date)}
                  </p>
                  <div className="space-y-2">
                    {group.items.map((e) => {
                      const meta = TYPE_META[e.type];
                      return (
                        <Link
                          key={e.id}
                          href={e.url}
                          className="hover:bg-accent group flex items-center gap-3 rounded-xl border p-3 transition-colors"
                        >
                          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", meta.tile)}>
                            <meta.Icon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{e.title}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {format(new Date(e.at), "h:mm a")}
                              {e.context ? ` · ${e.context}` : ""}
                            </p>
                          </div>
                          {e.status && (
                            <Badge variant="secondary" className="hidden sm:inline-flex">
                              {e.status.charAt(0) + e.status.slice(1).toLowerCase()}
                            </Badge>
                          )}
                          <ChevronRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
