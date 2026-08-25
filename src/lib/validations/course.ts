import { z } from "zod";
import { optionalMediaUrl } from "./url";

export const COURSE_LEVELS = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "ALL_LEVELS",
] as const;
export const DELIVERY_MODES = ["SELF_PACED", "LIVE", "HYBRID", "OFFLINE"] as const;
export const PRICING_TYPES = ["FREE", "PAID", "SUBSCRIPTION"] as const;

const stringList = z.array(z.string().trim().min(1)).max(20).optional();

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
  level: z.enum(COURSE_LEVELS),
  deliveryMode: z.enum(DELIVERY_MODES),
  language: z.string().trim().max(20).default("en"),
  pricingType: z.enum(PRICING_TYPES),
  price: z.coerce.number().min(0).max(9_999_999).default(0),
  discountPrice: z.coerce.number().min(0).max(9_999_999).optional(),
  tags: stringList,
  requirements: stringList,
  objectives: stringList,
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
