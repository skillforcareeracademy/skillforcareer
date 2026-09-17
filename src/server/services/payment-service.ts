import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { notify, notifyStaff } from "./notification-service";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { bumpCourseEnrollmentCount } from "@/server/repositories/counters";
import { validateCoupon } from "@/server/services/coupon-service";
import { getRazorpayAccount } from "@/server/services/payment-account-service";
import { getSettings } from "@/server/services/settings-service";
import { ACTIVITY_ACTIONS, logActivity } from "@/server/services/activity-service";
import {
  createRazorpayOrder,
  verifyCheckoutSignature,
  razorpayConfigured,
  razorpayKeyId,
} from "@/lib/razorpay";
import {
  watermarkPurchaseContext,
  waiveRecordingWatermark,
} from "@/server/services/recording-service";
import type { PublicUser } from "@/server/services/auth-service";
import type { RecordPaymentInput, RefundInput } from "@/lib/validations/payment";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Shared with the lead-payment flow, which raises its own invoices. */
export async function uniqueInvoice(year: number): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const n = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
    const invoice = `INV-${year}-${String(n).padStart(6, "0")}`;
    const clash = await prisma.payment.findUnique({
      where: { invoiceNumber: invoice },
      select: { id: true },
    });
    if (!clash) return invoice;
  }
  return `INV-${year}-${Date.now().toString().slice(-8)}`;
}

const num = (d: Prisma.Decimal) => d.toNumber();

/**
 * Not every payment buys a course seat. What it *did* buy rides along in
 * `Payment.metadata` under `kind`, so fulfilment and the admin screens can tell
 * a watermark removal from an admission without a second table.
 */
export const RECORDING_WATERMARK_PAYMENT = "RECORDING_WATERMARK";

interface PurchaseMetadata {
  kind?: string;
  meetingId?: string;
  meetingTitle?: string;
}

function readPurchaseMetadata(metadata: Prisma.JsonValue | null): PurchaseMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return metadata as PurchaseMetadata;
}

/** A one-line "what was this for?", for lists that have no course to show. */
export function paymentPurpose(metadata: Prisma.JsonValue | null): string | null {
  const meta = readPurchaseMetadata(metadata);
  if (meta?.kind !== RECORDING_WATERMARK_PAYMENT) return null;
  return meta.meetingTitle
    ? `Watermark removal · ${meta.meetingTitle}`
    : "Recording watermark removal";
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface PaymentListQuery {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  status?: string;
  provider?: string;
  method?: string;
}

export async function listPaymentsAdmin(q: PaymentListQuery) {
  const and: Prisma.PaymentWhereInput[] = [];
  if (q.search) {
    and.push({
      OR: [
        { invoiceNumber: { contains: q.search } },
        { user: { name: { contains: q.search } } },
      ],
    });
  }
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.status) and.push({ status: q.status as Prisma.PaymentWhereInput["status"] });
  if (q.provider) and.push({ provider: q.provider as Prisma.PaymentWhereInput["provider"] });
  if (q.method) and.push({ method: q.method as Prisma.PaymentWhereInput["method"] });
  const where: Prisma.PaymentWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
        course: { select: { title: true } },
        account: { select: { name: true } },
      },
    }),
  ]);

  return {
    total,
    payments: rows.map((p) => ({
      id: p.id,
      invoiceNumber: p.invoiceNumber,
      studentName: p.user.name,
      studentEmail: p.user.email,
      studentAvatar: p.user.avatarUrl,
      courseId: p.courseId,
      courseTitle: p.course?.title ?? null,
      purpose: paymentPurpose(p.metadata),
      netAmount: num(p.netAmount),
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      method: p.method,
      accountName: p.account?.name ?? null,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    })),
  };
}

export interface PaymentStats {
  revenue: number;
  transactions: number;
  paid: number;
  refunded: number;
}

export async function paymentStats(): Promise<PaymentStats> {
  const [rev, transactions, paid, refunded] = await Promise.all([
    prisma.payment.aggregate({ _sum: { netAmount: true }, where: { status: "PAID" } }),
    prisma.payment.count(),
    prisma.payment.count({ where: { status: "PAID" } }),
    prisma.payment.count({ where: { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } } }),
  ]);
  return {
    revenue: rev._sum.netAmount ? num(rev._sum.netAmount) : 0,
    transactions,
    paid,
    refunded,
  };
}

export async function getPaymentDetail(id: string) {
  const p = await prisma.payment.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, avatarUrl: true } },
      course: { select: { title: true } },
      account: { select: { name: true, kind: true } },
      installments: { orderBy: { installmentNo: "asc" } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!p) throw AppError.notFound("Payment not found.");

  return {
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    student: p.user,
    courseTitle: p.course?.title ?? null,
    purpose: paymentPurpose(p.metadata),
    amount: num(p.amount),
    discountAmount: num(p.discountAmount),
    taxAmount: num(p.taxAmount),
    netAmount: num(p.netAmount),
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    method: p.method,
    account: p.account ? { name: p.account.name, kind: p.account.kind } : null,
    type: p.type,
    providerPaymentId: p.providerPaymentId,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    installments: p.installments.map((i) => ({
      id: i.id,
      installmentNo: i.installmentNo,
      amount: num(i.amount),
      dueDate: i.dueDate.toISOString(),
      status: i.status,
      paidAt: i.paidAt ? i.paidAt.toISOString() : null,
    })),
    refunds: p.refunds.map((r) => ({
      id: r.id,
      amount: num(r.amount),
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    refundedTotal: p.refunds
      .filter((r) => r.status === "COMPLETED")
      .reduce((sum, r) => sum + num(r.amount), 0),
  };
}

export async function listUsersForSelect() {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export async function listCoursesForSelect() {
  return prisma.course.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } });
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function recordPayment(input: RecordPaymentInput): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true },
  });
  if (!user) throw AppError.badRequest("Learner not found.");

  // Optional coupon → discount.
  let discountAmount = 0;
  let couponId: string | null = null;
  if (input.couponCode) {
    const result = await validateCoupon(input.couponCode, input.amount, input.courseId || undefined);
    if (!result.valid) throw AppError.badRequest(result.reason ?? "Invalid coupon.");
    discountAmount = result.discount ?? 0;
    couponId = result.couponId ?? null;
  }
  const net = Math.max(0, Math.round((input.amount - discountAmount) * 100) / 100);

  // Booked-against account (optional). Guard it exists so a stale picker can't
  // orphan the reference.
  let accountId: string | null = null;
  if (input.accountId) {
    const account = await prisma.paymentAccount.findUnique({
      where: { id: input.accountId },
      select: { id: true },
    });
    if (!account) throw AppError.badRequest("Selected payment account no longer exists.");
    accountId = account.id;
  }

  // Admin may backdate a cash/QR payment they're recording after the fact.
  const paidAt =
    input.status === "PAID" ? (input.paidAt ? new Date(input.paidAt) : new Date()) : null;

  const invoiceNumber = await uniqueInvoice(new Date().getFullYear());
  const payment = await prisma.payment.create({
    data: {
      userId: input.userId,
      courseId: input.courseId || null,
      couponId,
      accountId,
      invoiceNumber,
      amount: new Prisma.Decimal(input.amount),
      discountAmount: new Prisma.Decimal(discountAmount),
      taxAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(net),
      currency: "INR",
      status: input.status,
      provider: input.provider,
      type: input.type,
      method: input.method ?? null,
      paidAt,
    },
    select: { id: true },
  });

  if (couponId) {
    await prisma.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
  }

  if (input.status === "PAID") {
    const amount = `₹${net.toLocaleString("en-IN")}`;
    await Promise.all([
      notify({
        userIds: [input.userId],
        type: "PAYMENT",
        title: "Payment received",
        message: `We've recorded your payment of ${amount}. Invoice ${invoiceNumber}.`,
        actionUrl: "/student/profile",
      }),
      notifyStaff({
        type: "PAYMENT",
        title: "Payment recorded",
        message: `${amount} from ${user.name}. Invoice ${invoiceNumber}.`,
        actionUrl: "/admin/payments",
      }),
    ]);
  }

  // EMI → generate a monthly instalment schedule.
  //
  // A zero-cost plan simply divides the net; an interest plan adds the rate to
  // it first and remembers both figures, so the learner's panel can show what
  // the course cost and what the finance added rather than one blended number
  // they can't reconcile.
  if (input.type === "EMI" && input.installments && input.installments >= 2) {
    const n = input.installments;
    const { settings } = await getSettings();
    const plan = input.emiPlan ?? (settings.emiZeroCostEnabled ? "ZERO_COST" : "INTEREST");
    const rate =
      plan === "INTEREST" ? (input.interestPercent ?? settings.emiInterestPercent) : 0;
    const financed = Math.round(net * (1 + rate / 100) * 100) / 100;

    const per = Math.floor((financed / n) * 100) / 100;
    const rows = Array.from({ length: n }, (_, i) => {
      const due = new Date();
      due.setMonth(due.getMonth() + i + 1);
      // Last installment absorbs the rounding remainder.
      const amount = i === n - 1 ? Math.round((financed - per * (n - 1)) * 100) / 100 : per;
      return {
        paymentId: payment.id,
        installmentNo: i + 1,
        amount: new Prisma.Decimal(amount),
        dueDate: due,
        status: "SCHEDULED" as const,
      };
    });

    await Promise.all([
      prisma.installment.createMany({ data: rows }),
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          emiPlan: plan,
          interestPercent: new Prisma.Decimal(rate),
          principalAmount: new Prisma.Decimal(net),
          // The learner owes the financed total, not the sticker price.
          netAmount: new Prisma.Decimal(financed),
        },
      }),
    ]);
  }

  return payment.id;
}

export async function setPaymentStatus(id: string, status: string): Promise<void> {
  const existing = await prisma.payment.findUnique({ where: { id }, select: { id: true, paidAt: true } });
  if (!existing) throw AppError.notFound("Payment not found.");
  await prisma.payment.update({
    where: { id },
    data: {
      status: status as Prisma.PaymentUpdateInput["status"],
      paidAt: status === "PAID" && !existing.paidAt ? new Date() : undefined,
    },
  });
}

export async function issueRefund(paymentId: string, input: RefundInput): Promise<void> {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      netAmount: true,
      refunds: { where: { status: "COMPLETED" }, select: { amount: true } },
    },
  });
  if (!p) throw AppError.notFound("Payment not found.");

  const net = num(p.netAmount);
  const already = p.refunds.reduce((s, r) => s + num(r.amount), 0);
  if (input.amount + already > net) {
    throw AppError.badRequest(`Refund exceeds the remaining amount (₹${(net - already).toLocaleString("en-IN")}).`);
  }

  await prisma.refund.create({
    data: {
      paymentId,
      amount: new Prisma.Decimal(input.amount),
      reason: input.reason || null,
      status: "COMPLETED",
    },
  });
  const total = already + input.amount;
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: total >= net ? "REFUNDED" : "PARTIALLY_REFUNDED" },
  });
}

export async function deletePayment(id: string): Promise<void> {
  const existing = await prisma.payment.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Payment not found.");
  await prisma.refund.deleteMany({ where: { paymentId: id } });
  await prisma.payment.delete({ where: { id } });
}

// ── Online checkout (Razorpay) ─────────────────────────────────────────────────
// A learner buys a paid course: we create a Razorpay order + a PENDING payment,
// the browser completes checkout, and fulfilment (mark PAID + enrol) happens
// idempotently — driven authoritatively by the webhook, with the client callback
// as a fast-path. Whichever lands first wins; the other is a no-op.

export interface CheckoutSession {
  paymentId: string;
  orderId: string;
  amount: number; // paise
  currency: string;
  keyId: string | null;
  courseTitle: string;
  prefill: { name: string; email: string };
}

export async function createCourseOrder(
  userId: string,
  courseId: string,
  couponCode?: string,
): Promise<CheckoutSession> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, slug: true, status: true, price: true, discountPrice: true },
  });
  if (!course) throw AppError.notFound("Course not found.");
  if (course.status !== "PUBLISHED") throw AppError.badRequest("This course isn't available yet.");

  const already = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  if (already) throw AppError.badRequest("You're already enrolled in this course.");

  const base = num(course.discountPrice ?? course.price);
  if (base <= 0) throw AppError.badRequest("This course is free — enrol directly.");

  let discountAmount = 0;
  let couponId: string | null = null;
  if (couponCode) {
    const r = await validateCoupon(couponCode, base, courseId);
    if (!r.valid) throw AppError.badRequest(r.reason ?? "Invalid coupon.");
    discountAmount = r.discount ?? 0;
    couponId = r.couponId ?? null;
  }
  const net = Math.max(1, Math.round((base - discountAmount) * 100) / 100);
  const amountPaise = Math.round(net * 100);

  const [user, razorAccount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    getRazorpayAccount(),
  ]);

  const invoiceNumber = await uniqueInvoice(new Date().getFullYear());
  const order = await createRazorpayOrder({
    amountPaise,
    currency: "INR",
    receipt: invoiceNumber,
    notes: { courseId, userId },
  });

  const payment = await prisma.payment.create({
    data: {
      userId,
      courseId,
      couponId,
      accountId: razorAccount?.id ?? null,
      invoiceNumber,
      amount: new Prisma.Decimal(base),
      discountAmount: new Prisma.Decimal(discountAmount),
      taxAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(net),
      currency: "INR",
      status: "PENDING",
      provider: "RAZORPAY",
      type: "ONE_TIME",
      method: "ONLINE",
      providerOrderId: order.id,
    },
    select: { id: true },
  });

  return {
    paymentId: payment.id,
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    keyId: razorpayKeyId(),
    courseTitle: course.title,
    prefill: { name: user?.name ?? "", email: user?.email ?? "" },
  };
}

/**
 * "Watermark ko hide karwana hai to student ko extra charge dena hoga Razorpay
 * ke through." One recording, one learner.
 *
 * Same order → verify → fulfil path as a course purchase, on purpose: the
 * webhook, the invoice series, the receiving account and Admin → Payments all
 * keep working, and only what fulfilment *does* differs. There is deliberately
 * no `courseId` on the row — `fulfillPaidCheckout` enrols the payer when one is
 * set, and buying a clean player is not buying the course.
 */
export async function createWatermarkOrder(
  user: PublicUser,
  meetingId: string,
): Promise<CheckoutSession> {
  const { title, price, alreadyPaid } = await watermarkPurchaseContext(user, meetingId);
  if (alreadyPaid) {
    throw AppError.badRequest("You've already removed the watermark from this recording.");
  }
  // Keys are often absent in development. Say so plainly instead of letting the
  // Razorpay client throw and surface as a bare 500.
  if (!razorpayConfigured()) {
    throw AppError.badRequest(
      "Online payments aren't set up yet. Please contact support to remove the watermark.",
    );
  }

  const net = Math.max(1, Math.round(price * 100) / 100);
  const amountPaise = Math.round(net * 100);
  const [razorAccount, invoiceNumber] = await Promise.all([
    getRazorpayAccount(),
    uniqueInvoice(new Date().getFullYear()),
  ]);

  const order = await createRazorpayOrder({
    amountPaise,
    currency: "INR",
    receipt: invoiceNumber,
    notes: { kind: RECORDING_WATERMARK_PAYMENT, meetingId, userId: user.id },
  });

  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      accountId: razorAccount?.id ?? null,
      invoiceNumber,
      amount: new Prisma.Decimal(net),
      discountAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(net),
      currency: "INR",
      status: "PENDING",
      provider: "RAZORPAY",
      type: "ONE_TIME",
      method: "ONLINE",
      providerOrderId: order.id,
      metadata: { kind: RECORDING_WATERMARK_PAYMENT, meetingId, meetingTitle: title },
    },
    select: { id: true },
  });

  return {
    paymentId: payment.id,
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    keyId: razorpayKeyId(),
    courseTitle: `Watermark-free recording — ${title}`,
    prefill: { name: user.name, email: user.email },
  };
}

/**
 * Mark a checkout payment PAID and enrol the learner — idempotently. The status
 * flip is an atomic conditional update; only the caller that actually flips it
 * (count === 1) runs the enrolment + counter + coupon + notifications, so the
 * webhook and the client callback can both call this safely.
 */
/**
 * Shared with the lead-payment flow: a payment link's success callback lands
 * here too, so a link and an in-app checkout enrol the learner identically.
 */
export async function fulfillPaidCheckout(
  paymentId: string,
  providerPaymentId?: string,
): Promise<{ slug: string | null; alreadyPaid: boolean }> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      userId: true,
      courseId: true,
      couponId: true,
      accountId: true,
      leadId: true,
      invoiceNumber: true,
      netAmount: true,
      metadata: true,
      course: { select: { slug: true, title: true } },
      user: { select: { name: true } },
    },
  });
  if (!payment) throw AppError.notFound("Payment not found.");

  const razorAccount = payment.accountId ? null : await getRazorpayAccount();

  const claim = await prisma.payment.updateMany({
    where: { id: paymentId, status: { not: "PAID" } },
    data: {
      status: "PAID",
      paidAt: new Date(),
      method: "ONLINE",
      provider: "RAZORPAY",
      ...(providerPaymentId ? { providerPaymentId } : {}),
      ...(payment.accountId ? {} : razorAccount ? { accountId: razorAccount.id } : {}),
    },
  });
  if (claim.count === 0) {
    return { slug: payment.course?.slug ?? null, alreadyPaid: true };
  }

  // We own fulfilment for this payment.

  // Some payments buy something other than a seat on a course. The kind is kept
  // in `metadata` and read here rather than in the route, so the webhook — the
  // only path that runs when the payer closes the tab — fulfils it too.
  const purchase = readPurchaseMetadata(payment.metadata);
  if (purchase?.kind === RECORDING_WATERMARK_PAYMENT && purchase.meetingId) {
    await waiveRecordingWatermark(purchase.meetingId, payment.userId, payment.id);
  }

  if (payment.courseId) {
    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId } },
      select: { id: true },
    });
    let enrollmentId = existing?.id ?? null;
    if (!existing) {
      const e = await prisma.enrollment.create({
        data: { userId: payment.userId, courseId: payment.courseId, status: "ACTIVE", source: "PURCHASE" },
        select: { id: true },
      });
      enrollmentId = e.id;
      await bumpCourseEnrollmentCount(payment.courseId, 1);
    }
    await prisma.payment.update({ where: { id: paymentId }, data: { enrollmentId } });
  }
  if (payment.couponId) {
    await prisma.coupon.update({ where: { id: payment.couponId }, data: { usedCount: { increment: 1 } } });
  }

  // A payment raised against a CRM lead closes it out. Done here rather than in
  // the browser callback so the webhook — the authoritative path, and the only
  // one that runs when the payer closes the tab — moves the lead too.
  if (payment.leadId) {
    await prisma.lead.updateMany({
      where: { id: payment.leadId, stage: { not: "CONVERTED" } },
      data: { stage: "CONVERTED", status: "CONVERTED", subStatus: "Admission Done" },
    });
  }

  const amount = `₹${num(payment.netAmount).toLocaleString("en-IN")}`;
  void logActivity({
    userId: payment.userId,
    action: ACTIVITY_ACTIONS.PAYMENT,
    entityType: "Payment",
    entityId: payment.id,
    description: `Paid ${amount}${payment.course ? ` for “${payment.course.title}”` : ""} · ${payment.invoiceNumber}`,
    metadata: { invoiceNumber: payment.invoiceNumber, amount: num(payment.netAmount) },
  });
  if (payment.courseId) {
    void logActivity({
      userId: payment.userId,
      action: ACTIVITY_ACTIONS.ENROLL,
      entityType: "Course",
      entityId: payment.courseId,
      description: payment.course ? `Enrolled in “${payment.course.title}”` : null,
    });
  }

  await Promise.all([
    notify({
      userIds: [payment.userId],
      type: "PAYMENT",
      title: "Payment successful",
      message: `We've received ${amount}${payment.course ? ` for “${payment.course.title}”` : ""}. Invoice ${payment.invoiceNumber}.`,
      actionUrl: payment.course ? `/student/learn/${payment.course.slug}` : "/student/profile",
    }),
    notifyStaff({
      type: "PAYMENT",
      title: "Online payment received",
      message: `${amount} from ${payment.user?.name ?? "a learner"}. Invoice ${payment.invoiceNumber}.`,
      actionUrl: "/admin/payments",
    }),
  ]);

  return { slug: payment.course?.slug ?? null, alreadyPaid: false };
}

/** Client-side checkout callback — verified, then fulfilled. */
export async function verifyAndFulfillCheckout(input: {
  paymentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ slug: string | null }> {
  const ok = verifyCheckoutSignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
  });
  if (!ok) throw AppError.badRequest("Payment verification failed.");

  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, providerOrderId: true },
  });
  if (!payment) throw AppError.notFound("Payment not found.");
  if (payment.providerOrderId !== input.razorpayOrderId) {
    throw AppError.badRequest("Order mismatch.");
  }
  const { slug } = await fulfillPaidCheckout(input.paymentId, input.razorpayPaymentId);
  return { slug };
}

/** Server-to-server webhook — the authoritative fulfilment path. */
export async function handleRazorpayWebhook(event: unknown): Promise<{ handled: boolean }> {
  const e = event as {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string } };
      order?: { entity?: { id?: string } };
    };
  };
  const type = e?.event;

  if (type === "payment.captured" || type === "order.paid") {
    const orderId =
      e.payload?.payment?.entity?.order_id ?? e.payload?.order?.entity?.id ?? null;
    const providerPaymentId = e.payload?.payment?.entity?.id;
    if (!orderId) return { handled: false };
    const payment = await prisma.payment.findFirst({
      where: { providerOrderId: orderId },
      select: { id: true },
    });
    if (!payment) return { handled: false };
    await fulfillPaidCheckout(payment.id, providerPaymentId);
    return { handled: true };
  }

  if (type === "payment.failed") {
    const orderId = e.payload?.payment?.entity?.order_id;
    if (orderId) {
      await prisma.payment.updateMany({
        where: { providerOrderId: orderId, status: { not: "PAID" } },
        data: { status: "FAILED" },
      });
    }
    return { handled: true };
  }

  return { handled: false };
}
