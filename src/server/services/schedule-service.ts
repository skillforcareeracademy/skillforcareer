import { addDays, format } from "date-fns";
import { prisma } from "@/lib/prisma";

export type ScheduleEventType = "LIVE" | "OFFLINE" | "ASSIGNMENT" | "BATCH";

export interface ScheduleEvent {
  id: string;
  type: ScheduleEventType;
  title: string;
  at: string; // ISO
  end: string | null;
  context: string | null;
  status: string | null;
  /** null when the viewer has nowhere to go — the event still shows, unlinked. */
  url: string | null;
}

/** Aggregate time-based events across the platform for the given window. */
export interface ScheduleScope {
  /** Restrict to one instructor's meetings/assignments/batches. */
  instructorId?: string;
  /** Route prefix for assignment/batch links (default "/admin"). */
  base?: string;
}

export async function getScheduleEvents(
  from: Date,
  to: Date,
  scope: ScheduleScope = {},
): Promise<ScheduleEvent[]> {
  const inst = scope.instructorId;
  const base = scope.base ?? "/admin";
  const [meetings, assignments, batches] = await Promise.all([
    prisma.meeting.findMany({
      where: { scheduledStart: { gte: from, lte: to }, ...(inst ? { hostId: inst } : {}) },
      select: {
        id: true,
        title: true,
        roomCode: true,
        provider: true,
        location: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        course: { select: { title: true } },
        batch: { select: { name: true } },
      },
    }),
    prisma.assignment.findMany({
      where: {
        dueDate: { gte: from, lte: to },
        ...(inst ? { course: { instructorId: inst } } : {}),
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        course: { select: { title: true } },
      },
    }),
    prisma.batch.findMany({
      where: {
        OR: [
          { startDate: { gte: from, lte: to } },
          { endDate: { gte: from, lte: to } },
        ],
        ...(inst ? { instructorId: inst } : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        course: { select: { title: true } },
      },
    }),
  ]);

  const events: ScheduleEvent[] = [];

  for (const m of meetings) {
    // Offline classes are Meetings too (provider "offline"); without this they
    // were counted and coloured as live classes, and clicking one opened a
    // video room instead of the class.
    const isOffline = m.provider === "offline";
    events.push({
      id: `m-${m.id}`,
      type: isOffline ? "OFFLINE" : "LIVE",
      title: m.title,
      at: m.scheduledStart.toISOString(),
      end: m.scheduledEnd ? m.scheduledEnd.toISOString() : null,
      context: isOffline
        ? (m.location ?? m.batch?.name ?? m.course?.title ?? null)
        : (m.batch?.name ?? m.course?.title ?? null),
      status: m.status,
      // Offline classes are managed under /admin only (nav scopes them to
      // staff), so an instructor sees the event but gets no dead link.
      url: isOffline
        ? base === "/admin"
          ? `${base}/offline`
          : null
        : `/live/room/${m.roomCode}`,
    });
  }
  for (const a of assignments) {
    if (!a.dueDate) continue;
    events.push({
      id: `a-${a.id}`,
      type: "ASSIGNMENT",
      title: `${a.title} — due`,
      at: a.dueDate.toISOString(),
      end: null,
      context: a.course?.title ?? null,
      status: null,
      url: `${base}/assignments`,
    });
  }
  for (const b of batches) {
    if (b.startDate && b.startDate >= from && b.startDate <= to) {
      events.push({
        id: `bs-${b.id}`,
        type: "BATCH",
        title: `${b.name} begins`,
        at: b.startDate.toISOString(),
        end: null,
        context: b.course?.title ?? null,
        status: b.status,
        url: `${base}/batches`,
      });
    }
    if (b.endDate && b.endDate >= from && b.endDate <= to) {
      events.push({
        id: `be-${b.id}`,
        type: "BATCH",
        title: `${b.name} ends`,
        at: b.endDate.toISOString(),
        end: null,
        context: b.course?.title ?? null,
        status: b.status,
        url: `${base}/batches`,
      });
    }
  }

  events.sort((x, y) => x.at.localeCompare(y.at));
  return events;
}

/** Default window: last month → next ~5 months (covers the visible calendar). */
export async function getScheduleWindow(scope: ScheduleScope = {}): Promise<ScheduleEvent[]> {
  const now = new Date();
  return getScheduleEvents(addDays(now, -31), addDays(now, 150), scope);
}

const TYPE_LABELS: Record<ScheduleEventType, string> = {
  LIVE: "Live class",
  OFFLINE: "Offline class",
  ASSIGNMENT: "Assignment",
  BATCH: "Batch",
};

/**
 * The schedule as a spreadsheet — one row per event, in the order the agenda
 * shows them.
 *
 * Asked for directly ("here should be a download schedule option"): the office
 * prints the week's timetable and puts it on the wall, and re-typing it out of
 * the calendar was the alternative. `type` narrows it to the same filter the
 * page is showing, so the download matches what the admin is looking at.
 */
export function scheduleToRows(
  events: ScheduleEvent[],
  type?: ScheduleEventType | "all",
): { headers: string[]; data: string[][] } {
  const filtered =
    !type || type === "all" ? events : events.filter((e) => e.type === type);

  const headers = ["Date", "Day", "Start", "End", "Type", "Title", "Course / batch", "Status"];

  const data = filtered.map((e) => {
    const at = new Date(e.at);
    const end = e.end ? new Date(e.end) : null;
    return [
      format(at, "yyyy-MM-dd"),
      format(at, "EEEE"),
      format(at, "HH:mm"),
      end ? format(end, "HH:mm") : "",
      TYPE_LABELS[e.type],
      e.title,
      e.context ?? "",
      e.status ?? "",
    ];
  });

  return { headers, data };
}

export interface ScheduleStats {
  thisWeek: number;
  liveClasses: number;
  offlineClasses: number;
  assignmentsDue: number;
  batchesOngoing: number;
}

const OFFLINE = { provider: "offline" };
const ONLINE = { provider: { not: "offline" } };

export async function scheduleStats(instructorId?: string): Promise<ScheduleStats> {
  const now = new Date();
  const wk = addDays(now, 7);
  const mScope = instructorId ? { hostId: instructorId } : {};
  const aScope = instructorId ? { course: { instructorId } } : {};
  const bScope = instructorId ? { instructorId } : {};
  const [liveWk, dueWk, startWk, endWk, liveUpcoming, offlineUpcoming, dueUpcoming, ongoing] =
    await Promise.all([
      prisma.meeting.count({ where: { scheduledStart: { gte: now, lte: wk }, ...mScope } }),
      prisma.assignment.count({ where: { dueDate: { gte: now, lte: wk }, ...aScope } }),
      prisma.batch.count({ where: { startDate: { gte: now, lte: wk }, ...bScope } }),
      prisma.batch.count({ where: { endDate: { gte: now, lte: wk }, ...bScope } }),
      // Split by provider — an in-person class is not a live class, and lumping
      // them together made the "Live classes" tile overcount.
      prisma.meeting.count({
        where: { scheduledStart: { gte: now }, status: "SCHEDULED", ...ONLINE, ...mScope },
      }),
      prisma.meeting.count({
        where: { scheduledStart: { gte: now }, status: "SCHEDULED", ...OFFLINE, ...mScope },
      }),
      prisma.assignment.count({ where: { dueDate: { gte: now }, ...aScope } }),
      prisma.batch.count({ where: { status: "ONGOING", ...bScope } }),
    ]);
  return {
    // `liveWk` already spans both kinds of class, so "This week" stays complete.
    thisWeek: liveWk + dueWk + startWk + endWk,
    liveClasses: liveUpcoming,
    offlineClasses: offlineUpcoming,
    assignmentsDue: dueUpcoming,
    batchesOngoing: ongoing,
  };
}
