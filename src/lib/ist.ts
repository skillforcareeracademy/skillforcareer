/**
 * Academy time. Skill For Career runs its classes on Indian Standard Time, and
 * every time a person types — a batch's "17:30–19:00", a reschedule form's
 * "2026-09-21T17:30" — is an IST wall-clock time. The server, though, runs in
 * UTC on Vercel, where `new Date("2026-09-21T17:30")` quietly means 17:30 UTC
 * (11 pm in Delhi). These helpers do the conversion explicitly so nothing
 * depends on the machine's time zone.
 *
 * Pure functions only — safe to import from client components too.
 */

export const ACADEMY_TIME_ZONE = "Asia/Kolkata";

/** IST is UTC+5:30 all year (India has no daylight saving). */
const IST_OFFSET_MS = 330 * 60_000;

const WEEKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** "2026-09-21" — the IST calendar day an instant falls on. */
export function istDateKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "17:30" — the IST clock time of an instant. */
export function istTimeOfDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/**
 * A calendar day as UTC midnight — the shape `@db.Date` columns and the
 * batch's start/end dates come back in. Built with `Date.UTC` so it never
 * drifts to the previous day on a machine east of Greenwich.
 */
export function dateKeyToUtcMidnight(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The calendar day a UTC-midnight date column stands for. */
export function utcMidnightToDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysToKey(key: string, days: number): string {
  const d = dateKeyToUtcMidnight(key);
  d.setUTCDate(d.getUTCDate() + days);
  return utcMidnightToDateKey(d);
}

/** "Mon" … "Sun" for a calendar day — the same keys the batch form stores. */
export function weekdayOfKey(key: string): WeekdayKey {
  return WEEKDAY_KEYS[dateKeyToUtcMidnight(key).getUTCDay()];
}

/** The instant an IST wall-clock time ("17:30") happens on an IST calendar day. */
export function istWallClockToUtc(dateKey: string, hhmm: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MS);
}

/** Today's calendar day in India. */
export function istToday(now: Date = new Date()): string {
  return istDateKey(now);
}

/**
 * What a class form sends. A bare `YYYY-MM-DDTHH:MM` (an `<input
 * type="datetime-local">` value) is academy time; anything carrying its own
 * offset or a trailing `Z` is already an instant and is taken as-is.
 */
export function parseAcademyDateTime(value: string): Date {
  const bare = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  if (bare) return istWallClockToUtc(bare[1], bare[2]);
  return new Date(value);
}

/** `parseAcademyDateTime` for optional form fields. */
export function parseAcademyDateTimeOrNull(value?: string | null): Date | null {
  return value ? parseAcademyDateTime(value) : null;
}

/** Format an instant in academy time, whatever the viewer's own time zone. */
export function formatIst(
  value: Date | string,
  options: Intl.DateTimeFormatOptions,
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-IN", { ...options, timeZone: ACADEMY_TIME_ZONE });
}

/** "Mon, 21 Sep 2026" */
export function formatIstDay(value: Date | string): string {
  return formatIst(value, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** "5:30 pm" */
export function formatIstTime(value: Date | string): string {
  return formatIst(value, { hour: "numeric", minute: "2-digit", hour12: true });
}

/** "Mon, 21 Sep 2026 · 5:30 pm – 7:00 pm IST" */
export function formatIstSlot(start: Date | string, end?: Date | string | null): string {
  const from = formatIstTime(start);
  const to = end ? ` – ${formatIstTime(end)}` : "";
  return `${formatIstDay(start)} · ${from}${to} IST`;
}
