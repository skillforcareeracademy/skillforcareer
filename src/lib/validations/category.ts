import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(300)
  .optional()
  .or(z.literal(""));

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only")
    .max(60)
    .optional()
    .or(z.literal("")),
  description: optionalText,
  icon: z.string().trim().max(50).optional().or(z.literal("")),
  order: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  parentId: z.string().optional().or(z.literal("")),
});

export type CategoryInput = z.infer<typeof categorySchema>;
