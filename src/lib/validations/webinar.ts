import { z } from "zod";

const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // datetime-local
const optionalUrl = z.string().trim().max(500).optional().or(z.literal(""));

export const webinarSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  hostName: z.string().trim().min(2, "Enter the presenter's name").max(80),
  scheduledStart: z.string().regex(DT, "Start date & time is required"),
  durationMinutes: z.coerce.number().int().min(5).max(600).default(60),
  coverImageUrl: optionalUrl,
  joinUrl: optionalUrl,
  capacity: z.coerce.number().int().min(1).max(1_000_000).optional(),
  isPublished: z.boolean().default(false),
});

export const registerWebinarSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email").max(120),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
});

export type WebinarInput = z.infer<typeof webinarSchema>;
export type RegisterWebinarInput = z.infer<typeof registerWebinarSchema>;
