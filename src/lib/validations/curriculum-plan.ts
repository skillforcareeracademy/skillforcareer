import { z } from "zod";

/**
 * A curriculum, as the academy fills it in: a title, the year, its sections,
 * and the courses and batches it is for.
 */
export const curriculumTabSchema = z.object({
  heading: z.string().trim().min(1, "Give the section a heading").max(150),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const curriculumSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  year: z.string().trim().max(20).optional().or(z.literal("")),
  isPublished: z.boolean().default(true),
  tabs: z.array(curriculumTabSchema).max(50).default([]),
  /** Empty means "not set for any course yet" — nobody sees it. */
  courseIds: z.array(z.string().min(1)).max(200).default([]),
  batchIds: z.array(z.string().min(1)).max(300).default([]),
});

/** The list in the order it should be numbered 1…n. */
export const reorderCurriculumsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(300),
});

export type CurriculumInput = z.infer<typeof curriculumSchema>;
export type CurriculumTabInput = z.infer<typeof curriculumTabSchema>;
