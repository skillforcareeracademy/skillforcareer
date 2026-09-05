import { z } from "zod";
import { emailSchema, otpSchema } from "./auth";

/**
 * The express-checkout identity step.
 *
 * A buyer gives the three things an invoice needs — name, email, phone — and
 * the account is made behind that, rather than sending them off to /register
 * first. See `identifyForCheckout` for what happens when the email is already
 * known.
 */
export const checkoutIdentifySchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .min(6, "Enter your phone number")
    .max(24, "That number looks too long"),
});

export const checkoutCodeSchema = z.object({
  email: emailSchema,
  code: otpSchema,
});

export type CheckoutIdentifyInput = z.infer<typeof checkoutIdentifySchema>;
export type CheckoutCodeInput = z.infer<typeof checkoutCodeSchema>;
