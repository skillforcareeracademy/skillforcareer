import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { validateCoupon } from "@/server/services/coupon-service";
import type { RecordPaymentInput, RefundInput } from "@/lib/validations/payment";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function uniqueInvoice(year: number): Promise<string> {
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

// ── Reads ────────────────────────────────────────────────────────────────────

export interface PaymentListQuery {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  status?: string;
  provider?: string;
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
      netAmount: num(p.netAmount),
      currency: p.currency,
      status: p.status,
      provider: p.provider,
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
      refunds: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!p) throw AppError.notFound("Payment not found.");

  return {
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    student: p.user,
    courseTitle: p.course?.title ?? null,
    amount: num(p.amount),
    discountAmount: num(p.discountAmount),
    taxAmount: num(p.taxAmount),
    netAmount: num(p.netAmount),
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    type: p.type,
    providerPaymentId: p.providerPaymentId,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
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
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
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

  const invoiceNumber = await uniqueInvoice(new Date().getFullYear());
  const payment = await prisma.payment.create({
    data: {
      userId: input.userId,
      courseId: input.courseId || null,
      couponId,
      invoiceNumber,
      amount: new Prisma.Decimal(input.amount),
      discountAmount: new Prisma.Decimal(discountAmount),
      taxAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(net),
      currency: "INR",
      status: input.status,
      provider: input.provider,
      type: input.type,
      paidAt: input.status === "PAID" ? new Date() : null,
    },
    select: { id: true },
  });

  if (couponId) {
    await prisma.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
  }

  // EMI → generate a monthly installment schedule over the net amount.
  if (input.type === "EMI" && input.installments && input.installments >= 2) {
    const n = input.installments;
    const per = Math.floor((net / n) * 100) / 100;
    const rows = Array.from({ length: n }, (_, i) => {
      const due = new Date();
      due.setMonth(due.getMonth() + i + 1);
      // Last installment absorbs the rounding remainder.
      const amount = i === n - 1 ? Math.round((net - per * (n - 1)) * 100) / 100 : per;
      return {
        paymentId: payment.id,
        installmentNo: i + 1,
        amount: new Prisma.Decimal(amount),
        dueDate: due,
        status: "SCHEDULED" as const,
      };
    });
    await prisma.installment.createMany({ data: rows });
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
