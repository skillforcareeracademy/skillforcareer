import { z } from "zod";

export const MEETING_STATUSES = [
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "CANCELLED",
] as const;

export const MEETING_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  LIVE: "Live",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
};

const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // datetime-local value

const optionalDateTime = z
  .string()
  .regex(DT, "Invalid date/time")
  .optional()
  .or(z.literal(""));

export const meetingSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  hostId: z.string().min(1, "Choose a host"),
  courseId: z.string().optional().or(z.literal("")),
  batchId: z.string().optional().or(z.literal("")),
  status: z.enum(MEETING_STATUSES).default("SCHEDULED"),
  scheduledStart: z.string().regex(DT, "Start date & time is required"),
  scheduledEnd: optionalDateTime,
  maxParticipants: z.coerce.number().int().min(1).max(100000).optional(),
  isRecordingEnabled: z.boolean().default(false),
});

export const createMeetingSchema = meetingSchema;
export const updateMeetingSchema = meetingSchema;

export type MeetingInput = z.infer<typeof meetingSchema>;

export const rescheduleSchema = z.object({
  scheduledStart: z.string().regex(DT, "Start date & time is required"),
  scheduledEnd: optionalDateTime,
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "LEFT_EARLY"] as const;
export const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  LEFT_EARLY: "Left early",
};

export const offlineClassSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  courseId: z.string().optional().or(z.literal("")),
  batchId: z.string().optional().or(z.literal("")),
  scheduledStart: z.string().regex(DT, "Date & time is required"),
  scheduledEnd: optionalDateTime,
  location: z.string().trim().min(2, "Enter a venue").max(200),
});

export const meetingStudentsSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, "Pick at least one student").max(500),
});

export const markAttendanceSchema = z.object({
  records: z
    .array(z.object({ userId: z.string().min(1), status: z.enum(ATTENDANCE_STATUSES) }))
    .max(2000),
});

export type OfflineClassInput = z.infer<typeof offlineClassSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type MeetingStudentsInput = z.infer<typeof meetingStudentsSchema>;
