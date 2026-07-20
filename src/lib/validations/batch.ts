import { z } from "zod";

export const BATCH_STATUSES = [
  "UPCOMING",
  "ONGOING",
  "COMPLETED",
  "CANCELLED",
] as const;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const BATCH_STATUS_LABEL: Record<string, string> = {
  UPCOMING: "Upcoming",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
  .or(z.literal(""));

export const scheduleSchema = z.object({
  days: z.array(z.enum(WEEKDAYS)).max(7).default([]),
  startTime: time.default(""),
  endTime: time.default(""),
});

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .optional()
  .or(z.literal(""));

export const batchSchema = z.object({
  name: z.string().trim().min(3, "Name is too short").max(120),
  code: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9-]*$/, "Letters, numbers and hyphens only")
    .optional()
    .or(z.literal("")),
  courseId: z.string().min(1, "Choose a course"),
  instructorId: z.string().optional().or(z.literal("")),
  status: z.enum(BATCH_STATUSES).default("UPCOMING"),
  capacity: z.coerce.number().int().min(1).max(100000).optional(),
  startDate: dateStr,
  endDate: dateStr,
  schedule: scheduleSchema.optional(),
});

export const createBatchSchema = batchSchema;
export const updateBatchSchema = batchSchema;

export type BatchInput = z.infer<typeof batchSchema>;
export type BatchSchedule = z.infer<typeof scheduleSchema>;
