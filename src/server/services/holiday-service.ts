import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { dateKeyToUtcMidnight, istToday, utcMidnightToDateKey } from "@/lib/ist";
import {
  CHECK_DATE_MARKER,
  needsDateCheck,
  stripDateCheck,
  type HolidayInput,
} from "@/lib/validations/holiday";
import { applyHolidayToTimetables } from "./class-schedule-service";

/**
 * Festivals and holidays. The client: "There should be an option of automatic
 * capturing festivals and send wishes of festivals to all students and
 * instructors. Also mention there that Enjoy your holiday as there is no class
 * scheduled for today."
 *
 * A holiday does two independent things: `sendWishes` has the morning cron
 * greet everyone on the day, and `noClasses` takes the date off every batch's
 * timetable (cancelling any auto class already there, and telling learners).
 * The wishes themselves are sent from class-notifications; this file is the
 * admin side.
 */

export interface HolidayRow {
  id: string;
  /** Academy calendar day, "YYYY-MM-DD". */
  date: string;
  name: string;
  /** The greeting, without the "check the date" marker. */
  message: string;
  /** The date came from a lunar calendar and nobody has confirmed it yet. */
  needsDateCheck: boolean;
  noClasses: boolean;
  sendWishes: boolean;
  wishesSentAt: string | null;
}

function toRow(h: {
  id: string;
  date: Date;
  name: string;
  message: string | null;
  noClasses: boolean;
  sendWishes: boolean;
  wishesSentAt: Date | null;
}): HolidayRow {
  return {
    id: h.id,
    date: utcMidnightToDateKey(h.date),
    name: h.name,
    message: stripDateCheck(h.message),
    needsDateCheck: needsDateCheck(h.message),
    noClasses: h.noClasses,
    sendWishes: h.sendWishes,
    wishesSentAt: h.wishesSentAt ? h.wishesSentAt.toISOString() : null,
  };
}

function storedMessage(input: HolidayInput): string | null {
  const text = input.message?.trim() ?? "";
  if (input.needsDateCheck) return text ? `${CHECK_DATE_MARKER} ${text}` : CHECK_DATE_MARKER;
  return text || null;
}

export async function listHolidays(year: number): Promise<HolidayRow[]> {
  const rows = await prisma.holiday.findMany({
    where: {
      date: {
        gte: dateKeyToUtcMidnight(`${year}-01-01`),
        lte: dateKeyToUtcMidnight(`${year}-12-31`),
      },
    },
    orderBy: [{ date: "asc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

/** Years worth offering in the picker: any with holidays, plus this year and next. */
export async function listHolidayYears(): Promise<number[]> {
  const [first, last] = await Promise.all([
    prisma.holiday.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
    prisma.holiday.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const thisYear = Number(istToday().slice(0, 4));
  const from = Math.min(thisYear, first ? first.date.getUTCFullYear() : thisYear);
  const to = Math.max(thisYear + 1, last ? last.date.getUTCFullYear() : thisYear);
  const years: number[] = [];
  for (let y = from; y <= to; y += 1) years.push(y);
  return years;
}

export interface HolidayChangeResult {
  id: string;
  /** Auto classes cancelled because they fell on a no-classes day. */
  classesCancelled: number;
  /** Classes put back because a no-classes day went away. */
  classesRestored: number;
}

export async function createHoliday(input: HolidayInput): Promise<HolidayChangeResult> {
  const h = await prisma.holiday.create({
    data: {
      date: dateKeyToUtcMidnight(input.date),
      name: input.name.trim(),
      message: storedMessage(input),
      noClasses: input.noClasses,
      sendWishes: input.sendWishes,
    },
    select: { id: true },
  });
  const t = input.noClasses
    ? await applyHolidayToTimetables([input.date])
    : { cancelled: 0, restored: 0 };
  return { id: h.id, classesCancelled: t.cancelled, classesRestored: t.restored };
}

export async function updateHoliday(id: string, input: HolidayInput): Promise<HolidayChangeResult> {
  const before = await prisma.holiday.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Holiday not found.");

  const oldKey = utcMidnightToDateKey(before.date);
  const moved = oldKey !== input.date;
  await prisma.holiday.update({
    where: { id },
    data: {
      date: dateKeyToUtcMidnight(input.date),
      name: input.name.trim(),
      message: storedMessage(input),
      noClasses: input.noClasses,
      sendWishes: input.sendWishes,
      // Moved to a day still to come (a lunar date corrected): wish on the new day.
      ...(moved && input.date >= istToday() ? { wishesSentAt: null } : {}),
    },
  });

  const timetableChanged = moved || before.noClasses !== input.noClasses;
  const t =
    timetableChanged && (before.noClasses || input.noClasses)
      ? await applyHolidayToTimetables([oldKey, input.date])
      : { cancelled: 0, restored: 0 };
  return { id, classesCancelled: t.cancelled, classesRestored: t.restored };
}

export async function deleteHoliday(id: string): Promise<HolidayChangeResult> {
  const before = await prisma.holiday.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Holiday not found.");
  await prisma.holiday.delete({ where: { id } });
  const t = before.noClasses
    ? await applyHolidayToTimetables([utcMidnightToDateKey(before.date)])
    : { cancelled: 0, restored: 0 };
  return { id, classesCancelled: t.cancelled, classesRestored: t.restored };
}

export interface HolidayToday {
  name: string;
  message: string | null;
  noClasses: boolean;
}

/**
 * Today's holiday for the learner banner, if any. A no-classes day wins over a
 * wishes-only one; a date still waiting to be confirmed isn't announced.
 */
export async function getHolidayToday(now: Date = new Date()): Promise<HolidayToday | null> {
  const rows = await prisma.holiday.findMany({
    where: { date: dateKeyToUtcMidnight(istToday(now)) },
    orderBy: [{ noClasses: "desc" }, { createdAt: "asc" }],
    select: { name: true, message: true, noClasses: true },
  });
  const h = rows.find((r) => !needsDateCheck(r.message));
  if (!h) return null;
  return { name: h.name, message: stripDateCheck(h.message) || null, noClasses: h.noClasses };
}
