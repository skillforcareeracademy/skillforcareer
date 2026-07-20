import { z } from "zod";

export const COUPON_TYPES = ["PERCENTAGE", "FIXED"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  PERCENTAGE: "Percentage (%)",
  FIXED: "Fixed (₹)",
};

const optionalDate = z.string().trim().optional().or(z.literal(""));

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "Code is too short")
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only")
      .transform((s) => s.toUpperCase()),
    type: z.enum(COUPON_TYPES).default("PERCENTAGE"),
    value: z.coerce.number().min(0.01, "Enter a value").max(10_000_000),
    maxDiscount: z.coerce.number().min(0).max(10_000_000).optional(),
    minAmount: z.coerce.number().min(0).max(10_000_000).optional(),
    maxUses: z.coerce.number().int().min(1).max(1_000_000).optional(),
    courseId: z.string().optional().or(z.literal("")),
    isActive: z.boolean().default(true),
    startsAt: optionalDate,
    expiresAt: optionalDate,
  })
  .superRefine((c, ctx) => {
    if (c.type === "PERCENTAGE" && c.value > 100) {
      ctx.addIssue({ code: "custom", message: "Percentage can't exceed 100", path: ["value"] });
    }
  });

export const validateCouponSchema = z.object({
  code: z.string().trim().min(1),
  amount: z.coerce.number().min(0),
  courseId: z.string().optional().or(z.literal("")),
});

export type CouponInput = z.infer<typeof couponSchema>;
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
