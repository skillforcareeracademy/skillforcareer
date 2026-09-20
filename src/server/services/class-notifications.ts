import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { sendMail } from "@/lib/mail/mailer";
import { emailLayout } from "@/lib/mail/templates/layout";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { ROLES } from "@/config/roles";
import {
  formatIstDay,
  formatIstSlot,
  formatIstTime,
  istDateKey,
  istToday,
  dateKeyToUtcMidnight,
  istWallClockToUtc,
  addDaysToKey,
} from "@/lib/ist";
import { isJoinLinkOpen, joinLinkOpensAt, JOIN_LINK_LEAD_HOURS } from "@/lib/class-link";
import { needsDateCheck, stripDateCheck } from "@/lib/validations/holiday";
import { notify } from "./notification-service";

/**
 * Class emails and in-app messages.
 *
 * The client's words: "There should be a mail going … when his class is being
 * scheduled, live, ended or cancelled", and "Immediate mail should go to the
 * student and instructor if any change in batch or scheduled class has been
 * made." Everything that tells people about a class goes through here, so the
 * wording, the audience and the "who hears about it" rules live in one place.
 *
 * Audience: the learners actively enrolled on the class's batch (or its course,
 * for a class with no batch) plus anyone hand-added to the class, and the
 * teaching team — the host, the batch's lead instructor and its associate
 * instructors. Whoever made the change is left out; they know.
 *
 * Delivery never fails the action that caused it. In-app rows are written
 * during the request (the UI shows "N learners notified"); emails go out after
 * the response via `after()`, in small parallel chunks, and every failure is
 * logged and swallowed.
 */

const APP_URL = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
const APP_NAME = env.NEXT_PUBLIC_APP_NAME;
/** Emails in flight at once. The SMTP transport pools three connections. */
const EMAIL_CHUNK = 5;

// ── Plumbing ─────────────────────────────────────────────────────────────────

/**
 * Run work once the response has gone out. Inside a request that is Next's
 * `after()` (the platform keeps the function alive for it); anywhere else — a
 * script, a test — there is no response to wait for, so it just starts.
 * Errors are logged, never thrown: a lost email must not surface as a failed
 * reschedule.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
  const safe = async () => {
    try {
      await task();
    } catch (error) {
      logger.error("class_notifications.failed", {
        label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  try {
    after(safe);
  } catch {
    void safe();
  }
}

async function inChunks<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<boolean>,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += size) {
    const results = await Promise.allSettled(items.slice(i, i + size).map(fn));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) sent += 1;
      else failed += 1;
    }
  }
  return { sent, failed };
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function p(html: string, muted = false): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${muted ? "#71717a" : "#3f3f46"};">${html}</p>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:22px 0;"><a href="${esc(href)}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">${esc(label)}</a></p>`;
}

function details(rows: [string, string | null | undefined][]): string {
  const body = rows
    .filter((r): r is [string, string] => Boolean(r[1]))
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#71717a;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#18181b;">${v}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border-collapse:collapse;">${body}</table>`;
}

// ── People ───────────────────────────────────────────────────────────────────

const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  preferences: true,
} as const;

interface Person {
  id: string;
  name: string;
  email: string;
  /** "Live class reminders" toggle in the learner's settings. */
  wantsReminders: boolean;
  /** "Announcements" toggle — festival wishes ride on this one. */
  wantsAnnouncements: boolean;
}

interface Audience {
  learners: Person[];
  team: Person[];
}

function emailPref(prefs: Prisma.JsonValue | null, key: string): boolean {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return true;
  const n = (prefs as Record<string, unknown>).notifications;
  if (!n || typeof n !== "object" || Array.isArray(n)) return true;
  return (n as Record<string, unknown>)[key] !== false;
}

function toPeople(
  rows: { id: string; name: string; email: string; status: string; preferences: Prisma.JsonValue | null }[],
): Person[] {
  return rows
    .filter((u) => u.status !== "SUSPENDED" && u.status !== "INACTIVE")
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      wantsReminders: emailPref(u.preferences, "emailLiveClassReminders"),
      wantsAnnouncements: emailPref(u.preferences, "emailAnnouncements"),
    }));
}

/**
 * Learners + teaching team for a batch, a course, or a single class. Two waves
 * of queries whatever the roster size: ids first, then one read of the people.
 */
async function resolveAudience(scope: {
  batchId: string | null;
  courseId: string | null;
  meetingId?: string;
  hostId?: string;
  actorId?: string;
}): Promise<Audience> {
  const [enrolled, invited, batch, associates] = await Promise.all([
    scope.batchId || scope.courseId
      ? prisma.enrollment.findMany({
          where: scope.batchId
            ? { batchId: scope.batchId, status: "ACTIVE" }
            : { courseId: scope.courseId!, status: "ACTIVE" },
          select: { userId: true },
        })
      : Promise.resolve([] as { userId: string }[]),
    scope.meetingId
      ? prisma.meetingParticipant.findMany({
          where: { meetingId: scope.meetingId },
          select: { userId: true },
        })
      : Promise.resolve([] as { userId: string }[]),
    scope.batchId
      ? prisma.batch.findUnique({
          where: { id: scope.batchId },
          select: { instructorId: true, course: { select: { instructorId: true } } },
        })
      : Promise.resolve(null),
    scope.batchId
      ? prisma.batchInstructor.findMany({ where: { batchId: scope.batchId }, select: { userId: true } })
      : Promise.resolve([] as { userId: string }[]),
  ]);

  const teamIds = new Set<string>();
  if (scope.hostId) teamIds.add(scope.hostId);
  if (batch?.instructorId) teamIds.add(batch.instructorId);
  for (const a of associates) teamIds.add(a.userId);
  // A batch with nobody leading it is taught by the course's instructor.
  if (teamIds.size === 0 && batch?.course?.instructorId) teamIds.add(batch.course.instructorId);

  const learnerIds = new Set<string>();
  for (const e of [...enrolled, ...invited]) {
    if (!teamIds.has(e.userId)) learnerIds.add(e.userId);
  }
  if (scope.actorId) {
    teamIds.delete(scope.actorId);
    learnerIds.delete(scope.actorId);
  }

  const ids = [...teamIds, ...learnerIds];
  if (ids.length === 0) return { learners: [], team: [] };
  const people = toPeople(
    await prisma.user.findMany({ where: { id: { in: ids } }, select: PERSON_SELECT }),
  );
  return {
    learners: people.filter((u) => learnerIds.has(u.id)),
    team: people.filter((u) => teamIds.has(u.id)),
  };
}

/** Everyone who should hear about a batch's timetable. */
export async function batchAudience(batchId: string, actorId?: string): Promise<Audience> {
  return resolveAudience({ batchId, courseId: null, actorId });
}

// ── Class snapshots ──────────────────────────────────────────────────────────

/** What an email needs to know about a class, captured before it can change. */
export interface ClassSnapshot {
  id: string;
  title: string;
  description: string | null;
  status: string;
  provider: string;
  location: string | null;
  roomCode: string;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  batchId: string | null;
  courseId: string | null;
  hostId: string;
  cancelReason: string | null;
  batchName: string | null;
  courseTitle: string | null;
  hostName: string;
}

const SNAPSHOT_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  provider: true,
  location: true,
  roomCode: true,
  scheduledStart: true,
  scheduledEnd: true,
  batchId: true,
  courseId: true,
  hostId: true,
  cancelReason: true,
  batch: { select: { name: true } },
  course: { select: { title: true } },
  host: { select: { name: true } },
} as const;

type SnapshotRow = Prisma.MeetingGetPayload<{ select: typeof SNAPSHOT_SELECT }>;

function toSnapshot(m: SnapshotRow): ClassSnapshot {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    status: m.status,
    provider: m.provider,
    location: m.location,
    roomCode: m.roomCode,
    scheduledStart: m.scheduledStart,
    scheduledEnd: m.scheduledEnd,
    batchId: m.batchId,
    courseId: m.courseId,
    hostId: m.hostId,
    cancelReason: m.cancelReason,
    batchName: m.batch?.name ?? null,
    courseTitle: m.course?.title ?? null,
    hostName: m.host.name,
  };
}

export async function loadClassSnapshot(meetingId: string): Promise<ClassSnapshot | null> {
  const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: SNAPSHOT_SELECT });
  return m ? toSnapshot(m) : null;
}

// ── Class events ─────────────────────────────────────────────────────────────

export type ClassEvent =
  | { kind: "scheduled" }
  | { kind: "rescheduled"; previousStart: Date; previousEnd: Date | null; reason?: string | null }
  | { kind: "updated"; changes: string[] }
  | { kind: "cancelled"; reason?: string | null }
  | { kind: "restored" }
  | { kind: "live" }
  | { kind: "ended" };

const isOffline = (c: ClassSnapshot) => c.provider === "offline";
const roomUrl = (c: ClassSnapshot) => `${APP_URL}/live/room/${c.roomCode}`;

interface EventCopy {
  subject: string;
  heading: string;
  lead: string;
  inAppTitle: string;
  inAppMessage: string;
}

function eventCopy(c: ClassSnapshot, ev: ClassEvent): EventCopy {
  const t = c.title;
  const day = formatIstDay(c.scheduledStart);
  const slot = formatIstSlot(c.scheduledStart, c.scheduledEnd);
  switch (ev.kind) {
    case "scheduled":
      return {
        subject: `New class scheduled: ${t} · ${day}`,
        heading: "A new class has been scheduled",
        lead: `“${esc(t)}” is on the timetable for <strong>${esc(slot)}</strong>.`,
        inAppTitle: "New class scheduled",
        inAppMessage: `“${t}” — ${slot}.`,
      };
    case "rescheduled": {
      const was = formatIstSlot(ev.previousStart, ev.previousEnd);
      const why = ev.reason ? ` Reason: ${ev.reason}` : "";
      return {
        subject: `Class rescheduled: ${t} is now ${day}`,
        heading: "Your class has been rescheduled",
        lead: `“${esc(t)}” has moved from <s>${esc(was)}</s> to <strong>${esc(slot)}</strong>.${ev.reason ? `<br><br>Reason: ${esc(ev.reason)}` : ""}`,
        inAppTitle: "Class rescheduled",
        inAppMessage: `“${t}” has moved to ${slot}.${why}`,
      };
    }
    case "updated":
      return {
        subject: `Class updated: ${t}`,
        heading: "Your class details have changed",
        lead: `“${esc(t)}” on <strong>${esc(slot)}</strong> has been updated${ev.changes.length ? ` (${esc(ev.changes.join(", "))})` : ""}.`,
        inAppTitle: "Class updated",
        inAppMessage: `“${t}” on ${slot} has been updated.`,
      };
    case "cancelled":
      return {
        subject: `Class cancelled: ${t} · ${day}`,
        heading: "A class has been cancelled",
        lead: `“${esc(t)}” scheduled for <strong>${esc(slot)}</strong> will not take place.${ev.reason ? `<br><br>Reason: ${esc(ev.reason)}` : ""}`,
        inAppTitle: "Class cancelled",
        inAppMessage: `“${t}” on ${slot} is cancelled.${ev.reason ? ` Reason: ${ev.reason}` : ""}`,
      };
    case "restored":
      return {
        subject: `Class back on: ${t} · ${day}`,
        heading: "Your class is back on",
        lead: `“${esc(t)}” is going ahead as scheduled on <strong>${esc(slot)}</strong>.`,
        inAppTitle: "Class back on",
        inAppMessage: `“${t}” is going ahead on ${slot}.`,
      };
    case "live":
      return {
        subject: `Live now: ${t}`,
        heading: "Your class is live",
        lead: `“${esc(t)}” has just started. Join now so you don't miss anything.`,
        inAppTitle: "Live class is starting",
        inAppMessage: `“${t}” is now live. Join from your dashboard.`,
      };
    case "ended":
      return {
        subject: `Class ended: ${t}`,
        heading: "Class has ended",
        lead: `“${esc(t)}” (${esc(slot)}) has ended. Thank you for attending — if a recording is published it will appear under your live classes.`,
        inAppTitle: "Class ended",
        inAppMessage: `“${t}” has ended.`,
      };
  }
}

/** The call to action a learner gets — never a room link before it opens. */
function learnerCta(c: ClassSnapshot, ev: ClassEvent): string {
  const mine = `${APP_URL}/student/live`;
  if (isOffline(c) || ev.kind === "cancelled" || ev.kind === "ended") {
    return button(mine, "See my classes");
  }
  if (ev.kind === "live" || isJoinLinkOpen(c.scheduledStart)) {
    return button(roomUrl(c), ev.kind === "live" ? "Join now" : "Open class link");
  }
  const opens = joinLinkOpensAt(c.scheduledStart);
  return (
    p(
      `Your join link opens ${JOIN_LINK_LEAD_HOURS} hours before class — on <strong>${esc(formatIstSlot(opens))}</strong> — and we'll email it to you the day before.`,
      true,
    ) + button(mine, "See my classes")
  );
}

function teamCta(c: ClassSnapshot, ev: ClassEvent): string {
  if (isOffline(c) || ev.kind === "cancelled" || ev.kind === "ended") return "";
  return button(roomUrl(c), ev.kind === "live" ? "Open the room" : "Class room link");
}

function classEmail(
  person: Person,
  c: ClassSnapshot,
  ev: ClassEvent,
  forTeam: boolean,
): { subject: string; html: string; text: string } {
  const copy = eventCopy(c, ev);
  const body =
    p(`Hi ${esc(person.name)},`) +
    p(copy.lead) +
    details([
      ["When", esc(formatIstSlot(c.scheduledStart, c.scheduledEnd))],
      ["Batch", c.batchName ? esc(c.batchName) : null],
      ["Course", c.courseTitle ? esc(c.courseTitle) : null],
      ["Instructor", esc(c.hostName)],
      ["Where", isOffline(c) ? esc(c.location ?? "In person at the centre") : "Online live class"],
    ]) +
    (forTeam ? teamCta(c, ev) : learnerCta(c, ev)) +
    p(`— Team ${esc(APP_NAME)}`, true);
  return {
    subject: copy.subject,
    html: emailLayout({ heading: copy.heading, bodyHtml: body, previewText: esc(copy.inAppMessage) }),
    text: `Hi ${person.name}, ${copy.inAppMessage} ${forTeam && !isOffline(c) ? `Room: ${roomUrl(c)}` : `See ${APP_URL}/student/live`}`,
  };
}

async function emailAudience(c: ClassSnapshot, ev: ClassEvent, audience: Audience): Promise<void> {
  // A class going live is a reminder; everything else is a change people need.
  const learners =
    ev.kind === "live" ? audience.learners.filter((u) => u.wantsReminders) : audience.learners;
  const jobs = [
    ...learners.map((u) => () => sendMail({ to: u.email, ...classEmail(u, c, ev, false) })),
    ...audience.team.map((u) => () => sendMail({ to: u.email, ...classEmail(u, c, ev, true) })),
  ];
  const result = await inChunks(jobs, EMAIL_CHUNK, (job) => job());
  logger.info("class_notifications.emailed", { meetingId: c.id, kind: ev.kind, ...result });
}

async function inAppAudience(c: ClassSnapshot, ev: ClassEvent, audience: Audience): Promise<number> {
  const copy = eventCopy(c, ev);
  const learnerUrl =
    ev.kind === "live" && !isOffline(c) ? `/live/room/${c.roomCode}` : "/student/live";
  await notify({
    userIds: audience.learners.map((u) => u.id),
    type: "LIVE_CLASS",
    title: copy.inAppTitle,
    message: copy.inAppMessage,
    actionUrl: learnerUrl,
  });
  await notify({
    userIds: audience.team.map((u) => u.id),
    type: "LIVE_CLASS",
    title: copy.inAppTitle,
    message: copy.inAppMessage,
    actionUrl: isOffline(c) ? undefined : `/live/room/${c.roomCode}`,
  });
  return audience.learners.length;
}

function hasAudience(c: ClassSnapshot): boolean {
  // Webinars have their own registration emails.
  return c.provider !== "webinar";
}

/** A class plus the people to tell, resolved before anything changes. */
export interface PreparedAnnouncement {
  c: ClassSnapshot;
  audience: Audience;
}

/**
 * Resolve a class and its audience now — needed when the class is about to be
 * deleted, since afterwards its hand-added learners are gone with it. Never
 * throws; returns null when there is nobody to tell.
 */
export async function prepareClassAnnouncement(
  meetingId: string,
  actorId?: string,
): Promise<PreparedAnnouncement | null> {
  try {
    const c = await loadClassSnapshot(meetingId);
    if (!c || !hasAudience(c)) return null;
    const audience = await resolveAudience({
      batchId: c.batchId,
      courseId: c.courseId,
      meetingId: c.id,
      hostId: c.hostId,
      actorId,
    });
    return { c, audience };
  } catch (error) {
    logger.error("class_notifications.prepare_failed", {
      meetingId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Write the in-app rows now (returns how many learners that reached, for "N
 * learners notified") and send the emails after the response.
 */
export async function deliverClassAnnouncement(
  prepared: PreparedAnnouncement | null,
  ev: ClassEvent,
): Promise<number> {
  if (!prepared) return 0;
  const { c, audience } = prepared;
  try {
    const reached = await inAppAudience(c, ev, audience);
    runAfterResponse(`class:${ev.kind}`, () => emailAudience(c, ev, audience));
    return reached;
  } catch (error) {
    logger.error("class_notifications.announce_failed", {
      meetingId: c.id,
      kind: ev.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/** Tell a class's learners and teaching team about something that just happened. */
export async function announceClassEvent(
  meetingId: string,
  ev: ClassEvent,
  opts: { actorId?: string } = {},
): Promise<number> {
  return deliverClassAnnouncement(await prepareClassAnnouncement(meetingId, opts.actorId), ev);
}

/** Same as `announceClassEvent`, but nothing at all happens during the request. */
export function announceClassEventLater(
  meetingId: string,
  ev: ClassEvent,
  opts: { actorId?: string } = {},
): void {
  runAfterResponse(`class:${ev.kind}:later`, async () => {
    const prepared = await prepareClassAnnouncement(meetingId, opts.actorId);
    if (!prepared) return;
    await inAppAudience(prepared.c, ev, prepared.audience);
    await emailAudience(prepared.c, ev, prepared.audience);
  });
}

// ── Timetable summary ────────────────────────────────────────────────────────

/** How many upcoming classes a timetable email lists before "and N more". */
const TIMETABLE_PREVIEW = 12;

/**
 * One email per person when a batch's timetable is generated or changes —
 * never one email per class. Lists the next classes and says how many follow.
 * Runs entirely after the response, so saving a batch stays quick.
 */
export function announceTimetable(
  batchId: string,
  opts: { reason: "created" | "updated"; removed?: number; actorId?: string },
): void {
  runAfterResponse("timetable", async () => {
    const now = new Date();
    const [batch, upcoming, upcomingCount] = await Promise.all([
      prisma.batch.findUnique({
        where: { id: batchId },
        select: { name: true, course: { select: { title: true } } },
      }),
      prisma.meeting.findMany({
        where: { batchId, status: "SCHEDULED", scheduledStart: { gt: now } },
        orderBy: { scheduledStart: "asc" },
        take: TIMETABLE_PREVIEW,
        select: { title: true, scheduledStart: true, scheduledEnd: true, provider: true },
      }),
      prisma.meeting.count({ where: { batchId, status: "SCHEDULED", scheduledStart: { gt: now } } }),
    ]);
    if (!batch) return;
    if (upcoming.length === 0 && !opts.removed) return;

    const audience = await batchAudience(batchId, opts.actorId);
    const fresh = opts.reason === "created";
    const title = fresh ? "Your class timetable is ready" : "Your class timetable has changed";
    const summary =
      upcomingCount > 0
        ? `${upcomingCount} upcoming class${upcomingCount === 1 ? "" : "es"} for ${batch.name}, starting ${formatIstSlot(upcoming[0].scheduledStart, upcoming[0].scheduledEnd)}.`
        : `There are no upcoming classes on ${batch.name}'s timetable right now.`;

    await notify({
      userIds: audience.learners.map((u) => u.id),
      type: "LIVE_CLASS",
      title,
      message: summary,
      actionUrl: "/student/live",
    });
    await notify({
      userIds: audience.team.map((u) => u.id),
      type: "LIVE_CLASS",
      title,
      message: summary,
    });

    const rows = upcoming
      .map(
        (m) =>
          `<tr><td style="padding:7px 12px 7px 0;font-size:14px;color:#18181b;white-space:nowrap;">${esc(formatIstDay(m.scheduledStart))}</td><td style="padding:7px 12px 7px 0;font-size:14px;color:#3f3f46;white-space:nowrap;">${esc(formatIstTime(m.scheduledStart))}${m.scheduledEnd ? ` – ${esc(formatIstTime(m.scheduledEnd))}` : ""}</td><td style="padding:7px 0;font-size:13px;color:#71717a;">${esc(m.title)}</td></tr>`,
      )
      .join("");
    const more = upcomingCount - upcoming.length;
    const table = upcoming.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;border-collapse:collapse;">${rows}</table>${more > 0 ? p(`…and ${more} more.`, true) : ""}`
      : "";

    const mail = (person: Person, forTeam: boolean) => {
      const body =
        p(`Hi ${esc(person.name)},`) +
        p(
          fresh
            ? `Classes for <strong>${esc(batch.name)}</strong> (${esc(batch.course.title)}) have been scheduled. All times are IST.`
            : `The timetable for <strong>${esc(batch.name)}</strong> (${esc(batch.course.title)}) has been updated${opts.removed ? ` — ${opts.removed} class${opts.removed === 1 ? " was" : "es were"} taken off` : ""}. Here is what's coming up (IST):`,
        ) +
        table +
        (forTeam
          ? ""
          : p(
              `Each class's join link opens ${JOIN_LINK_LEAD_HOURS} hours before it starts, and we'll email it to you the day before.`,
              true,
            ) + button(`${APP_URL}/student/live`, "See my classes")) +
        p(`— Team ${esc(APP_NAME)}`, true);
      return {
        subject: `${fresh ? "Class timetable" : "Timetable updated"} · ${batch.name}`,
        html: emailLayout({ heading: title, bodyHtml: body, previewText: esc(summary) }),
        text: `Hi ${person.name}, ${summary} See ${APP_URL}/student/live`,
      };
    };

    const jobs = [
      ...audience.learners.map((u) => () => sendMail({ to: u.email, ...mail(u, false) })),
      ...audience.team.map((u) => () => sendMail({ to: u.email, ...mail(u, true) })),
    ];
    const result = await inChunks(jobs, EMAIL_CHUNK, (job) => job());
    logger.info("class_notifications.timetable", { batchId, reason: opts.reason, ...result });
  });
}

// ── Daily: "your class is tomorrow — here is the link" ───────────────────────

/** Look this far ahead, so a class is reminded once whatever time the cron fires. */
const REMINDER_HORIZON_MS = 30 * 3_600_000;

export interface ReminderRunResult {
  classes: number;
  emailsSent: number;
  emailsFailed: number;
}

function reminderEmail(person: Person, c: ClassSnapshot, forTeam: boolean) {
  const today = istDateKey(c.scheduledStart) === istToday();
  const when = today ? "today" : "tomorrow";
  const time = formatIstTime(c.scheduledStart);
  const linkOpen = isJoinLinkOpen(c.scheduledStart);
  const online = !isOffline(c);
  const body =
    p(`Hi ${esc(person.name)},`) +
    p(
      `A reminder that <strong>“${esc(c.title)}”</strong> is ${when} at <strong>${esc(time)} IST</strong>.` +
        (online ? " Your class link is below." : ""),
    ) +
    details([
      ["When", esc(formatIstSlot(c.scheduledStart, c.scheduledEnd))],
      ["Batch", c.batchName ? esc(c.batchName) : null],
      ["Instructor", esc(c.hostName)],
      ["Where", online ? "Online live class" : esc(c.location ?? "In person at the centre")],
      ["Link", online ? `<a href="${esc(roomUrl(c))}" style="color:#4f46e5;">${esc(roomUrl(c))}</a>` : null],
    ]) +
    (online
      ? button(roomUrl(c), "Open class link") +
        (!forTeam && !linkOpen
          ? p(`The link opens at ${esc(formatIstSlot(joinLinkOpensAt(c.scheduledStart)))}.`, true)
          : "")
      : "") +
    p(`— Team ${esc(APP_NAME)}`, true);
  return {
    subject: `${today ? "Today" : "Tomorrow"}: ${c.title} at ${time} IST${online ? " — here is your link" : ""}`,
    html: emailLayout({
      heading: `Your class is ${when}`,
      bodyHtml: body,
      previewText: esc(`${c.title} · ${formatIstSlot(c.scheduledStart, c.scheduledEnd)}`),
    }),
    text: `Hi ${person.name}, "${c.title}" is ${when} at ${time} IST.${online ? ` Join: ${roomUrl(c)}` : ""}`,
  };
}

/**
 * Every class starting in the next ~30 hours that hasn't been reminded yet.
 * Each class is claimed (its `reminderSentAt` stamped) before anything is sent,
 * so a cron that fires twice can't send the same reminder twice.
 */
export async function sendClassReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  const due = await prisma.meeting.findMany({
    where: {
      status: "SCHEDULED",
      reminderSentAt: null,
      scheduledStart: { gt: now, lte: new Date(now.getTime() + REMINDER_HORIZON_MS) },
      provider: { not: "webinar" },
      OR: [{ batchId: { not: null } }, { courseId: { not: null } }],
    },
    orderBy: { scheduledStart: "asc" },
    take: 200,
    select: SNAPSHOT_SELECT,
  });

  const result: ReminderRunResult = { classes: 0, emailsSent: 0, emailsFailed: 0 };
  for (const row of due) {
    const c = toSnapshot(row);
    const claimed = await prisma.$executeRaw`
      UPDATE Meeting SET reminderSentAt = ${now}, updatedAt = ${now}
       WHERE id = ${c.id} AND reminderSentAt IS NULL`;
    if (!claimed) continue;
    result.classes += 1;

    try {
      const audience = await resolveAudience({
        batchId: c.batchId,
        courseId: c.courseId,
        meetingId: c.id,
        hostId: c.hostId,
      });
      const today = istDateKey(c.scheduledStart) === istToday(now);
      await notify({
        userIds: audience.learners.map((u) => u.id),
        type: "LIVE_CLASS",
        title: today ? "Your class is today" : "Your class is tomorrow",
        message: `“${c.title}” — ${formatIstSlot(c.scheduledStart, c.scheduledEnd)}.`,
        actionUrl: "/student/live",
      });
      const jobs = [
        ...audience.learners
          .filter((u) => u.wantsReminders)
          .map((u) => () => sendMail({ to: u.email, ...reminderEmail(u, c, false) })),
        ...audience.team.map((u) => () => sendMail({ to: u.email, ...reminderEmail(u, c, true) })),
      ];
      const sent = await inChunks(jobs, EMAIL_CHUNK, (job) => job());
      result.emailsSent += sent.sent;
      result.emailsFailed += sent.failed;
    } catch (error) {
      logger.error("class_notifications.reminder_failed", {
        meetingId: c.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

// ── Daily: festival wishes ───────────────────────────────────────────────────

export interface WishesRunResult {
  holidays: number;
  /** Holidays skipped because their (lunar) date still needs confirming. */
  heldForDateCheck: number;
  recipients: number;
  emailsSent: number;
  emailsFailed: number;
}

const NO_CLASS_LINE = "Enjoy your holiday as there is no class scheduled for today.";

function wishesEmail(
  person: Person,
  holiday: { name: string; message: string; noClasses: boolean },
  hasClassToday: boolean,
) {
  const noClassLine = holiday.noClasses && !hasClassToday ? NO_CLASS_LINE : "";
  const body =
    p(`Hi ${esc(person.name)},`) +
    p(
      holiday.message
        ? esc(holiday.message).replace(/\n/g, "<br>")
        : `Warm wishes to you and your family on ${esc(holiday.name)} from all of us at ${esc(APP_NAME)}.`,
    ) +
    (noClassLine ? p(`<strong>${noClassLine}</strong>`) : "") +
    p(`— Team ${esc(APP_NAME)}`, true);
  return {
    subject: `${holiday.name} greetings from ${APP_NAME}`,
    html: emailLayout({
      heading: `${esc(holiday.name)} greetings`,
      bodyHtml: body,
      previewText: esc(noClassLine || holiday.name),
    }),
    text: `Hi ${person.name}, ${holiday.message || `Warm wishes on ${holiday.name} from ${APP_NAME}.`}${noClassLine ? ` ${noClassLine}` : ""}`,
  };
}

/**
 * On a holiday's date, wish every active student and instructor — once. The
 * holiday is claimed (`wishesSentAt` stamped) before sending, because a double
 * send to the whole academy is worse than a missed one.
 *
 * Someone whose batch still has a class today (an admin added one by hand) is
 * not told there's no class.
 */
export async function sendFestivalWishes(now: Date = new Date()): Promise<WishesRunResult> {
  const todayKey = istToday(now);
  const result: WishesRunResult = {
    holidays: 0,
    heldForDateCheck: 0,
    recipients: 0,
    emailsSent: 0,
    emailsFailed: 0,
  };

  const holidays = await prisma.holiday.findMany({
    where: { date: dateKeyToUtcMidnight(todayKey), sendWishes: true, wishesSentAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (holidays.length === 0) return result;

  const slugs = [ROLES.STUDENT, ROLES.INSTRUCTOR];
  const dayStart = istWallClockToUtc(todayKey, "00:00");
  const dayEnd = istWallClockToUtc(addDaysToKey(todayKey, 1), "00:00");

  for (const h of holidays) {
    if (needsDateCheck(h.message)) {
      result.heldForDateCheck += 1;
      logger.warn("class_notifications.wishes_held", { holidayId: h.id, name: h.name });
      continue;
    }
    const claimed = await prisma.$executeRaw`
      UPDATE Holiday SET wishesSentAt = ${now}, updatedAt = ${now}
       WHERE id = ${h.id} AND wishesSentAt IS NULL`;
    if (!claimed) continue;
    result.holidays += 1;

    const [users, classesToday] = await Promise.all([
      prisma.user.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { role: { slug: { in: slugs } } },
            { extraRoles: { some: { role: { slug: { in: slugs } } } } },
          ],
        },
        select: PERSON_SELECT,
      }),
      prisma.meeting.findMany({
        where: {
          scheduledStart: { gte: dayStart, lt: dayEnd },
          status: { in: ["SCHEDULED", "LIVE"] },
          provider: { not: "webinar" },
        },
        select: { batchId: true, hostId: true },
      }),
    ]);

    // Who actually has a class today despite the holiday.
    const busy = new Set(classesToday.map((m) => m.hostId));
    const busyBatches = [...new Set(classesToday.map((m) => m.batchId).filter((b): b is string => !!b))];
    if (busyBatches.length) {
      const [enrolled, associates, leads] = await Promise.all([
        prisma.enrollment.findMany({
          where: { batchId: { in: busyBatches }, status: "ACTIVE" },
          select: { userId: true },
        }),
        prisma.batchInstructor.findMany({
          where: { batchId: { in: busyBatches } },
          select: { userId: true },
        }),
        prisma.batch.findMany({ where: { id: { in: busyBatches } }, select: { instructorId: true } }),
      ]);
      for (const e of enrolled) busy.add(e.userId);
      for (const a of associates) busy.add(a.userId);
      for (const b of leads) if (b.instructorId) busy.add(b.instructorId);
    }

    const people = toPeople(users);
    result.recipients += people.length;
    const holiday = { name: h.name, message: stripDateCheck(h.message), noClasses: h.noClasses };

    // Two writes: the "no class today" line only for people it is true for.
    const wish = holiday.message || `Warm wishes on ${h.name} from ${APP_NAME}.`;
    const free = people.filter((u) => !busy.has(u.id));
    const withClass = people.filter((u) => busy.has(u.id));
    await notify({
      userIds: free.map((u) => u.id),
      type: "ANNOUNCEMENT",
      title: `${h.name} greetings`,
      message: h.noClasses ? `${wish} ${NO_CLASS_LINE}` : wish,
    });
    await notify({
      userIds: withClass.map((u) => u.id),
      type: "ANNOUNCEMENT",
      title: `${h.name} greetings`,
      message: wish,
    });

    const sent = await inChunks(
      people.filter((u) => u.wantsAnnouncements),
      EMAIL_CHUNK,
      (u) => sendMail({ to: u.email, ...wishesEmail(u, holiday, busy.has(u.id)) }),
    );
    result.emailsSent += sent.sent;
    result.emailsFailed += sent.failed;
  }
  return result;
}
