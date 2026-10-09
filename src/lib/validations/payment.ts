import { z } from "zod";

export const PAYMENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PAID",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "NO_DUE",
  "DUE",
  "DEFAULTED",
  "DISCONTINUED",
] as const;
export const PAYMENT_PROVIDERS = [
  "RAZORPAY",
  "STRIPE",
  "WALLET",
  "MANUAL",
] as const;

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Full refund",
  PARTIALLY_REFUNDED: "Partial refund",
  NO_DUE: "No pending due",
  DUE: "Payment due",
  DEFAULTED: "Payment defaulted",
  DISCONTINUED: "Course discontinued",
};

export const PAYMENT_PROVIDER_LABEL: Record<string, string> = {
  RAZORPAY: "Razorpay",
  STRIPE: "Stripe",
  WALLET: "Wallet",
  MANUAL: "Manual",
};

/**
 * What the office may set by hand, in the order it asked for them.
 *
 * PENDING and PROCESSING are left out: those belong to Razorpay, which moves a
 * payment through them on its own, and a human choosing "processing" would only
 * be overwritten by the next webhook. A refund is recorded as a refund, which
 * is what sets the two refund states.
 */
export const PAYMENT_STATUS_CHOICES = [
  "NO_DUE",
  "DUE",
  "PAID",
  "DEFAULTED",
  "FAILED",
  "DISCONTINUED",
] as const;

/** Statuses that mean nobody should be chased for money. */
export const SETTLED_STATUSES = [
  "PAID",
  "NO_DUE",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "DISCONTINUED",
] as const;

/**
 * How a fee is being paid, as the four choices the academy names them by:
 * "Payment type: Booking amount, fully paid (One time), Interest based EMI,
 * Zero Cost EMI". Underneath, the last two are both `PaymentType.EMI` and
 * differ only by `EmiPlan`, so the picker is flattened here and split again on
 * the way into the database.
 */
export const PAYMENT_PLANS = [
  "BOOKING",
  "ONE_TIME",
  "EMI_INTEREST",
  "EMI_ZERO_COST",
] as const;
export type PaymentPlan = (typeof PAYMENT_PLANS)[number];

export const PAYMENT_PLAN_LABEL: Record<PaymentPlan, string> = {
  BOOKING: "Booking amount",
  ONE_TIME: "Fully paid (one time)",
  EMI_INTEREST: "Interest-based EMI",
  EMI_ZERO_COST: "Zero-cost EMI",
};

export const isEmiPlan = (plan: PaymentPlan): boolean =>
  plan === "EMI_INTEREST" || plan === "EMI_ZERO_COST";

/** Split a picker choice back into the two columns that store it. */
export function splitPlan(plan: PaymentPlan): {
  type: "ONE_TIME" | "EMI" | "BOOKING";
  emiPlan: "ZERO_COST" | "INTEREST" | null;
} {
  switch (plan) {
    case "BOOKING":
      return { type: "BOOKING", emiPlan: null };
    case "EMI_INTEREST":
      return { type: "EMI", emiPlan: "INTEREST" };
    case "EMI_ZERO_COST":
      return { type: "EMI", emiPlan: "ZERO_COST" };
    default:
      return { type: "ONE_TIME", emiPlan: null };
  }
}

/** …and back again, for a payment being opened for editing. */
export function joinPlan(
  type: string,
  emiPlan: string | null | undefined,
): PaymentPlan {
  if (type === "BOOKING") return "BOOKING";
  if (type === "EMI")
    return emiPlan === "INTEREST" ? "EMI_INTEREST" : "EMI_ZERO_COST";
  return "ONE_TIME";
}

/**
 * How an instalment schedule is built. "There should be two option: automatic
 * calculate EMI or Manual add… if manual we need to add date and time on which
 * particular amount need to be paid."
 */
export const INSTALLMENT_MODES = ["AUTO", "MANUAL"] as const;
export type InstallmentMode = (typeof INSTALLMENT_MODES)[number];

export const PAYMENT_TYPES = ["ONE_TIME", "EMI", "BOOKING"] as const;

/**
 * How an instalment plan is priced. Zero-cost spreads the sticker price;
 * interest adds a percentage on top. Which of the two the office may offer is
 * itself a setting — "interest percentage or zero cost option can [be]
 * controlled by admin if they want to give or not".
 */
export const EMI_PLANS = ["ZERO_COST", "INTEREST"] as const;
export const EMI_PLAN_LABEL: Record<string, string> = {
  ZERO_COST: "Zero-cost EMI",
  INTEREST: "Interest-based EMI",
};

export const PAYMENT_METHODS = [
  "CASH",
  "ONLINE",
  "UPI",
  "CHEQUE",
  "BANK_TRANSFER",
  "EMI",
] as const;
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  ONLINE: "Online (Razorpay)",
  UPI: "UPI",
  CHEQUE: "Cheque",
  BANK_TRANSFER: "Bank transfer",
  EMI: "EMI (installments)",
};

export const PAYMENT_ACCOUNT_KINDS = [
  "RAZORPAY",
  "UPI_QR",
  "BANK",
  "CASH",
  "OTHER",
] as const;
export const PAYMENT_ACCOUNT_KIND_LABEL: Record<string, string> = {
  RAZORPAY: "Razorpay (official)",
  UPI_QR: "UPI / QR",
  BANK: "Bank transfer",
  CASH: "Cash",
  OTHER: "Other",
};

export const INSTALLMENT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

/** A date-time typed into the form, or left blank. */
const when = z.string().trim().max(40).optional().or(z.literal(""));

/** One row of a hand-written schedule: an amount and the day it is due. */
export const scheduledInstallmentSchema = z.object({
  amount: z.coerce.number().min(0).max(10_000_000),
  dueDate: z.string().trim().min(1, "Give the instalment a date"),
});

/** The terms a plan runs on, shared by recording and editing. */
const feeTerms = {
  /** Blank on any of these means "use the platform setting". */
  graceDays: z.coerce.number().int().min(0).max(90).optional(),
  penaltyPercent: z.coerce.number().min(0).max(100).optional(),
  penaltyFlat: z.coerce.number().min(0).max(1_000_000).optional(),
  penaltyWaived: z.boolean().optional(),
  firstPaymentAt: when,
  lastPaymentAt: when,
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
};

const planFields = {
  plan: z.enum(PAYMENT_PLANS).default("ONE_TIME"),
  installmentMode: z.enum(INSTALLMENT_MODES).default("AUTO"),
  /** AUTO: how many instalments to spread the balance across. */
  installments: z.coerce.number().int().min(2).max(36).optional(),
  /** AUTO: the first due date, and optionally the last to spread between. */
  scheduleFrom: when,
  scheduleTo: when,
  /** MANUAL: every date and amount, written out. */
  schedule: z.array(scheduledInstallmentSchema).max(36).optional(),
  /** Ignored on a zero-cost plan; blank falls back to the platform rate. */
  interestPercent: z.coerce.number().min(0).max(60).optional(),
};

export const recordPaymentSchema = z.object({
  userId: z.string().min(1, "Choose a learner"),
  courseId: z.string().optional().or(z.literal("")),
  /** The sticker price before anything is taken off. */
  amount: z.coerce.number().min(1, "Enter an amount").max(10_000_000),
  /** Taken off the total. The percentage is worked out from the two. */
  discountAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  status: z.enum(PAYMENT_STATUSES).default("PAID"),
  provider: z.enum(PAYMENT_PROVIDERS).default("MANUAL"),
  method: z.enum(PAYMENT_METHODS).optional(),
  accountId: z.string().optional().or(z.literal("")),
  // Actual date/time the money was received (admin may backdate a cash/QR
  // payment recorded a day later). Blank → "now" on PAID.
  paidAt: when,
  couponCode: z.string().trim().max(30).optional().or(z.literal("")),
  /**
   * Money taken to hold the seat before the rest is settled — "Bus booking
   * amount daalne ka option de do." It counts as received straight away.
   */
  bookingAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  bookingAt: when,
  ...planFields,
  ...feeTerms,
});

/**
 * Editing one that already exists — "bahar se click krke field edit ka option
 * and fees edit ka option". Everything is optional: the dialog sends only what
 * the office touched, and a schedule is rewritten only when one is given.
 */
export const updatePaymentSchema = z.object({
  courseId: z.string().optional().or(z.literal("")),
  amount: z.coerce.number().min(0).max(10_000_000).optional(),
  discountAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  accountId: z.string().optional().or(z.literal("")),
  paidAt: when,
  plan: z.enum(PAYMENT_PLANS).optional(),
  installmentMode: z.enum(INSTALLMENT_MODES).optional(),
  installments: z.coerce.number().int().min(2).max(36).optional(),
  scheduleFrom: when,
  scheduleTo: when,
  schedule: z.array(scheduledInstallmentSchema).max(36).optional(),
  interestPercent: z.coerce.number().min(0).max(60).optional(),
  /**
   * Money taken to hold the seat before the rest is settled — "Bus booking
   * amount daalne ka option de do." It counts as received straight away.
   */
  bookingAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  bookingAt: when,
  ...feeTerms,
});

/** Recording money against one instalment, or moving its date. */
export const installmentUpdateSchema = z.object({
  amount: z.coerce.number().min(0).max(10_000_000).optional(),
  dueDate: when,
  status: z.enum(["SCHEDULED", "PAID", "OVERDUE", "CANCELLED"]).optional(),
  paidAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  paidAt: when,
  method: z.enum(PAYMENT_METHODS).optional(),
  /** "An option to waive off penalty if required manually." */
  penaltyWaived: z.boolean().optional(),
  note: z.string().trim().max(300).optional().or(z.literal("")),
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
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type InstallmentUpdateInput = z.infer<typeof installmentUpdateSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
export type PaymentAccountInput = z.infer<typeof paymentAccountSchema>;

/** The discount as a percentage of the total — shown live beside the boxes. */
export function discountPercent(total: number, discount: number): number {
  if (!total || total <= 0 || discount <= 0) return 0;
  return Math.round((discount / total) * 1000) / 10;
}

/**
 * Putting the same fee terms on many plans at once — "we should have an option
 * to set default from our end and apply to all students or batch or course
 * option should be there. Coz for every student we can not add this."
 *
 * A blank figure means "leave that one alone", so the office can change only
 * the grace period without disturbing a penalty rate it has already tuned.
 */
export const BULK_TERMS_SCOPES = ["ALL", "BATCH", "COURSE"] as const;
export type BulkTermsScope = (typeof BULK_TERMS_SCOPES)[number];

export const BULK_TERMS_SCOPE_LABEL: Record<BulkTermsScope, string> = {
  ALL: "Every learner",
  BATCH: "One batch",
  COURSE: "One course",
};

export const bulkFeeTermsSchema = z
  .object({
    scope: z.enum(BULK_TERMS_SCOPES).default("ALL"),
    /** Required by the matching scope; ignored otherwise. */
    batchId: z.string().trim().max(40).optional().or(z.literal("")),
    courseId: z.string().trim().max(40).optional().or(z.literal("")),
    graceDays: z.coerce.number().int().min(0).max(90).optional(),
    penaltyPercent: z.coerce.number().min(0).max(100).optional(),
    penaltyFlat: z.coerce.number().min(0).max(1_000_000).optional(),
    /** Leave plans that already carry their own terms exactly as they are. */
    skipCustomised: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.scope === "BATCH" && !v.batchId) {
      ctx.addIssue({ code: "custom", message: "Choose a batch", path: ["batchId"] });
    }
    if (v.scope === "COURSE" && !v.courseId) {
      ctx.addIssue({ code: "custom", message: "Choose a course", path: ["courseId"] });
    }
    if (
      v.graceDays === undefined &&
      v.penaltyPercent === undefined &&
      v.penaltyFlat === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Set at least one of the three figures",
        path: ["graceDays"],
      });
    }
  });

export type BulkFeeTermsInput = z.infer<typeof bulkFeeTermsSchema>;
