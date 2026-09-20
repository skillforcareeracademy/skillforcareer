import { z } from "zod";

/**
 * Prefix on a holiday's message meaning "this date comes from a lunar or
 * moon-sighting calendar and nobody has confirmed it yet". The admin page shows
 * a "Check the date" hint for it, and festival wishes are held back until an
 * admin confirms — a greeting on the wrong day is worse than none.
 */
export const CHECK_DATE_MARKER = "[Check the date]";

export function needsDateCheck(message: string | null | undefined): boolean {
  return Boolean(message && message.trimStart().startsWith(CHECK_DATE_MARKER));
}

/** The message without the marker — what people actually read. */
export function stripDateCheck(message: string | null | undefined): string {
  if (!message) return "";
  const m = message.trimStart();
  return m.startsWith(CHECK_DATE_MARKER) ? m.slice(CHECK_DATE_MARKER.length).trim() : m.trim();
}

export const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  name: z.string().trim().min(2, "Name is too short").max(120),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  noClasses: z.boolean().default(true),
  sendWishes: z.boolean().default(true),
  /** True while the date still needs confirming (see CHECK_DATE_MARKER). */
  needsDateCheck: z.boolean().default(false),
});

export type HolidayInput = z.infer<typeof holidaySchema>;
