import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import {
  addDaysToKey,
  dateKeyToUtcMidnight,
  istDateKey,
  istToday,
  istWallClockToUtc,
  utcMidnightToDateKey,
  weekdayOfKey,
} from "@/lib/ist";
import type { AddBatchClassInput } from "@/lib/validations/class-schedule";
import { uniqueRoomCodes } from "./live-service";
import {
  announceClassEvent,
  announceClassEventLater,
  announceTimetable,
  sendClassReminders,
  sendFestivalWishes,
  type ReminderRunResult,
  type WishesRunResult,
} from "./class-notifications";

/**
 * A batch's class timetable.
 *
 * The client: "a class should get scheduled automatically as per days and
 * timing selected while creating the batch. But yes we can reschedule, cancel
 * or end the automatically created class anytime." So the days + time on the
 * batch form become real `Meeting` rows (`autoScheduled`), and anything a
 * person does to one of them by hand sets `manualOverride`, after which the
 * timetable never touches it again.
 *
 * `syncBatchTimetable` is the single place that reconciles the rows with the
 * batch. It is idempotent — run it after every batch save, from the "Rebuild
 * timetable" button, when a holiday is added, and every morning from the cron —
 * and it only ever touches future, untouched, auto-created classes:
 *
 *   - a timetable date with no class gets one;
 *   - an auto class whose date is still on the timetable is kept, and moved to
 *     the batch's current time / host / numbering if those changed;
 *   - an auto class whose date left the timetable is deleted;
 *   - an auto class on a "no classes" holiday is cancelled ("Holiday: Diwali"),
 *     and put back if the holiday is later removed;
 *   - hand-made classes, overridden classes, and anything that has started or
 *     ended are left exactly as they are.
 *
 * All times are academy time (IST): "17:30" on the batch form is 17:30 in
 * Delhi, whatever time zone the server runs in.
 */

/** Batches with no end date get this much timetable; the daily cron rolls it on. */
const ROLLING_WEEKS = 12;
/** Never generate further out than this, however long the batch runs. */
const MAX_WINDOW_DAYS = 400;
/** A batch slot with no (or a nonsensical) end time runs this long. */
const DEFAULT_CLASS_MINUTES = 60;
/**
 * A rescheduled auto class still stands in for the slot it came from, so a
 * rebuild doesn't re-create it. We don't store where it came from, so it is
 * matched to the nearest free timetable slot within this many days.
 */
const MOVED_CLASS_REACH_DAYS = 7;
/** Prefix on `cancelReason` for classes the timetable cancelled for a holiday. */
export const HOLIDAY_CANCEL_PREFIX = "Holiday: ";

const DAY_MS = 86_400_000;

// ── Timetable maths ─────────────────────────────────────────────────────────

interface BatchSchedule {
  days: string[];
  startTime: string;
  endTime: string;
}

function readSchedule(json: Prisma.JsonValue | null): BatchSchedule | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const days = Array.isArray(o.days) ? o.days.filter((d): d is string => typeof d === "string") : [];
  const startTime = typeof o.startTime === "string" ? o.startTime : "";
  const endTime = typeof o.endTime === "string" ? o.endTime : "";
  if (days.length === 0 || !/^\d{2}:\d{2}$/.test(startTime)) return null;
  return { days, startTime, endTime: /^\d{2}:\d{2}$/.test(endTime) ? endTime : "" };
}

/** One date on the timetable. `ordinal` is null on a no-classes holiday. */
interface Slot {
  key: string;
  start: Date;
  end: Date;
  ordinal: number | null;
  holiday: string | null;
}

interface BatchForTimetable {
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  schedule: Prisma.JsonValue | null;
}

/** First and last timetable day for a batch, in academy days. */
function timetableWindow(batch: BatchForTimetable, now: Date): { from: string; to: string } {
  const today = istToday(now);
  // A batch with no start date counts its classes from the day it was made, so
  // "Class 7" stays "Class 7" on every rebuild.
  const from = batch.startDate ? utcMidnightToDateKey(batch.startDate) : istDateKey(batch.createdAt);
  const cap = addDaysToKey(today, MAX_WINDOW_DAYS);
  let to = batch.endDate ? utcMidnightToDateKey(batch.endDate) : addDaysToKey(today, ROLLING_WEEKS * 7);
  if (to > cap) to = cap;
  return { from, to };
}

function buildSlots(
  schedule: BatchSchedule,
  window: { from: string; to: string },
  holidays: Map<string, string>,
): Slot[] {
  const slots: Slot[] = [];
  let ordinal = 0;
  // Guard against a start date typed decades back.
  for (let key = window.from, i = 0; key <= window.to && i < 3_000; key = addDaysToKey(key, 1), i += 1) {
    if (!schedule.days.includes(weekdayOfKey(key))) continue;
    const start = istWallClockToUtc(key, schedule.startTime);
    const end =
      schedule.endTime && schedule.endTime > schedule.startTime
        ? istWallClockToUtc(key, schedule.endTime)
        : new Date(start.getTime() + DEFAULT_CLASS_MINUTES * 60_000);
    const holiday = holidays.get(key) ?? null;
    slots.push({ key, start, end, holiday, ordinal: holiday ? null : ++ordinal });
  }
  return slots;
}

function classTitle(courseTitle: string, ordinal: number): string {
  const name = courseTitle.length > 150 ? `${courseTitle.slice(0, 147)}…` : courseTitle;
  return `${name} — Class ${ordinal}`;
}

// ── Sync ────────────────────────────────────────────────────────────────────

export interface TimetableSyncResult {
  created: number;
  removed: number;
  /** Kept classes moved to a new time/host/number, or put back after a holiday. */
  updated: number;
  /** Classes cancelled because their date became a no-classes holiday. */
  holidayCancelled: { id: string; reason: string }[];
  /** Holiday-cancelled classes put back because the holiday went away. */
  revivedIds: string[];
}

interface ExistingClass {
  id: string;
  title: string;
  status: string;
  manualOverride: boolean;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  actualStart: Date | null;
  hostId: string;
  courseId: string | null;
  cancelReason: string | null;
}

interface ClassPatch {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  hostId: string;
  courseId: string | null;
  status: "SCHEDULED" | "CANCELLED";
  cancelReason: string | null;
  resetReminder: boolean;
}

function isHolidayCancel(m: ExistingClass): boolean {
  return (
    m.status === "CANCELLED" &&
    !m.manualOverride &&
    (m.cancelReason ?? "").startsWith(HOLIDAY_CANCEL_PREFIX)
  );
}

/** Untouched, still-future auto classes: the only ones a rebuild may change. */
function isFree(m: ExistingClass, now: Date): boolean {
  return (
    !m.manualOverride &&
    m.actualStart == null &&
    m.scheduledStart.getTime() > now.getTime() &&
    (m.status === "SCHEDULED" || isHolidayCancel(m))
  );
}

/**
 * One UPDATE per hundred classes rather than one per class — a batch whose
 * time changes moves every future class at once. Raw SQL both for that and
 * because `.update()` under relationMode = "prisma" fans out into extra
 * SELECTs; `updatedAt` is set by hand since raw SQL skips `@updatedAt`.
 */
async function applyPatches(patches: ClassPatch[], now: Date): Promise<void> {
  for (let i = 0; i < patches.length; i += 100) {
    const chunk = patches.slice(i, i + 100);
    const ids = Prisma.join(chunk.map((p) => p.id));
    const when = <T>(pick: (p: ClassPatch) => T) =>
      Prisma.join(
        chunk.map((p) => Prisma.sql`WHEN ${p.id} THEN ${pick(p)}`),
        " ",
      );
    const resetIds = chunk.filter((p) => p.resetReminder).map((p) => p.id);
    await prisma.$executeRaw`
      UPDATE Meeting SET
        title = CASE id ${when((p) => p.title)} END,
        scheduledStart = CASE id ${when((p) => p.start)} END,
        scheduledEnd = CASE id ${when((p) => p.end)} END,
        hostId = CASE id ${when((p) => p.hostId)} END,
        courseId = CASE id ${when((p) => p.courseId)} END,
        status = CASE id ${when((p) => p.status)} END,
        cancelReason = CASE id ${when((p) => p.cancelReason)} END,
        reminderSentAt = ${
          resetIds.length
            ? Prisma.sql`CASE WHEN id IN (${Prisma.join(resetIds)}) THEN NULL ELSE reminderSentAt END`
            : Prisma.sql`reminderSentAt`
        },
        updatedAt = ${now}
      WHERE id IN (${ids}) AND manualOverride = FALSE AND actualStart IS NULL`;
  }
}

interface BatchToPlan extends BatchForTimetable {
  courseId: string;
  instructorId: string | null;
  course: { title: string; instructorId: string; deliveryMode: string };
}

export interface TimetablePlan {
  toCreate: Slot[];
  patches: ClassPatch[];
  toDelete: string[];
  hostId: string | null;
  provider: string;
  result: TimetableSyncResult;
}

/**
 * The decision half of a sync, with no database access — given the batch, its
 * no-class holidays (by day) and its existing auto classes, what should be
 * created, changed and removed. Kept pure so it can be checked on real data
 * without writing anything.
 */
export function planTimetable(
  batch: BatchToPlan,
  holidays: Map<string, string>,
  existing: ExistingClass[],
  now: Date,
): TimetablePlan {
  const schedule = readSchedule(batch.schedule);
  const running = batch.status === "UPCOMING" || batch.status === "ONGOING";
  const window = timetableWindow(batch, now);

  // A cancelled or finished batch has no timetable: its future classes go.
  const slots = schedule && running && window.from <= window.to ? buildSlots(schedule, window, holidays) : [];
  const hostId = batch.instructorId ?? batch.course.instructorId ?? null;
  const provider = batch.course.deliveryMode === "OFFLINE" ? "offline" : "webrtc";
  const sorted = [...existing].sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());

  // 1. A class on a timetable date belongs to that date. Prefer an untouched
  //    one, so a class moved *onto* a busy day stays spare for step 2.
  const byKey = new Map<string, ExistingClass[]>();
  for (const m of sorted) {
    const key = istDateKey(m.scheduledStart);
    byKey.set(key, [...(byKey.get(key) ?? []), m]);
  }
  const matched = new Map<string, ExistingClass>();
  const used = new Set<string>();
  for (const s of slots) {
    const onDay = byKey.get(s.key) ?? [];
    const pick =
      onDay.find((m) => isFree(m, now) && !used.has(m.id)) ?? onDay.find((m) => !used.has(m.id));
    if (pick) {
      matched.set(s.key, pick);
      used.add(pick.id);
    }
  }

  // 2. A rescheduled (overridden) class that sits off its own date still
  //    covers the slot it was moved from — the nearest open one within a week.
  //    Slots from before this batch ever had an auto class can't be its origin.
  const firstAutoKey = sorted.length ? istDateKey(sorted[0].scheduledStart) : null;
  const open = slots.filter(
    (s) => s.ordinal !== null && !matched.has(s.key) && (!firstAutoKey || s.key >= firstAutoKey),
  );
  for (const m of sorted) {
    if (used.has(m.id) || !m.manualOverride) continue;
    let best: Slot | null = null;
    let bestGap = Infinity;
    for (const s of open) {
      if (matched.has(s.key)) continue;
      const gap = Math.abs(s.start.getTime() - m.scheduledStart.getTime());
      if (gap > MOVED_CLASS_REACH_DAYS * DAY_MS) continue;
      // Ties go to the later slot: a class is more often brought forward.
      if (gap < bestGap || (gap === bestGap && best !== null && s.start > best.start)) {
        best = s;
        bestGap = gap;
      }
    }
    if (best) {
      matched.set(best.key, m);
      used.add(m.id);
    }
  }

  // 3. Work out what to create, change and remove.
  const toCreate: Slot[] = [];
  const patches: ClassPatch[] = [];
  const result: TimetableSyncResult = {
    created: 0,
    removed: 0,
    updated: 0,
    holidayCancelled: [],
    revivedIds: [],
  };

  for (const s of slots) {
    if (s.start.getTime() <= now.getTime()) continue; // never back-fill the past
    const m = matched.get(s.key);
    if (!m) {
      if (s.ordinal !== null && hostId) toCreate.push(s);
      continue;
    }
    if (!isFree(m, now)) continue; // touched by hand, started or ended

    if (s.holiday) {
      const reason = `${HOLIDAY_CANCEL_PREFIX}${s.holiday}`;
      if (m.status === "SCHEDULED" || m.cancelReason !== reason) {
        patches.push({
          id: m.id,
          title: m.title,
          start: m.scheduledStart,
          end: m.scheduledEnd,
          hostId: m.hostId,
          courseId: m.courseId,
          status: "CANCELLED",
          cancelReason: reason,
          resetReminder: false,
        });
        if (m.status === "SCHEDULED") result.holidayCancelled.push({ id: m.id, reason });
      }
      continue;
    }

    const want = {
      title: classTitle(batch.course.title, s.ordinal!),
      start: s.start,
      end: s.end,
      hostId: hostId ?? m.hostId,
      courseId: batch.courseId,
    };
    const moved =
      m.scheduledStart.getTime() !== want.start.getTime() ||
      (m.scheduledEnd?.getTime() ?? null) !== want.end.getTime();
    const revived = m.status === "CANCELLED";
    const differs =
      moved ||
      revived ||
      m.title !== want.title ||
      m.hostId !== want.hostId ||
      m.courseId !== want.courseId;
    if (!differs) continue;

    patches.push({
      id: m.id,
      ...want,
      status: "SCHEDULED",
      cancelReason: null,
      resetReminder: moved || revived,
    });
    if (revived) result.revivedIds.push(m.id);
    else result.updated += 1;
  }

  const toDelete = sorted.filter((m) => !used.has(m.id) && isFree(m, now)).map((m) => m.id);
  return { toCreate, patches, toDelete, hostId, provider, result };
}

/** Everything `planTimetable` needs, read in two round-trips. */
async function loadTimetableInputs(batchId: string, now: Date) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      schedule: true,
      instructorId: true,
      courseId: true,
      course: { select: { title: true, instructorId: true, deliveryMode: true } },
    },
  });
  if (!batch) throw AppError.notFound("Batch not found.");

  const window = timetableWindow(batch, now);
  const needsHolidays =
    readSchedule(batch.schedule) !== null && (batch.status === "UPCOMING" || batch.status === "ONGOING");
  const [holidayRows, existing] = await Promise.all([
    needsHolidays
      ? prisma.holiday.findMany({
          where: {
            noClasses: true,
            date: { gte: dateKeyToUtcMidnight(window.from), lte: dateKeyToUtcMidnight(window.to) },
          },
          select: { date: true, name: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([] as { date: Date; name: string }[]),
    prisma.meeting.findMany({
      where: { batchId, autoScheduled: true },
      select: {
        id: true,
        title: true,
        status: true,
        manualOverride: true,
        scheduledStart: true,
        scheduledEnd: true,
        actualStart: true,
        hostId: true,
        courseId: true,
        cancelReason: true,
      },
    }),
  ]);

  const holidays = new Map<string, string>();
  for (const h of holidayRows) {
    const key = utcMidnightToDateKey(h.date);
    if (!holidays.has(key)) holidays.set(key, h.name);
  }
  return { batch, holidays, existing };
}

/** Read-only: what a sync of this batch would do right now. */
export async function previewBatchTimetable(batchId: string, now: Date = new Date()): Promise<TimetablePlan> {
  const { batch, holidays, existing } = await loadTimetableInputs(batchId, now);
  return planTimetable(batch, holidays, existing, now);
}

/**
 * Reconcile a batch's auto-created classes with its days, time, dates,
 * instructor and status. Safe to run any number of times. See the file header
 * for exactly what it will and won't touch.
 */
export async function syncBatchTimetable(
  batchId: string,
  now: Date = new Date(),
): Promise<TimetableSyncResult> {
  const { batch, holidays, existing } = await loadTimetableInputs(batchId, now);
  const plan = planTimetable(batch, holidays, existing, now);
  const { result } = plan;

  if (plan.patches.length) await applyPatches(plan.patches, now);

  for (let i = 0; i < plan.toDelete.length; i += 500) {
    const { count } = await prisma.meeting.deleteMany({
      where: {
        id: { in: plan.toDelete.slice(i, i + 500) },
        // Re-checked at write time, in case someone started or edited one since.
        manualOverride: false,
        actualStart: null,
        status: { in: ["SCHEDULED", "CANCELLED"] },
      },
    });
    result.removed += count;
  }

  if (plan.toCreate.length && plan.hostId) {
    const hostId = plan.hostId;
    const codes = await uniqueRoomCodes(plan.toCreate.length);
    const { count } = await prisma.meeting.createMany({
      data: plan.toCreate.map((s, i) => ({
        title: classTitle(batch.course.title, s.ordinal!),
        courseId: batch.courseId,
        batchId,
        hostId,
        status: "SCHEDULED" as const,
        provider: plan.provider,
        roomCode: codes[i],
        scheduledStart: s.start,
        scheduledEnd: s.end,
        autoScheduled: true,
        manualOverride: false,
      })),
    });
    result.created = count;
  }

  return result;
}

type SyncMode = "created" | "updated" | "rebuilt" | "holiday" | "cron";

/** Tell people what a sync changed, in the way that suits what caused it. */
function announceSync(batchId: string, r: TimetableSyncResult, mode: SyncMode, actorId?: string): void {
  // A class the holiday took away is its own news, whatever caused the sync.
  for (const c of r.holidayCancelled) {
    announceClassEventLater(c.id, { kind: "cancelled", reason: c.reason });
  }
  const perClassRevivals = mode === "holiday" || mode === "cron";
  if (perClassRevivals) {
    for (const id of r.revivedIds) announceClassEventLater(id, { kind: "restored" });
  }
  // The morning cron rolling an open-ended timetable forward is not news;
  // the reminder the day before each class covers it.
  const created = mode === "cron" ? 0 : r.created;
  const changed = created + r.removed + r.updated + (perClassRevivals ? 0 : r.revivedIds.length);
  if (changed > 0) {
    announceTimetable(batchId, {
      reason: mode === "created" ? "created" : "updated",
      removed: r.removed,
      actorId,
    });
  }
}

/** Sync, then announce — for callers that want the counts. Throws on failure. */
export async function syncAndAnnounce(
  batchId: string,
  mode: SyncMode,
  actorId?: string,
): Promise<TimetableSyncResult> {
  const r = await syncBatchTimetable(batchId);
  announceSync(batchId, r, mode, actorId);
  return r;
}

/**
 * The hook the batch create/update routes call right after saving. Saving the
 * batch has already succeeded by then, so a timetable failure is logged rather
 * than turning a good save into an error — "Rebuild timetable" retries it.
 * Unchanged days/time/dates/instructor/status make this a read-only no-op.
 */
export async function refreshBatchTimetable(
  batchId: string,
  reason: "created" | "updated",
): Promise<TimetableSyncResult | null> {
  try {
    return await syncAndAnnounce(batchId, reason);
  } catch (error) {
    logger.error("timetable.sync_failed", {
      batchId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ── Holidays ────────────────────────────────────────────────────────────────

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

/**
 * A holiday was added, moved, switched to "no classes" or removed: re-sync the
 * running batches that meet on any of those days, which cancels (or puts back)
 * their auto classes and tells their learners.
 */
export async function applyHolidayToTimetables(
  dateKeys: string[],
): Promise<{ batches: number; cancelled: number; restored: number }> {
  const keys = [...new Set(dateKeys)];
  if (keys.length === 0) return { batches: 0, cancelled: 0, restored: 0 };

  const [batches, onDates] = await Promise.all([
    prisma.batch.findMany({
      where: { status: { in: ["UPCOMING", "ONGOING"] } },
      select: { id: true, startDate: true, endDate: true, schedule: true },
    }),
    prisma.meeting.findMany({
      where: {
        autoScheduled: true,
        batchId: { not: null },
        OR: keys.map((k) => ({
          scheduledStart: {
            gte: istWallClockToUtc(k, "00:00"),
            lt: istWallClockToUtc(addDaysToKey(k, 1), "00:00"),
          },
        })),
      },
      select: { batchId: true },
    }),
  ]);

  const affected = new Set(onDates.map((m) => m.batchId!).filter(Boolean));
  for (const b of batches) {
    const s = readSchedule(b.schedule);
    if (!s) continue;
    const from = b.startDate ? utcMidnightToDateKey(b.startDate) : null;
    const to = b.endDate ? utcMidnightToDateKey(b.endDate) : null;
    if (keys.some((k) => s.days.includes(weekdayOfKey(k)) && (!from || k >= from) && (!to || k <= to))) {
      affected.add(b.id);
    }
  }

  const results = await mapLimit([...affected], 3, async (id) => {
    try {
      return await syncAndAnnounce(id, "holiday");
    } catch (error) {
      logger.error("timetable.holiday_sync_failed", {
        batchId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });
  return {
    batches: affected.size,
    cancelled: results.reduce((n, r) => n + (r?.holidayCancelled.length ?? 0), 0),
    restored: results.reduce((n, r) => n + (r?.revivedIds.length ?? 0), 0),
  };
}

// ── Stats & lists ───────────────────────────────────────────────────────────

export interface BatchClassStats {
  /** Classes that happen: completed + live + pending (cancelled not counted). */
  total: number;
  completed: number;
  pending: number;
  cancelled: number;
  live: number;
}

type StatRow = { status: string; scheduledStart: Date; scheduledEnd: Date | null };

/**
 * "Completed" is a class that ended, or whose time has simply passed — an
 * offline class never changes status, and a missed online one is no longer
 * pending either. "Pending" is everything still to come.
 */
function computeStats(rows: StatRow[], now: Date): BatchClassStats {
  const s: BatchClassStats = { total: 0, completed: 0, pending: 0, cancelled: 0, live: 0 };
  for (const m of rows) {
    if (m.status === "CANCELLED") s.cancelled += 1;
    else if (m.status === "LIVE") s.live += 1;
    else if (m.status === "ENDED") s.completed += 1;
    else {
      const end = m.scheduledEnd ?? new Date(m.scheduledStart.getTime() + DEFAULT_CLASS_MINUTES * 60_000);
      if (end.getTime() < now.getTime()) s.completed += 1;
      else s.pending += 1;
    }
  }
  s.total = s.completed + s.pending + s.live;
  return s;
}

export async function getBatchClassStats(batchId: string): Promise<BatchClassStats> {
  const rows = await prisma.meeting.findMany({
    where: { batchId, provider: { not: "webinar" } },
    select: { status: true, scheduledStart: true, scheduledEnd: true },
  });
  return computeStats(rows, new Date());
}

export type BatchClassPhase = "upcoming" | "live" | "past" | "cancelled";

export interface BatchClassRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  phase: BatchClassPhase;
  /** Its start time has passed (whatever its status says). */
  started: boolean;
  provider: string;
  location: string | null;
  roomCode: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  autoScheduled: boolean;
  manualOverride: boolean;
  cancelReason: string | null;
  hostName: string;
  reminderSent: boolean;
}

export interface BatchClassesView {
  batch: {
    id: string;
    name: string;
    status: string;
    courseTitle: string;
    startDate: string | null;
    endDate: string | null;
    schedule: BatchSchedule | null;
  };
  stats: BatchClassStats;
  classes: BatchClassRow[];
}

function phaseOf(m: StatRow, now: Date): BatchClassPhase {
  if (m.status === "CANCELLED") return "cancelled";
  if (m.status === "LIVE") return "live";
  if (m.status === "ENDED") return "past";
  const end = m.scheduledEnd ?? new Date(m.scheduledStart.getTime() + DEFAULT_CLASS_MINUTES * 60_000);
  return end.getTime() < now.getTime() ? "past" : "upcoming";
}

/** Every class of a batch — upcoming first (soonest first), then the rest (latest first). */
export async function listBatchClasses(batchId: string): Promise<BatchClassesView> {
  const [batch, rows] = await Promise.all([
    prisma.batch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        schedule: true,
        course: { select: { title: true } },
      },
    }),
    prisma.meeting.findMany({
      where: { batchId, provider: { not: "webinar" } },
      orderBy: { scheduledStart: "asc" },
      take: 1000,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        provider: true,
        location: true,
        roomCode: true,
        scheduledStart: true,
        scheduledEnd: true,
        autoScheduled: true,
        manualOverride: true,
        cancelReason: true,
        reminderSentAt: true,
        host: { select: { name: true } },
      },
    }),
  ]);
  if (!batch) throw AppError.notFound("Batch not found.");

  const now = new Date();
  const mapped: BatchClassRow[] = rows.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    status: m.status,
    phase: phaseOf(m, now),
    started: m.scheduledStart.getTime() <= now.getTime(),
    provider: m.provider,
    location: m.location,
    roomCode: m.roomCode,
    scheduledStart: m.scheduledStart.toISOString(),
    scheduledEnd: m.scheduledEnd ? m.scheduledEnd.toISOString() : null,
    autoScheduled: m.autoScheduled,
    manualOverride: m.manualOverride,
    cancelReason: m.cancelReason,
    hostName: m.host.name,
    reminderSent: m.reminderSentAt != null,
  }));

  const ahead = mapped.filter((m) => m.phase === "live" || m.phase === "upcoming");
  const behind = mapped
    .filter((m) => m.phase === "past" || m.phase === "cancelled")
    .sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));

  return {
    batch: {
      id: batch.id,
      name: batch.name,
      status: batch.status,
      courseTitle: batch.course.title,
      startDate: batch.startDate ? batch.startDate.toISOString() : null,
      endDate: batch.endDate ? batch.endDate.toISOString() : null,
      schedule: readSchedule(batch.schedule),
    },
    stats: computeStats(rows, now),
    classes: [...ahead, ...behind],
  };
}

export interface BatchClassProgress {
  batchId: string;
  batchName: string;
  courseTitle: string;
  status: string;
  stats: BatchClassStats;
  nextClassAt: string | null;
}

/**
 * Completed-vs-pending for every running batch — the schedule pages' "batch
 * progress" list. Two queries whatever the number of batches. An instructor
 * sees the batches they lead or assist on.
 */
export async function listBatchClassProgress(scope: { instructorId?: string } = {}): Promise<BatchClassProgress[]> {
  const where: Prisma.BatchWhereInput = { status: { in: ["UPCOMING", "ONGOING"] } };
  if (scope.instructorId) {
    where.OR = [
      { instructorId: scope.instructorId },
      { associates: { some: { userId: scope.instructorId } } },
    ];
  }
  const batches = await prisma.batch.findMany({
    where,
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    take: 50,
    select: { id: true, name: true, status: true, course: { select: { title: true } } },
  });
  if (batches.length === 0) return [];

  const rows = await prisma.meeting.findMany({
    where: { batchId: { in: batches.map((b) => b.id) }, provider: { not: "webinar" } },
    select: { batchId: true, status: true, scheduledStart: true, scheduledEnd: true },
  });
  const byBatch = new Map<string, StatRow[]>();
  for (const r of rows) byBatch.set(r.batchId!, [...(byBatch.get(r.batchId!) ?? []), r]);

  const now = new Date();
  return batches.map((b) => {
    const list = byBatch.get(b.id) ?? [];
    const next = list
      .filter((m) => m.status === "SCHEDULED" && m.scheduledStart.getTime() > now.getTime())
      .sort((x, y) => x.scheduledStart.getTime() - y.scheduledStart.getTime())[0];
    return {
      batchId: b.id,
      batchName: b.name,
      courseTitle: b.course.title,
      status: b.status,
      stats: computeStats(list, now),
      nextClassAt: next ? next.scheduledStart.toISOString() : null,
    };
  });
}

/** Upcoming classes of a batch, soonest first — for anyone composing an email. */
export async function upcomingBatchClasses(batchId: string, take = 10) {
  return prisma.meeting.findMany({
    where: { batchId, status: "SCHEDULED", scheduledStart: { gt: new Date() } },
    orderBy: { scheduledStart: "asc" },
    take,
    select: { id: true, title: true, scheduledStart: true, scheduledEnd: true, provider: true },
  });
}

// ── Manual classes ──────────────────────────────────────────────────────────

/**
 * An extra class on a batch, by hand — a make-up, a doubt session, a class on
 * a holiday. It is not part of the timetable (`autoScheduled` false), so a
 * rebuild never moves or removes it. Learners and the teaching team hear about
 * it straight away.
 */
export async function addBatchClass(
  batchId: string,
  input: AddBatchClassInput,
  actorId: string,
): Promise<{ id: string; notified: number }> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      instructorId: true,
      courseId: true,
      course: { select: { title: true, instructorId: true, deliveryMode: true } },
    },
  });
  if (!batch) throw AppError.notFound("Batch not found.");

  const start = istWallClockToUtc(input.date, input.startTime);
  const end =
    input.endTime && input.endTime > input.startTime
      ? istWallClockToUtc(input.date, input.endTime)
      : new Date(start.getTime() + DEFAULT_CLASS_MINUTES * 60_000);
  if (start.getTime() < Date.now() - 5 * 60_000) {
    throw AppError.badRequest("That time has already passed — pick a time in the future.");
  }

  const [code] = await uniqueRoomCodes(1);
  const m = await prisma.meeting.create({
    data: {
      title: input.title?.trim() || `${batch.course.title} — Extra class`,
      description: input.description?.trim() || null,
      courseId: batch.courseId,
      batchId,
      hostId: batch.instructorId ?? batch.course.instructorId ?? actorId,
      status: "SCHEDULED",
      provider: batch.course.deliveryMode === "OFFLINE" ? "offline" : "webrtc",
      roomCode: code,
      scheduledStart: start,
      scheduledEnd: end,
      autoScheduled: false,
    },
    select: { id: true },
  });

  const notified = await announceClassEvent(m.id, { kind: "scheduled" }, { actorId });
  return { id: m.id, notified };
}

// ── Daily cron ──────────────────────────────────────────────────────────────

export interface DailyClassJobsResult {
  timetables: { batches: number; created: number; removed: number; holidayCancelled: number } | null;
  reminders: ReminderRunResult | null;
  wishes: WishesRunResult | null;
  errors: string[];
}

/**
 * Every running batch with a timetable is re-synced each morning: that rolls
 * open-ended timetables forward, and catches holidays that were loaded straight
 * into the database rather than through the admin page.
 */
async function syncRunningTimetables(now: Date): Promise<NonNullable<DailyClassJobsResult["timetables"]>> {
  const batches = await prisma.batch.findMany({
    where: { status: { in: ["UPCOMING", "ONGOING"] }, NOT: { schedule: { equals: Prisma.AnyNull } } },
    select: { id: true },
  });
  const deadline = now.getTime() + 40_000;
  const out = { batches: 0, created: 0, removed: 0, holidayCancelled: 0 };
  await mapLimit(batches, 3, async (b) => {
    if (Date.now() > deadline) return null; // leave the rest for tomorrow
    try {
      const r = await syncAndAnnounce(b.id, "cron");
      out.batches += 1;
      out.created += r.created;
      out.removed += r.removed;
      out.holidayCancelled += r.holidayCancelled.length;
      return r;
    } catch (error) {
      logger.error("timetable.cron_sync_failed", {
        batchId: b.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });
  return out;
}

/** The morning job: timetables, then tomorrow's reminders, then festival wishes. */
export async function runDailyClassJobs(now: Date = new Date()): Promise<DailyClassJobsResult> {
  const result: DailyClassJobsResult = { timetables: null, reminders: null, wishes: null, errors: [] };
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`cron.classes.${name}_failed`, { error: message });
      result.errors.push(`${name}: ${message}`);
      return null;
    }
  };
  result.timetables = await step("timetables", () => syncRunningTimetables(now));
  result.reminders = await step("reminders", () => sendClassReminders(now));
  result.wishes = await step("wishes", () => sendFestivalWishes(now));
  return result;
}
