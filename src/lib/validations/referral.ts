import { z } from "zod";

/** The referral programme's own settings, saved from the Referral System page. */
export const referralSettingsSchema = z.object({
  referralEnabled: z.boolean(),
  referralRewardAmount: z.coerce.number().int().min(0).max(1_000_000),
  referralDiscountAmount: z.coerce.number().int().min(0).max(1_000_000),
  walletWithdrawalsEnabled: z.boolean(),
  walletMinWithdrawal: z.coerce.number().int().min(0).max(1_000_000),
});

/** Giving a learner a code from the panel. Blank `code` generates one. */
export const createReferralCodeSchema = z.object({
  userId: z.string().min(1, "Pick a learner"),
  code: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9-]*$/, "Letters, numbers and dashes only")
    .optional()
    .or(z.literal("")),
});

/** What an admin can do to a single referral. */
export const referralActionSchema = z.object({
  action: z.enum(["PAY", "CANCEL"]),
});

export type ReferralSettingsInput = z.infer<typeof referralSettingsSchema>;
