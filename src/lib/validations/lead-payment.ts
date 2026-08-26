import { z } from "zod";
import { PAYMENT_METHODS, PAYMENT_TYPES } from "./payment";

/**
 * Taking money against a CRM lead.
 *
 * Two routes, one shape underneath: the counsellor either records a payment
 * that already happened (cash at the desk, a UPI transfer they can see), or
 * raises a link for the lead to pay themselves. Both convert the lead into a
 * learner account, so both need an email to create it with.
 */

const amount = z.coerce
  .number()
  .positive("Enter an amount greater than zero")
  .max(10_000_000, "That amount looks wrong");

/**
 * A learner account is keyed by email, so conversion can't happen without one.
 * Prefilled from the lead where it has one; asked for where it doesn't.
 */
const studentEmail = z
  .string()
  .trim()
  .email("A learner account needs a valid email to sign in with")
  .max(120);

export const collectLeadPaymentSchema = z.object({
  email: studentEmail,
  courseId: z.string().trim().max(40).optional().or(z.literal("")),
  amount,
  method: z.enum(PAYMENT_METHODS),
  type: z.enum(PAYMENT_TYPES).default("ONE_TIME"),
  installments: z.coerce.number().int().min(2).max(60).optional(),
  accountId: z.string().trim().max(40).optional().or(z.literal("")),
  /** Cash taken yesterday and entered today still belongs to yesterday. */
  paidAt: z.string().trim().max(30).optional().or(z.literal("")),
});

export const leadPaymentLinkSchema = z.object({
  email: studentEmail,
  courseId: z.string().trim().max(40).optional().or(z.literal("")),
  amount,
  /** Links go stale — an old one shouldn't still take money at last year's fee. */
  expiresInDays: z.coerce.number().int().min(1).max(90).default(7),
});

export const linkCheckoutVerifySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export type CollectLeadPaymentInput = z.infer<typeof collectLeadPaymentSchema>;
export type LeadPaymentLinkInput = z.infer<typeof leadPaymentLinkSchema>;
export type LinkCheckoutVerifyInput = z.infer<typeof linkCheckoutVerifySchema>;
