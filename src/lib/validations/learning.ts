import { z } from "zod";

export const progressSchema = z.object({
  position: z.coerce.number().int().min(0).max(360000).optional(),
  watched: z.coerce.number().int().min(0).max(360000).optional(),
  completed: z.boolean().optional(),
});

export const noteSchema = z.object({
  content: z.string().trim().min(1, "Note can't be empty").max(2000),
  timestampSeconds: z.coerce.number().int().min(0).max(360000).default(0),
});

export const bookmarkSchema = z.object({
  timestampSeconds: z.coerce.number().int().min(0).max(360000).default(0),
  label: z.string().trim().max(120).optional().or(z.literal("")),
});

export type ProgressInput = z.infer<typeof progressSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type BookmarkInput = z.infer<typeof bookmarkSchema>;
