import { z } from "zod";

export const PAYMENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PAID",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;
export const PAYMENT_PROVIDERS = ["RAZORPAY", "STRIPE", "WALLET", "MANUAL"] as const;

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};
export const PAYMENT_PROVIDER_LABEL: Record<string, string> = {
  RAZORPAY: "Razorpay",
  STRIPE: "Stripe",
  WALLET: "Wallet",
  MANUAL: "Manual",
};

export const PAYMENT_TYPES = ["ONE_TIME", "EMI"] as const;

export const PAYMENT_METHODS = ["UPI", "ONLINE", "CASH", "EMI"] as const;
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  UPI: "UPI",
  ONLINE: "Online (gateway)",
  CASH: "Cash",
  EMI: "EMI (installments)",
};

export const PAYMENT_ACCOUNT_KINDS = ["RAZORPAY", "UPI_QR", "BANK", "CASH", "OTHER"] as const;
export const PAYMENT_ACCOUNT_KIND_LABEL: Record<string, string> = {
  RAZORPAY: "Razorpay (official)",
  UPI_QR: "UPI / QR",
  BANK: "Bank transfer",
  CASH: "Cash",
  OTHER: "Other",
};

export const recordPaymentSchema = z.object({
  userId: z.string().min(1, "Choose a learner"),
  courseId: z.string().optional().or(z.literal("")),
  amount: z.coerce.number().min(1, "Enter an amount").max(10_000_000),
  status: z.enum(PAYMENT_STATUSES).default("PAID"),
  provider: z.enum(PAYMENT_PROVIDERS).default("MANUAL"),
  method: z.enum(PAYMENT_METHODS).optional(),
  accountId: z.string().optional().or(z.literal("")),
  // Actual date/time the money was received (admin may backdate a cash/QR
  // payment recorded a day later). ISO string; blank → "now" on PAID.
  paidAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  couponCode: z.string().trim().max(30).optional().or(z.literal("")),
  type: z.enum(PAYMENT_TYPES).default("ONE_TIME"),
  installments: z.coerce.number().int().min(2).max(24).optional(),
});

export const paymentAccountSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  kind: z.enum(PAYMENT_ACCOUNT_KINDS).default("UPI_QR"),
  identifier: z.string().trim().max(140).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const setPaymentStatusSchema = z.object({
  status: z.enum(PAYMENT_STATUSES),
});

export const refundSchema = z.object({
  amount: z.coerce.number().min(1, "Enter a refund amount"),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
export type PaymentAccountInput = z.infer<typeof paymentAccountSchema>;
