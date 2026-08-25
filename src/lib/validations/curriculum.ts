import { z } from "zod";
import { optionalMediaUrl } from "./url";

export const LESSON_TYPES = [
  "VIDEO",
  "ARTICLE",
  "PDF",
  "QUIZ",
  "ASSIGNMENT",
  "LIVE",
] as const;

export const chapterSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

export const lessonSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(160),
  type: z.enum(LESSON_TYPES).default("VIDEO"),
  videoUrl: optionalMediaUrl,
  content: z.string().max(50_000).optional().or(z.literal("")),
  attachmentUrl: optionalMediaUrl,
  durationSeconds: z.coerce.number().int().min(0).max(360_000).default(0),
  isPreview: z.boolean().default(false),
});

export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export type ChapterInput = z.infer<typeof chapterSchema>;
export type LessonInput = z.infer<typeof lessonSchema>;
