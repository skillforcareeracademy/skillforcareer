import { prisma } from "@/lib/prisma";
import { notify, notifyStaff } from "./notification-service";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { bumpCourseEnrollmentCount } from "@/server/repositories/counters";
import { validateCoupon } from "@/server/services/coupon-service";
import {
  referralDiscountFor,
  rewardReferralFor,
} from "@/server/services/referral-service";
import { getRazorpayAccount } from "@/server/services/payment-account-service";
import { getSettings } from "@/server/services/settings-service";
import {
  ACTIVITY_ACTIONS,
  logActivity,
} from "@/server/services/activity-service";
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
import {
  joinPlan,
  splitPlan,
  type InstallmentUpdateInput,
  type RecordPaymentInput,
  type RefundInput,
  type UpdatePaymentInput,
} from "@/lib/validations/payment";
import {
  readDate,
  money,
  refreshFeeStatus,
  termsFor,
  scheduleFromInput,
  summarise,
  writeSchedule,
} from "@/server/services/fee-plan-service";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The academy's invoice numbers: SFC0001, SFC0002, … — the client's own
 * numbering ("invoice number SFC0003 hona chahiye"), running in one sequence
 * rather than per year, so an invoice can be quoted over the phone.
 *
 * The next number is read from the highest one already issued and checked for
 * a clash before it is used, which is what makes two admissions taken at the
 * same second land on different invoices. Shared with the lead-payment flow,
 * which raises its own invoices.
 */
export const INVOICE_PREFIX = "SFC";

export async function uniqueInvoice(_year?: number): Promise<string> {
  void _year; // the numbering no longer restarts each year
  const rows = await prisma.$queryRaw<{ maxNo: bigint | number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(invoiceNumber, ${INVOICE_PREFIX.length + 1}) AS UNSIGNED)) AS maxNo
    FROM Payment
    WHERE invoiceNumber LIKE ${`${INVOICE_PREFIX}%`}
  `;
  let seq = Number(rows[0]?.maxNo ?? 0) + 1;

  for (let i = 0; i < 50; i += 1, seq += 1) {
    const invoice = invoiceNoFor(seq);
    const clash = await prisma.payment.findUnique({
      where: { invoiceNumber: invoice },
      select: { id: true },
    });
    if (!clash) return invoice;
  }
  // Fifty taken in a row means something is very wrong with the sequence; fall
  // back to something unique rather than failing the payment.
  return `${INVOICE_PREFIX}${Date.now().toString().slice(-8)}`;
}

export const invoiceNoFor = (seq: number) =>
  `${INVOICE_PREFIX}${String(seq).padStart(4, "0")}`;

const num = (d: Prisma.Decimal) => d.toNumber();

/**
 * Not every payment buys a course seat. What it *did* buy rides along in
 * `Payment.metadata` under `kind`, so fulfilment and the admin screens can tell
 * a watermark removal from an admission without a second table.
 */
export const RECORDING_WATERMARK_PAYMENT = "RECORDING_WATERMARK";

/**
 * A learner settling fees they already owe, from their own panel — "yaha pr
 * student panel me humesha pay now ka option aana chahiye. Pay in full, pay
 * next emi in advance or pay custom amount." The money lands as its own
 * receipt and is then credited against the plan it was raised for.
 */
export const FEE_SETTLEMENT_PAYMENT = "FEE_SETTLEMENT";

interface PurchaseMetadata {
  kind?: string;
  meetingId?: string;
  meetingTitle?: string;
  /** For a fee settlement: the plan the money is being paid against. */
  targetPaymentId?: string;
}

function readPurchaseMetadata(
  metadata: Prisma.JsonValue | null,
): PurchaseMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  return metadata as PurchaseMetadata;
}

/** A one-line "what was this for?", for lists that have no course to show. */
export function paymentPurpose(
  metadata: Prisma.JsonValue | null,
): string | null {
  const meta = readPurchaseMetadata(metadata);
  if (meta?.kind === FEE_SETTLEMENT_PAYMENT) return "Fee payment";
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
  if (q.status)
    and.push({ status: q.status as Prisma.PaymentWhereInput["status"] });
  if (q.provider)
    and.push({ provider: q.provider as Prisma.PaymentWhereInput["provider"] });
  if (q.method)
    and.push({ method: q.method as Prisma.PaymentWhereInput["method"] });
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
        installments: {
          orderBy: { installmentNo: "asc" },
          select: {
            amount: true,
            dueDate: true,
            status: true,
            paidAmount: true,
            penaltyAmount: true,
            penaltyWaived: true,
          },
        },
      },
    }),
  ]);

  // What each plan still owes. `summarise` reads the platform's fee terms, and
  // that read is deduped for the request, so a page of twenty is one lookup.
  const summaries = await Promise.all(rows.map((p) => summarise(p)));

  return {
    total,
    payments: rows.map((p, i) => ({
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
      amount: num(p.amount),
      discountAmount: num(p.discountAmount),
      type: p.type,
      emiPlan: p.emiPlan,
      outstanding: summaries[i].outstanding,
      penalty: summaries[i].penalty,
      nextDueDate: summaries[i].nextDueDate?.toISOString() ?? null,
      daysLate: summaries[i].daysLate,
      installmentCount: p.installments.length,
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
    prisma.payment.aggregate({
      _sum: { netAmount: true },
      where: { status: "PAID" },
    }),
    prisma.payment.count(),
    prisma.payment.count({ where: { status: "PAID" } }),
    prisma.payment.count({
      where: { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } },
    }),
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

  const summary = await summarise(p);
  const terms = await termsFor(p);

  return {
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    userId: p.userId,
    courseId: p.courseId,
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
    emiPlan: p.emiPlan,
    interestPercent: p.interestPercent ? num(p.interestPercent) : null,
    principalAmount: p.principalAmount ? num(p.principalAmount) : null,
    providerPaymentId: p.providerPaymentId,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    bookingAmount: p.bookingAmount ? num(p.bookingAmount) : null,
    bookingAt: p.bookingAt ? p.bookingAt.toISOString() : null,

    // The plan's own terms, and the platform figures they fall back to, so the
    // office can see what it is overriding before it overrides it.
    graceDays: p.graceDays,
    penaltyPercent: p.penaltyPercent ? num(p.penaltyPercent) : null,
    penaltyFlat: p.penaltyFlat ? num(p.penaltyFlat) : null,
    penaltyWaived: p.penaltyWaived,
    effectiveTerms: terms,
    firstPaymentAt: p.firstPaymentAt ? p.firstPaymentAt.toISOString() : null,
    lastPaymentAt: p.lastPaymentAt ? p.lastPaymentAt.toISOString() : null,
    notes: p.notes,

    summary: {
      payable: summary.payable,
      paid: summary.paid,
      booking: summary.booking,
      penalty: summary.penalty,
      outstanding: summary.outstanding,
      nextDueDate: summary.nextDueDate?.toISOString() ?? null,
      nextDueAmount: summary.nextDueAmount,
      daysLate: summary.daysLate,
    },

    installments: p.installments.map((i) => ({
      id: i.id,
      installmentNo: i.installmentNo,
      amount: num(i.amount),
      dueDate: i.dueDate.toISOString(),
      status: i.status,
      paidAt: i.paidAt ? i.paidAt.toISOString() : null,
      paidAmount: num(i.paidAmount),
      method: i.method,
      penaltyAmount:
        i.penaltyWaived || p.penaltyWaived ? 0 : num(i.penaltyAmount),
      penaltyWaived: i.penaltyWaived,
      note: i.note,
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
  return prisma.course.findMany({
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * The money part of a recorded payment: the sticker price, whatever has been
 * taken off it, and the coupon that did some of the taking.
 *
 * The office now types the discount itself — "Total Amount / Discounted amount
 * / Auto calculated how much percentage of discount given" — so a coupon adds
 * to that figure rather than replacing it.
 */
async function priceOf(input: {
  amount: number;
  discountAmount?: number;
  courseId?: string;
  couponCode?: string;
}): Promise<{ discountAmount: number; couponId: string | null; net: number }> {
  let discountAmount = Math.max(0, input.discountAmount ?? 0);
  let couponId: string | null = null;

  if (input.couponCode) {
    const result = await validateCoupon(
      input.couponCode,
      input.amount,
      input.courseId || undefined,
    );
    if (!result.valid)
      throw AppError.badRequest(result.reason ?? "Invalid coupon.");
    discountAmount += result.discount ?? 0;
    couponId = result.couponId ?? null;
  }

  discountAmount = Math.min(
    input.amount,
    Math.round(discountAmount * 100) / 100,
  );
  const net = Math.max(
    0,
    Math.round((input.amount - discountAmount) * 100) / 100,
  );
  return { discountAmount, couponId, net };
}

/** The booked-against account, guarded so a stale picker can't orphan it. */
async function resolveAccount(accountId?: string): Promise<string | null> {
  if (!accountId) return null;
  const account = await prisma.paymentAccount.findUnique({
    where: { id: accountId },
    select: { id: true },
  });
  if (!account)
    throw AppError.badRequest("Selected payment account no longer exists.");
  return account.id;
}

/**
 * What the learner actually owes once the plan is priced. A zero-cost plan
 * spreads the net; an interest plan adds the rate on top and keeps both figures
 * so the learner's panel can show what the course cost and what the finance
 * added, rather than one blended number they can't reconcile.
 */
async function financeEmi(
  net: number,
  emiPlan: "ZERO_COST" | "INTEREST" | null,
  interestPercent?: number,
): Promise<{ plan: "ZERO_COST" | "INTEREST"; rate: number; financed: number }> {
  const { settings } = await getSettings();
  const plan =
    emiPlan ?? (settings.emiZeroCostEnabled ? "ZERO_COST" : "INTEREST");
  const rate =
    plan === "INTEREST" ? (interestPercent ?? settings.emiInterestPercent) : 0;
  return {
    plan,
    rate,
    financed: Math.round(net * (1 + rate / 100) * 100) / 100,
  };
}

/**
 * The plan terms a form sent, with blanks left as "use the platform default".
 * Deliberately a plain shape rather than a Prisma input type, so it can be
 * spread into either a create or an update without widening either.
 */
interface FeeTermsData {
  graceDays?: number;
  penaltyPercent?: Prisma.Decimal;
  penaltyFlat?: Prisma.Decimal;
  penaltyWaived?: boolean;
  firstPaymentAt?: Date | null;
  lastPaymentAt?: Date | null;
  notes?: string | null;
}

function termsData(input: {
  graceDays?: number;
  penaltyPercent?: number;
  penaltyFlat?: number;
  penaltyWaived?: boolean;
  firstPaymentAt?: string;
  lastPaymentAt?: string;
  notes?: string;
}): FeeTermsData {
  const data: FeeTermsData = {};
  if (input.graceDays !== undefined) data.graceDays = input.graceDays;
  if (input.penaltyPercent !== undefined) {
    data.penaltyPercent = new Prisma.Decimal(input.penaltyPercent);
  }
  if (input.penaltyFlat !== undefined) {
    data.penaltyFlat = new Prisma.Decimal(input.penaltyFlat);
  }
  if (input.penaltyWaived !== undefined)
    data.penaltyWaived = input.penaltyWaived;
  if (input.firstPaymentAt !== undefined)
    data.firstPaymentAt = readDate(input.firstPaymentAt);
  if (input.lastPaymentAt !== undefined)
    data.lastPaymentAt = readDate(input.lastPaymentAt);
  if (input.notes !== undefined) data.notes = input.notes || null;
  return data;
}

export async function recordPayment(
  input: RecordPaymentInput,
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true },
  });
  if (!user) throw AppError.badRequest("Learner not found.");

  const { discountAmount, couponId, net } = await priceOf(input);
  const accountId = await resolveAccount(input.accountId || undefined);
  const { type, emiPlan } = splitPlan(input.plan);

  // Admin may backdate a cash/QR payment they're recording after the fact.
  const paidAt =
    input.status === "PAID" ? (readDate(input.paidAt) ?? new Date()) : null;

  // An instalment plan is priced before it is written, because the schedule
  // divides the financed total rather than the sticker price.
  const emi =
    type === "EMI"
      ? await financeEmi(net, emiPlan, input.interestPercent)
      : null;
  const payable = emi ? emi.financed : net;

  const invoiceNumber = await uniqueInvoice(new Date().getFullYear());
  const payment = await prisma.payment.create({
    data: {
      ...termsData(input),
      userId: input.userId,
      courseId: input.courseId || null,
      couponId,
      accountId,
      invoiceNumber,
      amount: new Prisma.Decimal(input.amount),
      discountAmount: new Prisma.Decimal(discountAmount),
      taxAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(payable),
      currency: "INR",
      status: input.status,
      provider: input.provider,
      type,
      method: input.method ?? null,
      paidAt,
      emiPlan: emi?.plan ?? null,
      interestPercent: emi ? new Prisma.Decimal(emi.rate) : null,
      principalAmount: emi ? new Prisma.Decimal(net) : null,
      bookingAmount: input.bookingAmount
        ? new Prisma.Decimal(input.bookingAmount)
        : null,
      bookingAt: input.bookingAmount
        ? (readDate(input.bookingAt) ?? new Date())
        : null,
    },
    select: { id: true },
  });

  if (couponId) {
    await prisma.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
  }

  // The schedule. An EMI plan always gets one; a booking amount gets one too
  // when the office has said when the balance is due, which is how "if EMI or
  // partial paid then… automatic calculate next installments" is honoured.
  if (type === "EMI" || type === "BOOKING") {
    const rows = scheduleFromInput({
      mode: input.installmentMode,
      total: payable,
      count: input.installments,
      from: input.scheduleFrom,
      to: input.scheduleTo,
      manual: input.schedule,
    });
    if (rows) await writeSchedule(payment.id, rows);
  }

  if (input.status === "PAID") {
    const amount = `₹${payable.toLocaleString("en-IN")}`;
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
    // Same rule as the online path: money in means the referral has earned out.
    void rewardReferralFor(input.userId, payment.id);
  }

  await refreshFeeStatus(payment.id);
  return payment.id;
}

/**
 * Edit a payment that already exists — "bahar se click krke field edit ka
 * option and fees edit ka option".
 *
 * Only what the form sent is touched. A schedule is rebuilt only when the
 * office changed the plan or the dates, and `writeSchedule` carries across
 * anything already paid so re-pricing a plan never loses a receipt.
 */
export async function updatePayment(
  id: string,
  input: UpdatePaymentInput,
): Promise<void> {
  const existing = await prisma.payment.findUnique({
    where: { id },
    select: {
      id: true,
      amount: true,
      discountAmount: true,
      netAmount: true,
      principalAmount: true,
      type: true,
      emiPlan: true,
      interestPercent: true,
      paidAt: true,
      bookingAt: true,
      status: true,
    },
  });
  if (!existing) throw AppError.notFound("Payment not found.");

  const data: Prisma.PaymentUncheckedUpdateInput = { ...termsData(input) };

  if (input.courseId !== undefined) data.courseId = input.courseId || null;
  if (input.method !== undefined) data.method = input.method;
  if (input.accountId !== undefined) {
    data.accountId = await resolveAccount(input.accountId || undefined);
  }

  const plan = input.plan ?? joinPlan(existing.type, existing.emiPlan);
  const { type, emiPlan } = splitPlan(plan);
  if (input.plan !== undefined) data.type = type;

  // Re-price whenever either side of the sum moved.
  const total = input.amount ?? num(existing.amount);
  const discount = Math.min(
    total,
    input.discountAmount ?? num(existing.discountAmount),
  );
  const net = Math.max(0, Math.round((total - discount) * 100) / 100);

  const emi =
    type === "EMI"
      ? await financeEmi(
          net,
          emiPlan,
          input.interestPercent ??
            (existing.interestPercent
              ? num(existing.interestPercent)
              : undefined),
        )
      : null;
  const payable = emi ? emi.financed : net;

  if (
    input.amount !== undefined ||
    input.discountAmount !== undefined ||
    input.plan !== undefined ||
    input.interestPercent !== undefined
  ) {
    data.amount = new Prisma.Decimal(total);
    data.discountAmount = new Prisma.Decimal(discount);
    data.netAmount = new Prisma.Decimal(payable);
    data.emiPlan = emi?.plan ?? null;
    data.interestPercent = emi ? new Prisma.Decimal(emi.rate) : null;
    data.principalAmount = emi ? new Prisma.Decimal(net) : null;
  }

  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === "PAID" && !existing.paidAt) data.paidAt = new Date();
  }
  if (input.paidAt !== undefined && input.paidAt !== "") {
    data.paidAt = readDate(input.paidAt);
  }

  // The seat-holding money. Clearing the box clears the record of it, so a
  // figure typed in error can be taken back out.
  if (input.bookingAmount !== undefined) {
    const booked = input.bookingAmount > 0;
    data.bookingAmount = booked ? new Prisma.Decimal(input.bookingAmount) : null;
    data.bookingAt = booked
      ? (readDate(input.bookingAt) ?? existing.bookingAt ?? new Date())
      : null;
  } else if (input.bookingAt !== undefined && input.bookingAt !== "") {
    data.bookingAt = readDate(input.bookingAt);
  }

  if (Object.keys(data).length > 0) {
    await prisma.payment.update({ where: { id }, data });
  }

  // Rebuilding the schedule is deliberate rather than implied: the office has
  // to have sent dates or a written-out plan for it to happen at all.
  const wantsSchedule =
    input.installmentMode !== undefined ||
    input.installments !== undefined ||
    input.schedule !== undefined ||
    (input.scheduleFrom ?? "") !== "" ||
    (input.scheduleTo ?? "") !== "";

  if (wantsSchedule && (type === "EMI" || type === "BOOKING")) {
    const rows = scheduleFromInput({
      mode: input.installmentMode ?? "AUTO",
      total: payable,
      count: input.installments,
      from: input.scheduleFrom,
      to: input.scheduleTo,
      manual: input.schedule,
    });
    if (rows) await writeSchedule(id, rows);
  }
  if (input.plan !== undefined && type === "ONE_TIME") {
    // Dropped off a plan — there is no schedule left to chase.
    await prisma.installment.deleteMany({ where: { paymentId: id } });
  }

  await refreshFeeStatus(id);
}

/**
 * Record money against one instalment, move its date, or forgive its late fee.
 * A part payment leaves the instalment owing the difference, which is what the
 * office means by "partial paid".
 */
export async function updateInstallment(
  installmentId: string,
  input: InstallmentUpdateInput,
): Promise<void> {
  const existing = await prisma.installment.findUnique({
    where: { id: installmentId },
    select: {
      id: true,
      paymentId: true,
      amount: true,
      paidAmount: true,
      paidAt: true,
    },
  });
  if (!existing) throw AppError.notFound("Instalment not found.");

  const data: Prisma.InstallmentUncheckedUpdateInput = {};
  if (input.amount !== undefined)
    data.amount = new Prisma.Decimal(input.amount);
  if (input.dueDate) {
    const due = readDate(input.dueDate);
    if (due) data.dueDate = due;
  }
  if (input.method !== undefined) data.method = input.method;
  if (input.note !== undefined) data.note = input.note || null;
  if (input.penaltyWaived !== undefined) {
    data.penaltyWaived = input.penaltyWaived;
    // Forgiving it clears what was charged, so the learner's own screen stops
    // showing a figure the office has already written off.
    if (input.penaltyWaived) data.penaltyAmount = new Prisma.Decimal(0);
  }

  const amount = input.amount ?? num(existing.amount);
  if (input.paidAmount !== undefined) {
    const got = Math.min(amount, Math.max(0, input.paidAmount));
    data.paidAmount = new Prisma.Decimal(got);
    if (got >= amount) {
      data.status = "PAID";
      data.paidAt = readDate(input.paidAt) ?? existing.paidAt ?? new Date();
      data.penaltyAmount = new Prisma.Decimal(0);
    }
  }
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === "PAID") {
      data.paidAmount = new Prisma.Decimal(amount);
      data.paidAt = readDate(input.paidAt) ?? existing.paidAt ?? new Date();
      data.penaltyAmount = new Prisma.Decimal(0);
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.installment.update({ where: { id: installmentId }, data });
  }
  await refreshFeeStatus(existing.paymentId);
}

/** Forgive every late fee on a plan at once. */
export async function waivePenalties(
  paymentId: string,
  waived: boolean,
): Promise<void> {
  const existing = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound("Payment not found.");
  await prisma.payment.update({
    where: { id: paymentId },
    data: { penaltyWaived: waived },
  });
  if (waived) {
    await prisma.installment.updateMany({
      where: { paymentId },
      data: { penaltyAmount: new Prisma.Decimal(0) },
    });
  }
  await refreshFeeStatus(paymentId);
}

export async function setPaymentStatus(
  id: string,
  status: string,
): Promise<void> {
  const existing = await prisma.payment.findUnique({
    where: { id },
    select: { id: true, paidAt: true },
  });
  if (!existing) throw AppError.notFound("Payment not found.");
  await prisma.payment.update({
    where: { id },
    data: {
      status: status as Prisma.PaymentUpdateInput["status"],
      paidAt: status === "PAID" && !existing.paidAt ? new Date() : undefined,
    },
  });
}

export async function issueRefund(
  paymentId: string,
  input: RefundInput,
): Promise<void> {
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
    throw AppError.badRequest(
      `Refund exceeds the remaining amount (₹${(net - already).toLocaleString("en-IN")}).`,
    );
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
  const existing = await prisma.payment.findUnique({
    where: { id },
    select: { id: true },
  });
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
  /** Money off because they arrived on somebody's referral code. */
  referralDiscount: number;
}

export async function createCourseOrder(
  userId: string,
  courseId: string,
  couponCode?: string,
): Promise<CheckoutSession> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      price: true,
      discountPrice: true,
    },
  });
  if (!course) throw AppError.notFound("Course not found.");
  if (course.status !== "PUBLISHED")
    throw AppError.badRequest("This course isn't available yet.");

  const already = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  if (already)
    throw AppError.badRequest("You're already enrolled in this course.");

  const base = num(course.discountPrice ?? course.price);
  if (base <= 0)
    throw AppError.badRequest("This course is free — enrol directly.");

  let discountAmount = 0;
  let couponId: string | null = null;
  if (couponCode) {
    const r = await validateCoupon(couponCode, base, courseId);
    if (!r.valid) throw AppError.badRequest(r.reason ?? "Invalid coupon.");
    discountAmount = r.discount ?? 0;
    couponId = r.couponId ?? null;
  }
  // The friend's side of refer-and-earn: money off their first enrolment, when
  // the academy has set an amount for it.
  const referralDiscount = await referralDiscountFor(
    userId,
    base - discountAmount,
  );
  discountAmount += referralDiscount;

  const net = Math.max(1, Math.round((base - discountAmount) * 100) / 100);
  const amountPaise = Math.round(net * 100);

  const [user, razorAccount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
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
    referralDiscount,
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
  const { title, price, alreadyPaid } = await watermarkPurchaseContext(
    user,
    meetingId,
  );
  if (alreadyPaid) {
    throw AppError.badRequest(
      "You've already removed the watermark from this recording.",
    );
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
      metadata: {
        kind: RECORDING_WATERMARK_PAYMENT,
        meetingId,
        meetingTitle: title,
      },
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
    // Refer-and-earn is about course seats; this buys a recording.
    referralDiscount: 0,
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
      ...(payment.accountId
        ? {}
        : razorAccount
          ? { accountId: razorAccount.id }
          : {}),
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
    await waiveRecordingWatermark(
      purchase.meetingId,
      payment.userId,
      payment.id,
    );
  }
  // Fees the learner settled themselves, credited against the plan they owe
  // it on. Runs here rather than in the route so the webhook — the only path
  // that runs when the payer closes the tab — credits it too.
  if (purchase?.kind === FEE_SETTLEMENT_PAYMENT && purchase.targetPaymentId) {
    await creditFeeSettlement(purchase.targetPaymentId, num(payment.netAmount));
  }

  if (payment.courseId) {
    const existing = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: payment.userId, courseId: payment.courseId },
      },
      select: { id: true },
    });
    let enrollmentId = existing?.id ?? null;
    if (!existing) {
      const e = await prisma.enrollment.create({
        data: {
          userId: payment.userId,
          courseId: payment.courseId,
          status: "ACTIVE",
          source: "PURCHASE",
        },
        select: { id: true },
      });
      enrollmentId = e.id;
      await bumpCourseEnrollmentCount(payment.courseId, 1);
    }
    await prisma.payment.update({
      where: { id: paymentId },
      data: { enrollmentId },
    });
    // Whoever referred this learner gets paid now that the academy has been.
    void rewardReferralFor(payment.userId, payment.id);
  }
  if (payment.couponId) {
    await prisma.coupon.update({
      where: { id: payment.couponId },
      data: { usedCount: { increment: 1 } },
    });
  }

  // A payment raised against a CRM lead closes it out. Done here rather than in
  // the browser callback so the webhook — the authoritative path, and the only
  // one that runs when the payer closes the tab — moves the lead too.
  if (payment.leadId) {
    await prisma.lead.updateMany({
      where: { id: payment.leadId, stage: { not: "CONVERTED" } },
      data: {
        stage: "CONVERTED",
        status: "CONVERTED",
        subStatus: "Admission Done",
      },
    });
  }

  const amount = `₹${num(payment.netAmount).toLocaleString("en-IN")}`;
  void logActivity({
    userId: payment.userId,
    action: ACTIVITY_ACTIONS.PAYMENT,
    entityType: "Payment",
    entityId: payment.id,
    description: `Paid ${amount}${payment.course ? ` for “${payment.course.title}”` : ""} · ${payment.invoiceNumber}`,
    metadata: {
      invoiceNumber: payment.invoiceNumber,
      amount: num(payment.netAmount),
    },
  });
  if (payment.courseId) {
    void logActivity({
      userId: payment.userId,
      action: ACTIVITY_ACTIONS.ENROLL,
      entityType: "Course",
      entityId: payment.courseId,
      description: payment.course
        ? `Enrolled in “${payment.course.title}”`
        : null,
    });
  }

  await Promise.all([
    notify({
      userIds: [payment.userId],
      type: "PAYMENT",
      title: "Payment successful",
      message: `We've received ${amount}${payment.course ? ` for “${payment.course.title}”` : ""}. Invoice ${payment.invoiceNumber}.`,
      actionUrl: payment.course
        ? `/student/learn/${payment.course.slug}`
        : "/student/profile",
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
  const { slug } = await fulfillPaidCheckout(
    input.paymentId,
    input.razorpayPaymentId,
  );
  return { slug };
}

/** Server-to-server webhook — the authoritative fulfilment path. */
export async function handleRazorpayWebhook(
  event: unknown,
): Promise<{ handled: boolean }> {
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
      e.payload?.payment?.entity?.order_id ??
      e.payload?.order?.entity?.id ??
      null;
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

// ── Settling fees from the learner's own panel ───────────────────────────────

export type SettleChoice = "FULL" | "NEXT" | "CUSTOM";

/**
 * What a learner may pay right now against one of their plans.
 *
 * Three figures, because those are the three things people actually do: clear
 * the lot, put the next instalment in early, or pay what they can this month.
 * Late fees are inside `full`, so clearing it really does clear the account.
 */
export async function settleOptions(
  userId: string,
  paymentId: string,
): Promise<{ full: number; next: number; penalty: number; currency: string }> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, userId },
    select: { ...SETTLE_SELECT },
  });
  if (!payment) throw AppError.notFound("That invoice isn't yours.");
  const summary = await summarise(payment);
  return {
    full: summary.outstanding,
    next: summary.nextDueAmount || summary.outstanding,
    penalty: summary.penalty,
    currency: "INR",
  };
}

const SETTLE_SELECT = {
  id: true,
  status: true,
  type: true,
  netAmount: true,
  paidAt: true,
  bookingAmount: true,
  graceDays: true,
  penaltyPercent: true,
  penaltyFlat: true,
  penaltyWaived: true,
  installments: {
    select: {
      amount: true,
      dueDate: true,
      status: true,
      paidAmount: true,
      penaltyAmount: true,
      penaltyWaived: true,
    },
  },
} satisfies Prisma.PaymentSelect;

/**
 * Start a Razorpay checkout for money owed on an existing plan.
 *
 * A separate `Payment` row is raised rather than editing the original: the
 * invoice series, the receiving account, the refund trail and Admin → Payments
 * all work on receipts, and a receipt is what the learner is buying. The link
 * back to the plan rides in `metadata` and is settled in `creditFeeSettlement`.
 */
export async function createFeeSettlementOrder(
  user: PublicUser,
  paymentId: string,
  choice: SettleChoice,
  customAmount?: number,
): Promise<CheckoutSession> {
  if (!razorpayConfigured()) {
    throw AppError.badRequest(
      "Online payments aren't set up yet. Please contact the office to pay.",
    );
  }
  const target = await prisma.payment.findFirst({
    where: { id: paymentId, userId: user.id },
    select: { ...SETTLE_SELECT, invoiceNumber: true, courseId: true },
  });
  if (!target) throw AppError.notFound("That invoice isn't yours.");

  const summary = await summarise(target);
  if (summary.outstanding <= 0) {
    throw AppError.badRequest("There is nothing left to pay on this one.");
  }

  const asked =
    choice === "FULL"
      ? summary.outstanding
      : choice === "NEXT"
        ? summary.nextDueAmount || summary.outstanding
        : Math.round((customAmount ?? 0) * 100) / 100;

  if (asked <= 0) throw AppError.badRequest("Enter an amount to pay.");
  // Never take more than is owed — an overpayment is a refund waiting to go
  // wrong, and the learner meant to clear the account, not overshoot it.
  const net = Math.min(asked, summary.outstanding);
  const amountPaise = Math.round(net * 100);

  const [razorAccount, invoiceNumber] = await Promise.all([
    getRazorpayAccount(),
    uniqueInvoice(new Date().getFullYear()),
  ]);

  const order = await createRazorpayOrder({
    amountPaise,
    currency: "INR",
    receipt: invoiceNumber,
    notes: { kind: FEE_SETTLEMENT_PAYMENT, targetPaymentId: paymentId, userId: user.id },
  });

  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      // Deliberately no courseId: the seat was bought on the original plan,
      // and `fulfillPaidCheckout` enrols whenever one is set.
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
      metadata: { kind: FEE_SETTLEMENT_PAYMENT, targetPaymentId: paymentId },
    },
    select: { id: true },
  });

  return {
    paymentId: payment.id,
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    keyId: razorpayKeyId(),
    courseTitle: `Fee payment · ${target.invoiceNumber}`,
    prefill: { name: user.name, email: user.email },
    referralDiscount: 0,
  };
}

/**
 * Put a settled fee payment against the plan it was raised for.
 *
 * Oldest unpaid instalment first, so a part payment clears the thing that is
 * costing the learner a late fee rather than the one furthest away. A plan
 * with no instalments is simply marked paid once nothing is left owing.
 */
export async function creditFeeSettlement(
  targetPaymentId: string,
  amount: number,
): Promise<void> {
  const target = await prisma.payment.findUnique({
    where: { id: targetPaymentId },
    select: {
      id: true,
      installments: {
        where: { status: { notIn: ["PAID", "CANCELLED"] } },
        orderBy: { dueDate: "asc" },
        select: { id: true, amount: true, paidAmount: true },
      },
    },
  });
  if (!target) return;

  let left = amount;
  const now = new Date();
  for (const i of target.installments) {
    if (left <= 0) break;
    const owing = money(num(i.amount) - num(i.paidAmount));
    if (owing <= 0) continue;
    const put = Math.min(owing, left);
    left = money(left - put);
    const settled = put >= owing;
    await prisma.installment.updateMany({
      where: { id: i.id },
      data: {
        paidAmount: new Prisma.Decimal(money(num(i.paidAmount) + put)),
        ...(settled ? { status: "PAID", paidAt: now, method: "ONLINE" } : {}),
      },
    });
  }

  // Anything over the schedule, or a plan with no schedule at all, lands on
  // the plan itself so the learner's total stops showing it as owing.
  if (left > 0 || target.installments.length === 0) {
    const row = await prisma.payment.findUnique({
      where: { id: targetPaymentId },
      select: { ...SETTLE_SELECT },
    });
    if (row) {
      const after = await summarise(row);
      if (after.outstanding <= left) {
        await prisma.payment.updateMany({
          where: { id: targetPaymentId, status: { not: "PAID" } },
          data: { status: "PAID", paidAt: now },
        });
      }
    }
  }

  await prisma.payment.updateMany({
    where: { id: targetPaymentId },
    data: { lastPaymentAt: now },
  });
}
