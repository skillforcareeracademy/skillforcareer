import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { PaymentAccountInput } from "@/lib/validations/payment";

/**
 * Configurable receiving accounts. The client collects money through more than
 * one channel — an official Razorpay account that reconciles automatically, plus
 * personal QR/UPI or cash that an admin records by hand. `autoReconcile` is
 * derived from the kind (RAZORPAY) and drives whether the webhook may touch a
 * payment or an admin must.
 */

function autoReconcileFor(kind: PaymentAccountInput["kind"]): boolean {
  return kind === "RAZORPAY";
}

export interface PaymentAccountRow {
  id: string;
  name: string;
  kind: string;
  identifier: string | null;
  autoReconcile: boolean;
  isActive: boolean;
  notes: string | null;
  paymentCount: number;
}

export async function listPaymentAccounts(): Promise<PaymentAccountRow[]> {
  const rows = await prisma.paymentAccount.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { payments: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    identifier: a.identifier,
    autoReconcile: a.autoReconcile,
    isActive: a.isActive,
    notes: a.notes,
    paymentCount: a._count.payments,
  }));
}

/** Active accounts for the record-payment picker. */
export async function listAccountsForSelect() {
  const rows = await prisma.paymentAccount.findMany({
    where: { isActive: true },
    orderBy: [{ autoReconcile: "desc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, autoReconcile: true },
  });
  return rows;
}

/** The account a Razorpay online payment should be booked against, if any. */
export async function getRazorpayAccount() {
  return prisma.paymentAccount.findFirst({
    where: { kind: "RAZORPAY", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}

export async function createPaymentAccount(input: PaymentAccountInput): Promise<string> {
  const account = await prisma.paymentAccount.create({
    data: {
      name: input.name,
      kind: input.kind,
      identifier: input.identifier || null,
      autoReconcile: autoReconcileFor(input.kind),
      isActive: input.isActive,
      notes: input.notes || null,
    },
    select: { id: true },
  });
  return account.id;
}

export async function updatePaymentAccount(id: string, input: PaymentAccountInput): Promise<void> {
  const existing = await prisma.paymentAccount.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Account not found.");
  await prisma.paymentAccount.update({
    where: { id },
    data: {
      name: input.name,
      kind: input.kind,
      identifier: input.identifier || null,
      autoReconcile: autoReconcileFor(input.kind),
      isActive: input.isActive,
      notes: input.notes || null,
    },
  });
}

export async function deletePaymentAccount(id: string): Promise<void> {
  const account = await prisma.paymentAccount.findUnique({
    where: { id },
    select: { _count: { select: { payments: true } } },
  });
  if (!account) throw AppError.notFound("Account not found.");
  if (account._count.payments > 0) {
    throw AppError.badRequest(
      "This account has payments booked against it. Deactivate it instead of deleting.",
    );
  }
  await prisma.paymentAccount.delete({ where: { id } });
}
