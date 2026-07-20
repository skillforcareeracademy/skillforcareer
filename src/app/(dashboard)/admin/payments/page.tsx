import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listPaymentsAdmin,
  paymentStats,
  listUsersForSelect,
  listCoursesForSelect,
} from "@/server/services/payment-service";
import { PaymentsClient } from "@/components/admin/payments/payments-client";

export const metadata: Metadata = { title: "Payments" };

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 10,
    search: str(sp.search),
    courseId: str(sp.course),
    status: str(sp.status),
    provider: str(sp.provider),
  };

  const [{ payments, total }, stats, users, courses] = await Promise.all([
    listPaymentsAdmin(query),
    paymentStats(),
    listUsersForSelect(),
    listCoursesForSelect(),
  ]);

  return (
    <PaymentsClient
      payments={payments}
      total={total}
      query={query}
      stats={stats}
      users={users}
      courses={courses}
    />
  );
}
