import { z } from "zod";
import { optionalMediaUrl } from "./url";

const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // datetime-local

export const webinarSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  /** The one-line subject, shown above the agenda on the public page. */
  topic: z.string().trim().max(200).optional().or(z.literal("")),
  /** What gets covered, session by session. */
  agenda: z.string().trim().max(4000).optional().or(z.literal("")),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  hostName: z.string().trim().min(2, "Enter the presenter's name").max(80),
  scheduledStart: z.string().regex(DT, "Start date & time is required"),
  durationMinutes: z.coerce.number().int().min(5).max(600).default(60),
  coverImageUrl: optionalMediaUrl,
  joinUrl: optionalMediaUrl,
  capacity: z.coerce.number().int().min(1).max(1_000_000).optional(),
  attendanceDiscountPercent: z.coerce.number().int().min(0).max(100).default(5),
  isPublished: z.boolean().default(false),
});

export const registerWebinarSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email").max(120),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
});

/**
 * Adding participants by hand after the fact: either existing learners (by id)
 * or walk-ins typed in as a name and email.
 */
export const webinarParticipantsSchema = z.object({
  userIds: z.array(z.string().min(1)).max(500).optional(),
  guests: z
    .array(
      z.object({
        name: z.string().trim().min(2, "Enter a name").max(80),
        email: z.string().trim().email("Enter a valid email").max(120),
        phone: z.string().trim().max(20).optional().or(z.literal("")),
      }),
    )
    .max(100)
    .optional(),
});

/** Heartbeat from the webinar room: seconds watched so far this session. */
export const webinarPresenceSchema = z.object({
  seconds: z.coerce.number().int().min(0).max(24 * 60 * 60),
});

export type WebinarInput = z.infer<typeof webinarSchema>;
export type RegisterWebinarInput = z.infer<typeof registerWebinarSchema>;
export type WebinarParticipantsInput = z.infer<typeof webinarParticipantsSchema>;
