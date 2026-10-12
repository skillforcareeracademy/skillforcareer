import { z } from "zod";

/**
 * A curriculum, as the academy fills it in: a title, the year, its sections,
 * and the courses and batches it is for.
 */
export const curriculumTabSchema = z.object({
  heading: z.string().trim().min(1, "Give the section a heading").max(150),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  /**
   * Which section this one sits inside, as an index into the same array.
   * Sent as a position rather than an id because a section being written for
   * the first time has no id yet — the service turns these into real parents
   * once the rows exist. Null, or anything out of range, is top level.
   */
  parent: z.number().int().min(0).max(49).nullable().default(null),
  /** Something to open from the section, kept inside the panel by default. */
  linkUrl: z.string().trim().max(1000).optional().or(z.literal("")),
  linkLabel: z.string().trim().max(120).optional().or(z.literal("")),
  linkInApp: z.boolean().default(true),
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
