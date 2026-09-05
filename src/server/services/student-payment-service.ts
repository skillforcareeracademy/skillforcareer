import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSettings } from "./settings-service";

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
}

export interface StudentFees {
  /** Everything invoiced, ever. */
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  /** "Paid" only when there is something to pay and nothing outstanding. */
  overallStatus: "PAID" | "PARTIAL" | "UNPAID" | "NONE";
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

  const rows: StudentPaymentRow[] = payments.map((p) => ({
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
    })),
    // A pending link the learner can still settle themselves. Expired links and
    // ones already paid are not offered.
    payUrl:
      p.linkToken &&
      p.status !== "PAID" &&
      (!p.linkExpiresAt || p.linkExpiresAt.getTime() > now)
        ? `/pay/${p.linkToken}`
        : null,
  }));

  // Money. A refunded payment is deliberately counted as neither billed nor
  // paid — showing it as revenue the learner still owes would be wrong twice.
  const live = rows.filter((r) => r.status !== "REFUNDED" && r.status !== "FAILED");
  const totalBilled = live.reduce((sum, r) => sum + r.netAmount, 0);

  // An EMI payment is "paid" instalment by instalment; a one-off is paid or not.
  const totalPaid = live.reduce((sum, r) => {
    if (r.installments.length > 0) {
      return sum + r.installments.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
    }
    return r.status === "PAID" ? sum + r.netAmount : sum;
  }, 0);

  const totalDue = Math.max(0, Math.round((totalBilled - totalPaid) * 100) / 100);

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
    overallStatus,
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
