import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { listCouponsAdmin, couponStats } from "@/server/services/coupon-service";
import { listCoursesForSelect } from "@/server/services/payment-service";
import { CouponsClient } from "@/components/admin/coupons/coupons-client";

export const metadata: Metadata = { title: "Coupons" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.MANAGE_PAYMENTS);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 12,
    search: str(sp.search),
    status: str(sp.status),
  };

  const [{ coupons, total }, stats, courses] = await Promise.all([
    listCouponsAdmin(query),
    couponStats(),
    listCoursesForSelect(),
  ]);

  return <CouponsClient coupons={coupons} total={total} query={query} stats={stats} courses={courses} />;
}
