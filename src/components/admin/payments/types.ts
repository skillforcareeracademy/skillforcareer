/**
 * The shape `/api/payments/{id}` answers with.
 *
 * It lives here rather than beside any one screen because three of them read
 * it — the list (to fill the edit dialog), the detail sheet, and the dialog
 * itself — and a client component must not import the service that produces it,
 * which would drag Prisma into the browser bundle.
 */

export interface PaymentRefund {
  id: string;
  amount: number;
  reason: string | null;
  status: string;
  createdAt: string;
}

export interface PaymentInstallment {
  id: string;
  installmentNo: number;
  amount: number;
  dueDate: string;
  status: string;
  paidAt: string | null;
  /** Part payments: less than `amount` leaves the rest owing. */
  paidAmount: number;
  method: string | null;
  /** What being late has cost, after any waiver. */
  penaltyAmount: number;
  penaltyWaived: boolean;
  note: string | null;
}

/** Where a plan stands: what is owed, and how late it is. */
export interface PaymentSummary {
  payable: number;
  paid: number;
  /** Of `paid`, what came in as a booking amount. */
  booking: number;
  penalty: number;
  outstanding: number;
  nextDueDate: string | null;
  nextDueAmount: number;
  daysLate: number;
}

export interface PaymentDetail {
  id: string;
  invoiceNumber: string;
  userId: string;
  courseId: string | null;
  student: { name: string; email: string; avatarUrl: string | null };
  courseTitle: string | null;
  purpose: string | null;
  amount: number;
  discountAmount: number;
  taxAmount: number;
  netAmount: number;
  currency: string;
  status: string;
  provider: string;
  method: string | null;
  account: { name: string; kind: string } | null;
  type: string;
  emiPlan: string | null;
  interestPercent: number | null;
  principalAmount: number | null;
  providerPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
  /** Money taken to hold the seat, before the rest was settled. */
  bookingAmount: number | null;
  bookingAt: string | null;

  graceDays: number | null;
  penaltyPercent: number | null;
  penaltyFlat: number | null;
  penaltyWaived: boolean;
  /** The terms actually in force, platform defaults filled in. */
  effectiveTerms: {
    graceDays: number;
    penaltyPercent: number;
    penaltyFlat: number;
  };
  firstPaymentAt: string | null;
  lastPaymentAt: string | null;
  notes: string | null;

  summary: PaymentSummary;
  installments: PaymentInstallment[];
  refunds: PaymentRefund[];
  refundedTotal: number;
}
