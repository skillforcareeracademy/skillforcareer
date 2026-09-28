import { z } from "zod";

/**
 * Study material — the reading a course sets.
 *
 * Shaped like the quiz validations on purpose: the academy groups, numbers and
 * assigns material exactly as it does its papers, and a panel that behaves the
 * same in both places needs no explaining.
 */

export const materialCategorySchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(80),
  /** Set to nest it under a category; a sub-category can't hold its own. */
  parentId: z.string().trim().optional().or(z.literal("")),
});

export const studyMaterialSchema = z.object({
  title: z.string().trim().min(2, "Give it a title").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  courseId: z.string().trim().optional().or(z.literal("")),
  categoryId: z.string().trim().optional().or(z.literal("")),
  subCategoryId: z.string().trim().optional().or(z.literal("")),
  /** An uploaded document, or nothing when the material is written in the panel. */
  fileUrl: z.string().trim().max(500).optional().or(z.literal("")),
  fileName: z.string().trim().max(200).optional().or(z.literal("")),
  mimeType: z.string().trim().max(120).optional().or(z.literal("")),
  /** Text written in the panel — this is what a learner can highlight. */
  body: z.string().max(200_000).optional().or(z.literal("")),
  downloadsEnabled: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  /** Empty both = everyone on the course, as with quizzes. */
  batchIds: z.array(z.string().min(1)).max(200).optional(),
  studentIds: z.array(z.string().min(1)).max(2000).optional(),
});

export const materialHighlightSchema = z.object({
  quote: z.string().trim().min(1).max(4000),
  startOffset: z.number().int().min(0).max(1_000_000).optional(),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  color: z.enum(["yellow", "green", "blue", "pink"]).optional(),
});

export const materialReadSchema = z.object({
  seconds: z.number().min(0).max(600).optional(),
  opened: z.boolean().optional(),
});

export const HIGHLIGHT_COLORS = [
  { value: "yellow", label: "Yellow", swatch: "bg-amber-200" },
  { value: "green", label: "Green", swatch: "bg-emerald-200" },
  { value: "blue", label: "Blue", swatch: "bg-sky-200" },
  { value: "pink", label: "Pink", swatch: "bg-pink-200" },
] as const;

export type MaterialCategoryInput = z.infer<typeof materialCategorySchema>;
export type StudyMaterialInput = z.infer<typeof studyMaterialSchema>;
export type MaterialHighlightInput = z.infer<typeof materialHighlightSchema>;
