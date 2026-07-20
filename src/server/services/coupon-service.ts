import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { CouponInput } from "@/lib/validations/coupon";

// ── Validation / application ─────────────────────────────────────────────────

export interface CouponResult {
  valid: boolean;
  reason?: string;
  code?: string;
  couponId?: string;
  discount?: number; // rupees off
  netAmount?: number; // amount - discount
}

function toDate(s?: string): Date | null {
  return s ? new Date(s) : null;
}

/** Validate a coupon code for a given amount/course and compute the discount. */
export async function validateCoupon(
  code: string,
  amount: number,
  courseId?: string,
): Promise<CouponResult> {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon || !coupon.isActive) return { valid: false, reason: "Invalid coupon code." };

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) return { valid: false, reason: "This coupon isn't active yet." };
  if (coupon.expiresAt && coupon.expiresAt < now) return { valid: false, reason: "This coupon has expired." };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, reason: "This coupon has reached its usage limit." };
  }
  if (coupon.courseId && courseId && coupon.courseId !== courseId) {
    return { valid: false, reason: "This coupon doesn't apply to this course." };
  }
  const min = coupon.minAmount ? coupon.minAmount.toNumber() : 0;
  if (amount < min) {
    return { valid: false, reason: `Minimum order of ₹${min.toLocaleString("en-IN")} required.` };
  }

  let discount =
    coupon.type === "PERCENTAGE" ? (amount * coupon.value.toNumber()) / 100 : coupon.value.toNumber();
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount.toNumber());
  discount = Math.min(Math.round(discount * 100) / 100, amount);

  return {
    valid: true,
    code: coupon.code,
    couponId: coupon.id,
    discount,
    netAmount: Math.round((amount - discount) * 100) / 100,
  };
}

// ── Admin CRUD ───────────────────────────────────────────────────────────────

export interface CouponListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string; // ACTIVE | INACTIVE | EXPIRED
}

export async function listCouponsAdmin(q: CouponListQuery) {
  const and: Prisma.CouponWhereInput[] = [];
  if (q.search) and.push({ code: { contains: q.search } });
  if (q.status === "ACTIVE") and.push({ isActive: true });
  if (q.status === "INACTIVE") and.push({ isActive: false });
  if (q.status === "EXPIRED") and.push({ expiresAt: { lt: new Date() } });
  const where: Prisma.CouponWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.coupon.count({ where }),
    prisma.coupon.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { course: { select: { title: true } } },
    }),
  ]);

  const now = new Date();
  return {
    total,
    coupons: rows.map((c) => ({
      id: c.id,
      code: c.code,
      type: c.type,
      value: c.value.toNumber(),
      maxDiscount: c.maxDiscount ? c.maxDiscount.toNumber() : null,
      minAmount: c.minAmount ? c.minAmount.toNumber() : null,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      courseId: c.courseId,
      courseTitle: c.course?.title ?? null,
      isActive: c.isActive,
      isExpired: Boolean(c.expiresAt && c.expiresAt < now),
      startsAt: c.startsAt ? c.startsAt.toISOString() : null,
      expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    })),
  };
}

export interface CouponStats {
  total: number;
  active: number;
  redemptions: number;
}

export async function couponStats(): Promise<CouponStats> {
  const [total, active, agg] = await Promise.all([
    prisma.coupon.count(),
    prisma.coupon.count({ where: { isActive: true } }),
    prisma.coupon.aggregate({ _sum: { usedCount: true } }),
  ]);
  return { total, active, redemptions: agg._sum.usedCount ?? 0 };
}

function dataFrom(input: CouponInput) {
  return {
    type: input.type,
    value: new Prisma.Decimal(input.value),
    maxDiscount: input.maxDiscount != null ? new Prisma.Decimal(input.maxDiscount) : null,
    minAmount: input.minAmount != null ? new Prisma.Decimal(input.minAmount) : null,
    maxUses: input.maxUses ?? null,
    courseId: input.courseId || null,
    isActive: input.isActive,
    startsAt: toDate(input.startsAt),
    expiresAt: toDate(input.expiresAt),
  };
}

export async function createCoupon(input: CouponInput): Promise<string> {
  const existing = await prisma.coupon.findUnique({ where: { code: input.code }, select: { id: true } });
  if (existing) throw AppError.badRequest("A coupon with this code already exists.");
  const coupon = await prisma.coupon.create({
    data: { code: input.code, ...dataFrom(input) },
    select: { id: true },
  });
  return coupon.id;
}

export async function updateCoupon(id: string, input: CouponInput): Promise<void> {
  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!existing) throw AppError.notFound("Coupon not found.");
  if (input.code !== existing.code) {
    const clash = await prisma.coupon.findUnique({ where: { code: input.code }, select: { id: true } });
    if (clash) throw AppError.badRequest("A coupon with this code already exists.");
  }
  await prisma.coupon.update({ where: { id }, data: { code: input.code, ...dataFrom(input) } });
}

export async function setCouponActive(id: string, isActive: boolean): Promise<void> {
  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Coupon not found.");
  await prisma.coupon.update({ where: { id }, data: { isActive } });
}

export async function deleteCoupon(id: string): Promise<void> {
  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Coupon not found.");
  await prisma.coupon.delete({ where: { id } });
}

export async function getCouponForEdit(id: string) {
  const c = await prisma.coupon.findUnique({ where: { id } });
  if (!c) throw AppError.notFound("Coupon not found.");
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: c.value.toNumber(),
    maxDiscount: c.maxDiscount ? c.maxDiscount.toNumber() : null,
    minAmount: c.minAmount ? c.minAmount.toNumber() : null,
    maxUses: c.maxUses,
    courseId: c.courseId,
    isActive: c.isActive,
    startsAt: c.startsAt ? c.startsAt.toISOString().slice(0, 10) : "",
    expiresAt: c.expiresAt ? c.expiresAt.toISOString().slice(0, 10) : "",
  };
}
