import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import { siteConfig } from "@/config/site";
import {
  createRazorpayOrder,
  razorpayKeyId,
  verifyCheckoutSignature,
} from "@/lib/razorpay";
import { bumpCourseEnrollmentCount } from "@/server/repositories/counters";
import { getRazorpayAccount } from "./payment-account-service";
import { fulfillPaidCheckout, uniqueInvoice } from "./payment-service";
import { notify, notifyStaff } from "./notification-service";
import type {
  CollectLeadPaymentInput,
  LeadPaymentLinkInput,
} from "@/lib/validations/lead-payment";

/**
 * Money against a CRM lead.
 *
 * A lead is an enquiry, not an account — but the moment it pays it has to
 * become a learner, or the payment has nothing to hang off and the admissions
 * team is back to reconciling two systems by hand. So both routes here (record
 * a payment taken at the desk, or raise a link the lead pays themselves) run
 * the same conversion first, and the lead keeps a pointer to the account it
 * became.
 */

const num = (d: Prisma.Decimal) => d.toNumber();

/** Last ten digits — the same normalisation the duplicate scan uses. */
const phoneKeyOf = (phone: string) => phone.replace(/\D/g, "").slice(-10);

// ── Reads ────────────────────────────────────────────────────────────────────

export interface LeadPaymentSummary {
  id: string;
  invoiceNumber: string;
  amount: number;
  netAmount: number;
  status: string;
  method: string | null;
  courseTitle: string | null;
  paidAt: string | null;
  createdAt: string;
  /** Present while a shareable link is still live and unpaid. */
  linkUrl: string | null;
  linkExpiresAt: string | null;
}

export interface LeadPaymentContext {
  leadId: string;
  email: string | null;
  courseId: string | null;
  /** Final fees where the counsellor has agreed one, else what was offered. */
  suggestedAmount: number | null;
  student: { id: string; name: string; email: string } | null;
  payments: LeadPaymentSummary[];
  paidTotal: number;
}

function publicOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url).replace(/\/$/, "");
}

export function paymentLinkUrl(token: string): string {
  return `${publicOrigin()}/pay/${token}`;
}

function toSummary(p: {
  id: string;
  invoiceNumber: string;
  amount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  status: string;
  method: string | null;
  paidAt: Date | null;
  createdAt: Date;
  linkToken: string | null;
  linkExpiresAt: Date | null;
  course: { title: string } | null;
}): LeadPaymentSummary {
  // A spent or expired link is dead weight in the UI — only surface one the
  // counsellor could still usefully re-send.
  const linkLive =
    p.linkToken != null &&
    p.status !== "PAID" &&
    (p.linkExpiresAt == null || p.linkExpiresAt > new Date());
  return {
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    amount: num(p.amount),
    netAmount: num(p.netAmount),
    status: p.status,
    method: p.method,
    courseTitle: p.course?.title ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    linkUrl: linkLive ? paymentLinkUrl(p.linkToken as string) : null,
    linkExpiresAt: p.linkExpiresAt?.toISOString() ?? null,
  };
}

const PAYMENT_SELECT = {
  id: true,
  invoiceNumber: true,
  amount: true,
  netAmount: true,
  status: true,
  method: true,
  paidAt: true,
  createdAt: true,
  linkToken: true,
  linkExpiresAt: true,
  course: { select: { title: true } },
} as const;

/** Everything the "collect payment" panel needs, in one round trip. */
export async function leadPaymentContext(leadId: string): Promise<LeadPaymentContext> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      email: true,
      courseId: true,
      feesOffered: true,
      finalFees: true,
      convertedUser: { select: { id: true, name: true, email: true } },
      payments: { orderBy: { createdAt: "desc" }, select: PAYMENT_SELECT },
    },
  });
  if (!lead) throw AppError.notFound("Lead not found.");

  const payments = lead.payments.map(toSummary);
  return {
    leadId: lead.id,
    email: lead.email,
    courseId: lead.courseId,
    suggestedAmount:
      lead.finalFees != null
        ? num(lead.finalFees)
        : lead.feesOffered != null
          ? num(lead.feesOffered)
          : null,
    student: lead.convertedUser,
    payments,
    paidTotal: payments
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + p.netAmount, 0),
  };
}

// ── Conversion ───────────────────────────────────────────────────────────────

/**
 * Find or create the learner account behind a lead, and remember the link.
 *
 * Matching is by email first and then by phone: the same person often enquires
 * with a bare number and later gives an address, and creating a second account
 * would split their attendance and certificates across two records. The account
 * is created without a password — nobody should be inventing one on a learner's
 * behalf — so the learner sets theirs through "Forgot password".
 */
export async function convertLeadToStudent(
  leadId: string,
  email: string,
): Promise<{ userId: string; created: boolean }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      convertedUserId: true,
    },
  });
  if (!lead) throw AppError.notFound("Lead not found.");
  if (lead.convertedUserId) {
    return { userId: lead.convertedUserId, created: false };
  }

  const address = email.trim().toLowerCase();
  const existing =
    (await prisma.user.findUnique({ where: { email: address }, select: { id: true } })) ??
    (await findUserByPhone(lead.phone));

  let userId = existing?.id ?? null;
  let created = false;

  if (!userId) {
    const studentRole = await prisma.role.findUnique({
      where: { slug: ROLES.STUDENT },
      select: { id: true },
    });
    if (!studentRole) {
      throw AppError.internal("Default role missing. Run `npm run db:seed`.");
    }
    const user = await prisma.user.create({
      data: {
        name: lead.name,
        email: address,
        phone: lead.phone,
        roleId: studentRole.id,
        // A counsellor has spoken to this person and taken their money, so the
        // address is as verified as an OTP would make it. ACTIVE, with no
        // password: the learner sets one via the reset flow.
        status: "ACTIVE",
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    userId = user.id;
    created = true;
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      convertedUserId: userId,
      convertedAt: new Date(),
      // Keep the lead's own email in step, so the CRM row and the account agree.
      ...(lead.email ? {} : { email: address }),
    },
  });

  return { userId, created };
}

async function findUserByPhone(phone: string): Promise<{ id: string } | null> {
  const key = phoneKeyOf(phone);
  if (key.length < 10) return null;
  // Numbers are stored as typed, so the match is on the last ten digits.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM \`User\`
    WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 10) = ${key}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Move the lead to Converted once money has actually landed. */
async function markConverted(leadId: string): Promise<void> {
  await prisma.lead.updateMany({
    where: { id: leadId, stage: { not: "CONVERTED" } },
    data: { stage: "CONVERTED", status: "CONVERTED", subStatus: "Admission Done" },
  });
}

async function resolveCourse(courseId: string | undefined | null) {
  if (!courseId) return null;
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true },
  });
  if (!course) throw AppError.badRequest("That course no longer exists.");
  return course;
}

// ── Collecting ───────────────────────────────────────────────────────────────

/**
 * Record a payment the counsellor has already taken (cash, UPI, transfer) and
 * enrol the learner against it.
 */
export async function collectLeadPayment(
  leadId: string,
  input: CollectLeadPaymentInput,
): Promise<{ paymentId: string; userId: string; studentCreated: boolean }> {
  const course = await resolveCourse(input.courseId);
  const { userId, created } = await convertLeadToStudent(leadId, input.email);

  let accountId: string | null = null;
  if (input.accountId) {
    const account = await prisma.paymentAccount.findUnique({
      where: { id: input.accountId },
      select: { id: true },
    });
    if (!account) throw AppError.badRequest("Selected payment account no longer exists.");
    accountId = account.id;
  }

  const invoiceNumber = await uniqueInvoice(new Date().getFullYear());
  const payment = await prisma.payment.create({
    data: {
      userId,
      leadId,
      courseId: course?.id ?? null,
      accountId,
      invoiceNumber,
      amount: new Prisma.Decimal(input.amount),
      discountAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(input.amount),
      currency: "INR",
      status: "PAID",
      provider: "MANUAL",
      type: input.type,
      method: input.method,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
    },
    select: { id: true },
  });

  if (course) await enrol(userId, course.id, payment.id);
  if (input.type === "EMI" && input.installments && input.installments >= 2) {
    await scheduleInstallments(payment.id, input.amount, input.installments);
  }
  await markConverted(leadId);

  const amount = `₹${input.amount.toLocaleString("en-IN")}`;
  await Promise.all([
    notify({
      userIds: [userId],
      type: "PAYMENT",
      title: "Payment received",
      message: `We've recorded your payment of ${amount}. Invoice ${invoiceNumber}.`,
      actionUrl: "/student/profile",
    }),
    notifyStaff({
      type: "PAYMENT",
      title: "Admission payment recorded",
      message: `${amount} collected against a lead. Invoice ${invoiceNumber}.`,
      actionUrl: "/admin/payments",
    }),
  ]);

  return { paymentId: payment.id, userId, studentCreated: created };
}

/** Enrol without double-counting when the learner is already on the course. */
async function enrol(userId: string, courseId: string, paymentId: string): Promise<void> {
  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  let enrollmentId = existing?.id ?? null;
  if (!existing) {
    const e = await prisma.enrollment.create({
      data: { userId, courseId, status: "ACTIVE", source: "PURCHASE" },
      select: { id: true },
    });
    enrollmentId = e.id;
    await bumpCourseEnrollmentCount(courseId, 1);
  }
  await prisma.payment.update({ where: { id: paymentId }, data: { enrollmentId } });
}

async function scheduleInstallments(
  paymentId: string,
  total: number,
  count: number,
): Promise<void> {
  const per = Math.floor((total / count) * 100) / 100;
  const rows = Array.from({ length: count }, (_, i) => {
    const due = new Date();
    due.setMonth(due.getMonth() + i + 1);
    // Last installment absorbs the rounding remainder.
    const amount = i === count - 1 ? Math.round((total - per * (count - 1)) * 100) / 100 : per;
    return {
      paymentId,
      installmentNo: i + 1,
      amount: new Prisma.Decimal(amount),
      dueDate: due,
      status: "SCHEDULED" as const,
    };
  });
  await prisma.installment.createMany({ data: rows });
}

// ── Payment links ────────────────────────────────────────────────────────────

/**
 * Raise a shareable "pay now" link.
 *
 * The token is the only credential the page will ask for, so it is 32 bytes of
 * randomness and it addresses exactly one payment for one amount — a leaked
 * link can pay that invoice and nothing else.
 */
export async function createLeadPaymentLink(
  leadId: string,
  input: LeadPaymentLinkInput,
): Promise<{ paymentId: string; url: string; expiresAt: string }> {
  const course = await resolveCourse(input.courseId);
  const { userId } = await convertLeadToStudent(leadId, input.email);

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
  const razorAccount = await getRazorpayAccount();
  const invoiceNumber = await uniqueInvoice(new Date().getFullYear());

  const payment = await prisma.payment.create({
    data: {
      userId,
      leadId,
      courseId: course?.id ?? null,
      accountId: razorAccount?.id ?? null,
      invoiceNumber,
      amount: new Prisma.Decimal(input.amount),
      discountAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(input.amount),
      currency: "INR",
      status: "PENDING",
      provider: "RAZORPAY",
      type: "ONE_TIME",
      method: "ONLINE",
      linkToken: token,
      linkExpiresAt: expiresAt,
    },
    select: { id: true },
  });

  return {
    paymentId: payment.id,
    url: paymentLinkUrl(token),
    expiresAt: expiresAt.toISOString(),
  };
}

export interface PaymentLinkView {
  token: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  expired: boolean;
  studentName: string;
  studentEmail: string;
  courseTitle: string | null;
  razorpayReady: boolean;
}

/** Public read for /pay/[token] — deliberately shows no more than the payer needs. */
export async function getPaymentLink(token: string): Promise<PaymentLinkView> {
  const payment = await prisma.payment.findUnique({
    where: { linkToken: token },
    select: {
      invoiceNumber: true,
      netAmount: true,
      currency: true,
      status: true,
      linkExpiresAt: true,
      course: { select: { title: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!payment) throw AppError.notFound("This payment link is not valid.");

  return {
    token,
    invoiceNumber: payment.invoiceNumber,
    amount: num(payment.netAmount),
    currency: payment.currency,
    status: payment.status,
    expired: payment.linkExpiresAt != null && payment.linkExpiresAt < new Date(),
    studentName: payment.user.name,
    studentEmail: payment.user.email,
    courseTitle: payment.course?.title ?? null,
    razorpayReady: razorpayKeyId() != null,
  };
}

/** Open a Razorpay order for a link. Safe to call again — a fresh order each time. */
export async function startLinkCheckout(token: string): Promise<{
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string | null;
  prefill: { name: string; email: string };
}> {
  const payment = await prisma.payment.findUnique({
    where: { linkToken: token },
    select: {
      id: true,
      invoiceNumber: true,
      netAmount: true,
      status: true,
      courseId: true,
      userId: true,
      linkExpiresAt: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!payment) throw AppError.notFound("This payment link is not valid.");
  if (payment.status === "PAID") throw AppError.badRequest("This invoice is already paid.");
  if (payment.linkExpiresAt && payment.linkExpiresAt < new Date()) {
    throw AppError.badRequest("This payment link has expired. Ask for a new one.");
  }

  const amountPaise = Math.round(num(payment.netAmount) * 100);
  const order = await createRazorpayOrder({
    amountPaise,
    currency: "INR",
    receipt: payment.invoiceNumber,
    notes: { paymentId: payment.id, userId: payment.userId },
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerOrderId: order.id },
  });

  return {
    paymentId: payment.id,
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    keyId: razorpayKeyId(),
    prefill: { name: payment.user.name, email: payment.user.email },
  };
}

/**
 * Confirm a link payment. Verification is by token *and* signature, so the
 * caller has to hold the link and a genuine Razorpay receipt — the same bar the
 * signed-in checkout clears, without needing a session.
 */
export async function verifyLinkCheckout(
  token: string,
  input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
): Promise<{ status: "PAID" }> {
  const payment = await prisma.payment.findUnique({
    where: { linkToken: token },
    select: { id: true, providerOrderId: true, leadId: true },
  });
  if (!payment) throw AppError.notFound("This payment link is not valid.");
  if (payment.providerOrderId !== input.razorpayOrderId) {
    throw AppError.badRequest("Order mismatch.");
  }

  const valid = verifyCheckoutSignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
  });
  if (!valid) throw AppError.badRequest("Payment verification failed.");

  // Same fulfilment path as an in-app checkout: enrols, credits the coupon,
  // notifies, and refuses to run twice.
  await fulfillPaidCheckout(payment.id, input.razorpayPaymentId);

  return { status: "PAID" };
}
