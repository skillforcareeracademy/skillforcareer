/**
 * When a learner gets a class's join link.
 *
 * The client asked for the link to "be automatically generated 24 hours before
 * the class timing". Every class already has its room code from the moment it
 * is scheduled (staff need it), so "generated" here means *released*: learners
 * don't see the code, the button or a working room until this window opens.
 * The daily reminder email carries the link on the same schedule.
 *
 * Pure — used by the student list, the room page and the emails alike.
 */

export const JOIN_LINK_LEAD_HOURS = 24;
const LEAD_MS = JOIN_LINK_LEAD_HOURS * 3_600_000;

/** The moment a learner can first see the link for a class. */
export function joinLinkOpensAt(scheduledStart: Date | string): Date {
  const start = typeof scheduledStart === "string" ? new Date(scheduledStart) : scheduledStart;
  return new Date(start.getTime() - LEAD_MS);
}

/** Whether the link is released yet. */
export function isJoinLinkOpen(scheduledStart: Date | string, now: Date = new Date()): boolean {
  return joinLinkOpensAt(scheduledStart).getTime() <= now.getTime();
}
