import { z } from "zod";
import { MEETING_STATUSES } from "./live";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

/**
 * An extra class added by hand to a batch — a make-up session, a doubt-clearing
 * hour, a class on a holiday. Date and times are academy (IST) wall-clock
 * values, the same way the batch's own timetable is entered.
 */
export const addBatchClassSchema = z.object({
  title: z.string().trim().max(150).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  startTime: time,
  endTime: time.optional().or(z.literal("")),
});

export type AddBatchClassInput = z.infer<typeof addBatchClassSchema>;

/** Body of POST /api/meetings/:id/status. `reason` is kept for a cancellation. */
export const meetingStatusSchema = z.object({
  status: z.enum(MEETING_STATUSES),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

export type MeetingStatusInput = z.infer<typeof meetingStatusSchema>;
