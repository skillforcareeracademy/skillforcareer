import { z } from "zod";
import { optionalMediaUrl } from "./url";

export const COURSE_LEVELS = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "ALL_LEVELS",
] as const;
export const DELIVERY_MODES = [
  "SELF_PACED",
  "LIVE",
  "HYBRID",
  "OFFLINE",
] as const;
export const PRICING_TYPES = ["FREE", "PAID", "SUBSCRIPTION"] as const;

const stringList = z.array(z.string().trim().min(1)).max(20).optional();

/**
 * What the public course page shows, per course.
 *
 * The academy asked for a switch beside every figure in the hero — "ye wala
 * data mujhe website pr dikhana hai ya nhi" — and, where a real number is still
 * too small to print, somewhere to type what should stand in its place. A blank
 * stand-in means "use the live figure"; switching the row off hides it outright.
 */
export const coursePageDisplaySchema = z.object({
  showRating: z.boolean().default(true),
  showLessons: z.boolean().default(true),
  showEnrollments: z.boolean().default(true),
  showLevel: z.boolean().default(true),
  showDuration: z.boolean().default(true),
  showLanguage: z.boolean().default(true),
  showInstructor: z.boolean().default(true),

  lessonsText: z.string().trim().max(40).default(""),
  enrollmentsText: z.string().trim().max(40).default(""),
  durationText: z.string().trim().max(40).default(""),
  ratingText: z.string().trim().max(10).default(""),
  ratingCountText: z.string().trim().max(20).default(""),
  instructorName: z.string().trim().max(80).default(""),
  instructorHeadline: z.string().trim().max(160).default(""),
});

export type CoursePageDisplay = z.infer<typeof coursePageDisplaySchema>;

/** Every switch on and every stand-in blank — how the page behaved before. */
export const COURSE_DISPLAY_DEFAULTS: CoursePageDisplay =
  coursePageDisplaySchema.parse({});

/**
 * Read the stored settings, filling in anything a course saved before a switch
 * existed. Never throws: a malformed value falls back to showing everything.
 */
export function readCoursePageDisplay(value: unknown): CoursePageDisplay {
  const parsed = coursePageDisplaySchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : COURSE_DISPLAY_DEFAULTS;
}

/** Minimal create — the rest is filled in on the editor page. */
export const createCourseSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(120),
  categoryId: z.string().min(1, "Choose a category"),
});

export const updateCourseSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(120),
  subtitle: z.string().trim().max(160).optional().or(z.literal("")),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only")
    .max(140)
    .optional()
    .or(z.literal("")),
  description: z.string().max(30000).optional().or(z.literal("")),
  thumbnailUrl: optionalMediaUrl,
  promoVideoUrl: optionalMediaUrl,
  categoryId: z.string().min(1, "Choose a category"),
  /** Who the course page credits, and who owns it in the instructor workspace. */
  instructorId: z.string().min(1).optional().or(z.literal("")),
  level: z.enum(COURSE_LEVELS),
  deliveryMode: z.enum(DELIVERY_MODES),
  language: z.string().trim().max(20).default("en"),
  pricingType: z.enum(PRICING_TYPES),
  price: z.coerce.number().min(0).max(9_999_999).default(0),
  discountPrice: z.coerce.number().min(0).max(9_999_999).optional(),
  tags: stringList,
  requirements: stringList,
  objectives: stringList,
  pageDisplay: coursePageDisplaySchema.optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
