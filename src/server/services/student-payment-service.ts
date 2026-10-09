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
  const [payments, { settings }] = await Promise.all([
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        course: { select: { title: true } },
        installments: { orderBy: { installmentNo: "asc" } },
      },
    }),
    getSettings(),
  ]);

  const now = Date.now();

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
