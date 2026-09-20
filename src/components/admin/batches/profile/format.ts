import type { BatchSchedule } from "@/lib/validations/batch";

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Batch start/end dates are calendar days stored at UTC midnight. Reading the
 * y-m-d straight off the ISO string keeps them on the right day in any
 * browser timezone.
 */
export function calendarDay(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const IST_OFFSET_MS = 330 * 60_000;

/**
 * A moment (class time, note date) on the academy's clock — India Standard
 * Time, which has no daylight saving, so a fixed +5:30 is exact. Doing it by
 * hand rather than with the viewer's timezone means the server-rendered HTML
 * and the browser agree to the character, so hydration never trips over it.
 */
export function when(
  iso: string | null,
  opts: { time?: boolean } = { time: true },
): string {
  if (!iso) return "—";
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (opts.time === false) return date;
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${date}, ${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** "19:00" → "7:00 PM". Wall-clock strings, so no Date and no timezone. */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Mon, Wed, Fri · 7:00 PM – 9:00 PM". */
export function scheduleLabel(s: BatchSchedule | null): string | null {
  if (!s) return null;
  const hours =
    s.startTime && s.endTime
      ? `${clock(s.startTime)} – ${clock(s.endTime)}`
      : s.startTime
        ? clock(s.startTime)
        : "";
  return [s.days.join(", "), hours].filter(Boolean).join(" · ") || null;
}

export function percent(n: number | null): string {
  return n == null ? "—" : `${n}%`;
}

/** Green at 75 % and up (the usual attendance bar), amber from 50, red below. */
export function toneFor(n: number | null): string {
  if (n == null) return "text-muted-foreground";
  if (n >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (n >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export const BATCH_STATUS_BADGE: Record<string, string> = {
  UPCOMING: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  ONGOING:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

export const CLASS_PHASE: Record<string, { label: string; className: string }> =
  {
    completed: {
      label: "Completed",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    live: {
      label: "Live now",
      className:
        "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    },
    upcoming: {
      label: "Upcoming",
      className: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    },
    not_held: {
      label: "Not held",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-muted text-muted-foreground",
    },
  };
