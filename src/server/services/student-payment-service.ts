import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSettings } from "./settings-service";
import { summarise } from "./fee-plan-service";

/**
 * A learner's own fees page.
 *
 * The client's list: "Student ko uske panel me uski payment history, total
 * payment, payment status: Paid/Unpaid/EMI, if emi given then pending emi,
 * total emi, emi type: interest based emi or zero cost emi." Everything here is
 * derived from `Payment` + `Installment` — nothing is denormalised, so a
 * counsellor recording a cash instalment on the admin side shows up on the
 * learner's next page load.
 */

const num = (d: Prisma.Decimal | null) => (d == null ? 0 : d.toNumber());

export interface StudentInstallment {
  id: string;
  installmentNo: number;
  amount: number;
  dueDate: string;
  status: string;
  paidAt: string | null;
  /** Past its due date and still unpaid. */
  isOverdue: boolean;
  /** Part payments: anything short of `amount` leaves the rest owing. */
  paidAmount: number;
  /** What being late has cost, after any waiver the office has given. */
  penaltyAmount: number;
  /**
   * Where to pay this EMI, when it is owed and the assigned account is one the
   * office settles by hand (not the auto-reconciling Razorpay one). The learner
   * scans/notes this and tells the office — "uska QR dikhna chahiye student ko".
   */
  payInto: {
    name: string;
    /** UPI id, or a bank hint for a non-UPI account. */
    detail: string | null;
    /** True when `detail` is a UPI id a QR can be built from. */
    upi: boolean;
  } | null;
}

export interface StudentPaymentRow {
  id: string;
  invoiceNumber: string;
  courseTitle: string | null;
  amount: number;
  discountAmount: number;
  netAmount: number;
  currency: string;
  status: string;
  method: string | null;
  type: string;
  createdAt: string;
  paidAt: string | null;
  /** Set only on an EMI payment. */
  emiPlan: string | null;
  interestPercent: number | null;
  principalAmount: number | null;
  installments: StudentInstallment[];
  /** A shareable link the office raised and this learner hasn't paid yet. */
  payUrl: string | null;
  /** Money taken to hold the seat, counted as received. */
  bookingAmount: number;
  bookingAt: string | null;
  /** Late fees being charged on this plan right now. */
  penaltyAmount: number;
  /** Late fees the academy has forgiven, so the learner can see the credit. */
  penaltyWaivedAmount: number;
  /** What is still owing on this plan, late fees included. */
  outstanding: number;
  /** What has actually come in against this plan, booking money included. */
  paidAmount: number;
  /**
   * Whether the Razorpay "Pay now" button belongs on this plan — only when the
   * office routed it to the default (auto-reconciling) account, or the learner
   * registered by paying online. A plan routed to a manual UPI / cash account
   * is settled by hand against the QR, so the online button would mislead.
   * "Agar non default… account select kiya hai to razorpay wala pay now ka
   * button nahi aana chahiye."
   */
  canPayOnline: boolean;
}

export interface StudentFees {
  /** Everything invoiced, ever. */
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  /** Late fees carried in `totalDue`, shown separately so they can be queried. */
  totalPenalty: number;
  /** Late fees the academy has written off across every plan. */
  totalPenaltyWaived: number;
  /** "Paid" only when there is something to pay and nothing outstanding. */
  overallStatus: "PAID" | "PARTIAL" | "UNPAID" | "NONE";
  /** The academy's own small print and who to ask, both set in Settings. */
  terms: string[];
  support: { email: string; phone: string; site: string };
  hasEmi: boolean;
  emi: {
    plan: string | null;
    interestPercent: number | null;
    /** Interest added over the sticker price across every EMI payment. */
    interestAmount: number;
    total: number;
    paid: number;
    pending: number;
    totalCount: number;
    paidCount: number;
    pendingCount: number;
    overdueCount: number;
    nextDueDate: string | null;
    nextDueAmount: number | null;
  };
  payments: StudentPaymentRow[];
}

export async function getStudentFees(userId: string): Promise<StudentFees> {
  const [payments, { settings }, accounts] = await Promise.all([
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        course: { select: { title: true } },
        installments: { orderBy: { installmentNo: "asc" } },
      },
    }),
    getSettings(),
    prisma.paymentAccount.findMany({
      select: { id: true, name: true, identifier: true, autoReconcile: true, kind: true },
    }),
  ]);

  const now = Date.now();
  const accById = new Map(accounts.map((a) => [a.id, a]));
  // Where a learner should pay a still-owed EMI: its own account, else the
  // plan's. A Razorpay (auto-reconciling) account needs nothing shown — paying
  // online updates it; any other account is settled by hand, so surface it.
  const payIntoFor = (
    accountId: string | null,
    paymentAccountId: string | null,
    settled: boolean,
  ): StudentInstallment["payInto"] => {
    if (settled) return null;
    const acc = accById.get(accountId ?? "") ?? accById.get(paymentAccountId ?? "");
    if (!acc || acc.autoReconcile) return null;
    return {
      name: acc.name,
      detail: acc.identifier ?? null,
      upi: acc.kind === "UPI_QR" && Boolean(acc.identifier),
    };
  };

  // Each plan's live position, by the same rule the office sees.
  const summaries = await Promise.all(payments.map((p) => summarise(p)));

  const rows: StudentPaymentRow[] = payments.map((p, idx) => ({
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    courseTitle: p.course?.title ?? null,
    amount: num(p.amount),
    discountAmount: num(p.discountAmount),
    netAmount: num(p.netAmount),
    currency: p.currency,
    status: p.status,
    method: p.method,
    type: p.type,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    emiPlan: p.emiPlan,
    interestPercent: p.interestPercent == null ? null : num(p.interestPercent),
    principalAmount: p.principalAmount == null ? null : num(p.principalAmount),
    installments: p.installments.map((i) => ({
      id: i.id,
      installmentNo: i.installmentNo,
      amount: num(i.amount),
      dueDate: i.dueDate.toISOString(),
      status: i.status,
      paidAt: i.paidAt ? i.paidAt.toISOString() : null,
      isOverdue: i.status !== "PAID" && i.dueDate.getTime() < now,
      paidAmount: num(i.paidAmount),
      penaltyAmount: i.penaltyWaived || p.penaltyWaived ? 0 : num(i.penaltyAmount),
      payInto: payIntoFor(
        i.accountId,
        p.accountId,
        i.status === "PAID" || i.status === "CANCELLED",
      ),
    })),
    // A pending link the learner can still settle themselves. Expired links and
    // ones already paid are not offered.
    payUrl:
      p.linkToken &&
      p.status !== "PAID" &&
      (!p.linkExpiresAt || p.linkExpiresAt.getTime() > now)
        ? `/pay/${p.linkToken}`
        : null,
    bookingAmount: num(p.bookingAmount),
    bookingAt: p.bookingAt ? p.bookingAt.toISOString() : null,
    penaltyAmount: summaries[idx].penalty,
    // What a waiver was worth: the charge that was written down against the
    // instalments, less whatever is still being charged. "Jab hum waive off kr
    // denge to usme reflect hona chahiye ki ye waived off amount hai."
    penaltyWaivedAmount:
      Math.round(
        (p.installments.reduce((sum, i) => sum + num(i.penaltyAmount), 0) -
          summaries[idx].penalty) *
          100,
      ) / 100,
    outstanding: summaries[idx].outstanding,
    paidAmount: summaries[idx].paid,
    // Online "Pay now" only for the default/Razorpay rail: an explicit account
    // must be the auto-reconciling one; with no account set, only a Razorpay
    // (online self-registered) payment qualifies. A manual UPI / cash account
    // is paid by hand, so the online button is hidden there.
    canPayOnline: (() => {
      const acc = accById.get(p.accountId ?? "");
      if (acc) return acc.autoReconcile;
      return p.provider === "RAZORPAY" || p.method === "ONLINE";
    })(),
  }));

  // Money. A refunded payment is deliberately counted as neither billed nor
  // paid — showing it as revenue the learner still owes would be wrong twice.
  const live = rows.filter((r) => r.status !== "REFUNDED" && r.status !== "FAILED");
  const totalBilled = live.reduce((sum, r) => sum + r.netAmount, 0);

  // An EMI payment is "paid" instalment by instalment; a one-off is paid or
  // not. A part payment counts for exactly what came in.
  // One rule for what counts as received, shared with the office's own view:
  // instalments, a full settlement, and money taken to hold the seat.
  const totalPaid = live.reduce((sum, r) => sum + r.paidAmount, 0);

  // Late fees are owed on top of the fee itself, so the learner sees the figure
  // that actually clears the account.
  const totalPenalty = live.reduce(
    (sum, r) => sum + r.installments.reduce((s, i) => s + i.penaltyAmount, 0),
    0,
  );

  const totalDue = Math.max(
    0,
    Math.round((totalBilled - totalPaid + totalPenalty) * 100) / 100,
  );

  const emiRows = live.filter((r) => r.installments.length > 0);
  const allInstallments = emiRows.flatMap((r) => r.installments);
  const paidInstallments = allInstallments.filter((i) => i.status === "PAID");
  const pendingInstallments = allInstallments
    .filter((i) => i.status !== "PAID")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // The newest EMI payment defines the plan on show — a learner with two is
  // rare, and the per-payment card carries its own terms anyway.
  const latestEmi = emiRows[0] ?? null;
  const interestAmount = emiRows.reduce(
    (sum, r) => sum + Math.max(0, r.netAmount - (r.principalAmount ?? r.netAmount)),
    0,
  );

  const overallStatus: StudentFees["overallStatus"] =
    totalBilled === 0
      ? "NONE"
      : totalDue === 0
        ? "PAID"
        : totalPaid > 0
          ? "PARTIAL"
          : "UNPAID";

  return {
    totalBilled: Math.round(totalBilled * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalDue,
    totalPenalty: Math.round(totalPenalty * 100) / 100,
    totalPenaltyWaived:
      Math.round(live.reduce((s, r) => s + r.penaltyWaivedAmount, 0) * 100) / 100,
    overallStatus,
    terms: settings.feeTerms
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    support: {
      email: settings.feeSupportEmail || settings.supportEmail,
      phone: settings.feeSupportPhone || settings.contactPhone,
      site: settings.feeSupportSite,
    },
    hasEmi: emiRows.length > 0,
    emi: {
      plan: latestEmi?.emiPlan ?? null,
      interestPercent:
        latestEmi?.interestPercent ??
        (settings.emiEnabled ? settings.emiInterestPercent : null),
      interestAmount: Math.round(interestAmount * 100) / 100,
      total: Math.round(allInstallments.reduce((s, i) => s + i.amount, 0) * 100) / 100,
      paid: Math.round(paidInstallments.reduce((s, i) => s + i.amount, 0) * 100) / 100,
      pending:
        Math.round(pendingInstallments.reduce((s, i) => s + i.amount, 0) * 100) / 100,
      totalCount: allInstallments.length,
      paidCount: paidInstallments.length,
      pendingCount: pendingInstallments.length,
      overdueCount: pendingInstallments.filter((i) => i.isOverdue).length,
      nextDueDate: pendingInstallments[0]?.dueDate ?? null,
      nextDueAmount: pendingInstallments[0]?.amount ?? null,
    },
    payments: rows,
  };
}

const DAY = 86_400_000;

/**
 * The one thing a learner most needs reminding about on their dashboard — the
 * most urgent unpaid plan, or null when nothing is owed. Drives the dashboard
 * banner and the sign-in popup: "Student dashboard pr bhi pending payment ka
 * dikhna chahiye… due date nikalne ke baad red… popup bhi aana chahiye login
 * hote hi… 3 din pehle reminder bhi."
 */
export interface StudentPaymentAlert {
  /** Everything still owed across every plan, late fees included. */
  totalDue: number;
  /** The most urgent plan — what the banner and popup name. */
  paymentId: string;
  invoiceNumber: string;
  courseTitle: string | null;
  nextDueAmount: number;
  nextDueDate: string | null;
  isOverdue: boolean;
  /** Whole days until the next due date; negative when overdue, null when undated. */
  daysUntilDue: number | null;
  penaltyAmount: number;
}

export async function getStudentPaymentAlert(
  userId: string,
): Promise<StudentPaymentAlert | null> {
  const payments = await prisma.payment.findMany({
    where: {
      userId,
      status: {
        notIn: ["REFUNDED", "PARTIALLY_REFUNDED", "FAILED", "DISCONTINUED"],
      },
    },
    include: {
      course: { select: { title: true } },
      installments: { orderBy: { installmentNo: "asc" } },
    },
  });
  if (payments.length === 0) return null;

  const summaries = await Promise.all(payments.map((p) => summarise(p)));
  const now = Date.now();

  let totalDue = 0;
  let best: StudentPaymentAlert | null = null;
  // Overdue plans come first (most days late wins), then the soonest due.
  const rank = (c: StudentPaymentAlert) =>
    c.isOverdue
      ? -1e9 + (c.daysUntilDue ?? 0)
      : (c.daysUntilDue ?? 1e9);

  payments.forEach((p, i) => {
    const s = summaries[i];
    if (s.outstanding <= 0) return;
    totalDue += s.outstanding;
    const dueMs = s.nextDueDate ? s.nextDueDate.getTime() : null;
    const isOverdue = (dueMs != null && dueMs < now) || s.daysLate > 0;
    const candidate: StudentPaymentAlert = {
      totalDue: 0,
      paymentId: p.id,
      invoiceNumber: p.invoiceNumber,
      courseTitle: p.course?.title ?? null,
      nextDueAmount: s.nextDueAmount || s.outstanding,
      nextDueDate: s.nextDueDate ? s.nextDueDate.toISOString() : null,
      isOverdue,
      daysUntilDue: dueMs != null ? Math.ceil((dueMs - now) / DAY) : null,
      penaltyAmount: s.penalty,
    };
    if (!best || rank(candidate) < rank(best)) best = candidate;
  });

  if (!best) return null;
  (best as StudentPaymentAlert).totalDue = Math.round(totalDue * 100) / 100;
  return best;
}
