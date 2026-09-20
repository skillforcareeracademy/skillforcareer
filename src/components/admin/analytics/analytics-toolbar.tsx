"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { CalendarDays, ChevronDown, Download } from "lucide-react";
import type { RangePreset } from "@/server/services/analytics-service";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const QUICK_RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

/** `YYYY-MM-DD` ⇄ a local-midnight Date, which is what the calendar works in. */
function toDate(day: string | undefined): Date | undefined {
  if (!day) return undefined;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Period controls for the analytics page: the 7/30/90-day tabs, a custom
 * from–to range (with one-click presets), and the report download. The period
 * lives in the URL — `?range=30` or `?from=2026-09-01&to=2026-09-20` — so a view
 * survives a refresh and can be shared as a link.
 */
export function AnalyticsToolbar({
  from,
  to,
  today,
  preset,
  presets,
  label,
  maxDays,
  reportHref,
}: {
  /** The window on screen, as IST days. */
  from: string;
  to: string;
  /** Today in IST — the latest day that can be picked. */
  today: string;
  /** The quick tab the window matches, or null for a custom range. */
  preset: number | null;
  presets: RangePreset[];
  /** The window, formatted for display. */
  label: string;
  maxDays: number;
  /** Report download for this window; omitted when the viewer can't download. */
  reportHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ from?: string; to?: string }>({ from, to });
  const [month, setMonth] = useState<Date | undefined>(toDate(to));

  function navigate(update: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    update(next);
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function selectQuick(days: number) {
    navigate((next) => {
      next.set("range", String(days));
      next.delete("from");
      next.delete("to");
    });
  }

  function applyRange(rangeFrom: string, rangeTo: string) {
    setOpen(false);
    navigate((next) => {
      next.delete("range");
      next.set("from", rangeFrom);
      next.set("to", rangeTo);
    });
  }

  function onOpenChange(next: boolean) {
    // Every opening starts from the window on screen, not a half-made pick.
    if (next) {
      setDraft({ from, to });
      setMonth(toDate(to));
    }
    setOpen(next);
  }

  // A lone start date is a one-day range until an end is picked.
  const draftTo = draft.to ?? draft.from;
  const draftError = !draft.from
    ? "Pick a start date."
    : draftTo! < draft.from
      ? "The start date must be on or before the end date."
      : draftTo! > today
        ? "The end date can't be in the future."
        : spanDays(draft.from, draftTo!) > maxDays
          ? "Choose a range of 2 years or less."
          : null;
  const draftDays = draft.from && draftTo && !draftError ? spanDays(draft.from, draftTo) : 0;

  const todayDate = toDate(today)!;
  const activePreset = presets.find((p) => p.from === from && p.to === to);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className={cn(
          "bg-muted flex max-w-full flex-wrap rounded-lg p-1 transition-opacity",
          pending && "opacity-60",
        )}
        aria-busy={pending}
      >
        {QUICK_RANGES.map((o) => (
          <button
            key={o.days}
            type="button"
            onClick={() => selectQuick(o.days)}
            aria-pressed={preset === o.days}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              preset === o.days
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}

        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className={cn(
                  "inline-flex min-w-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  preset === null
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              />
            }
          >
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{preset === null ? label : "Custom"}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)] gap-0 p-0">
            <div className="flex flex-col sm:flex-row">
              <div className="flex flex-wrap gap-1 border-b p-2 sm:w-36 sm:flex-col sm:flex-nowrap sm:border-r sm:border-b-0">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyRange(p.from, p.to)}
                    className={cn(
                      "hover:bg-muted rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                      activePreset?.label === p.label && "bg-muted font-medium",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="analytics-from">From</Label>
                    <Input
                      id="analytics-from"
                      type="date"
                      value={draft.from ?? ""}
                      max={today}
                      onChange={(e) => {
                        const value = e.target.value || undefined;
                        setDraft((d) => ({ ...d, from: value }));
                        if (value) setMonth(toDate(value));
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="analytics-to">To</Label>
                    <Input
                      id="analytics-to"
                      type="date"
                      value={draft.to ?? ""}
                      min={draft.from}
                      max={today}
                      onChange={(e) => {
                        const value = e.target.value || undefined;
                        setDraft((d) => ({ ...d, to: value }));
                        if (value) setMonth(toDate(value));
                      }}
                    />
                  </div>
                </div>

                <Calendar
                  mode="range"
                  resetOnSelect
                  selected={{ from: toDate(draft.from), to: toDate(draft.to) }}
                  onSelect={(range) =>
                    setDraft({
                      from: range?.from ? toDay(range.from) : undefined,
                      to: range?.to ? toDay(range.to) : undefined,
                    })
                  }
                  month={month}
                  onMonthChange={setMonth}
                  captionLayout="dropdown"
                  startMonth={new Date(todayDate.getFullYear() - 5, 0)}
                  endMonth={todayDate}
                  disabled={{ after: todayDate }}
                  className="mx-auto p-0"
                />

                <p
                  className={cn("text-xs", draftError ? "text-destructive" : "text-muted-foreground")}
                  aria-live="polite"
                >
                  {draftError ??
                    `${format(toDate(draft.from)!, "d MMM yyyy")}${
                      draftTo !== draft.from ? ` – ${format(toDate(draftTo)!, "d MMM yyyy")}` : ""
                    } · ${draftDays} ${draftDays === 1 ? "day" : "days"}`}
                </p>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!!draftError}
                    onClick={() => draft.from && draftTo && applyRange(draft.from, draftTo)}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {reportHref && (
        <Button variant="outline" size="lg" nativeButton={false} render={<a href={reportHref} download />}>
          <Download className="size-4" /> Download report
        </Button>
      )}
    </div>
  );
}
