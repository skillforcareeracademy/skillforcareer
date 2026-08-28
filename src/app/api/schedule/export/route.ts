import { withRoute } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/api-guard";
import { ROLES } from "@/config/roles";
import { AppError } from "@/lib/api/errors";
import { csvResponse, toCsv } from "@/lib/csv";
import {
  getScheduleWindow,
  scheduleToRows,
  type ScheduleEventType,
} from "@/server/services/schedule-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["LIVE", "OFFLINE", "ASSIGNMENT", "BATCH"] as const;

function eventType(raw: string | null): ScheduleEventType | "all" {
  return TYPES.includes(raw as ScheduleEventType) ? (raw as ScheduleEventType) : "all";
}

/**
 * Download the schedule as a spreadsheet.
 *
 * An instructor gets their own timetable, not the whole academy's — the same
 * scoping the Schedule page itself uses.
 */
export const GET = withRoute(async (req) => {
  const user = await requireApiUser();
  const staff = user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN;
  if (!staff && user.role !== ROLES.INSTRUCTOR) {
    throw AppError.forbidden("You don't have access to the schedule.");
  }

  const sp = new URL(req.url).searchParams;
  const events = await getScheduleWindow(
    staff ? {} : { instructorId: user.id, base: "/instructor" },
  );

  const { headers, data } = scheduleToRows(events, eventType(sp.get("type")));
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`schedule-${stamp}.csv`, toCsv(headers, data));
});
